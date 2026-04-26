import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import Navigation from '../components/Navigation'
import PageTitle from '../components/PageTitle'
import HelpTip from '../components/HelpTip'
import { useSession } from '../context/SessionContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import AiReviewModal from '../components/AiReviewModal'
import type { AiAnalysisResult, AiDataBlock } from '../types'

// --- Types ---

interface ProfileData {
  row_count?: number
  column_count?: number
  [key: string]: unknown
}

interface ConversionResult {
  cleanCsv: string
  profileJson: ProfileData
  schemaSql: string
  relationshipsJson: unknown | null
  zipBlob: Blob
  zipFileName: string
}

interface ConvertOptions {
  sheet: string       // used for CSV files only
  no_unpivot: boolean
  keep_dupes: boolean
  header_row: string
}

interface AggregateRow {
  rowIndex: number   // 0-based index into parsed rows array
  row: string[]
  reason: string
}

interface SheetConversion {
  sheet: string       // sheet name passed to API
  result: ConversionResult
  aggregateRows: AggregateRow[]
  excludedRows: Set<number>
  excludedCols: Set<number>
}

// --- CSV Parsing ---

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/)
  const parsed: string[][] = []

  for (const line of lines) {
    if (line.trim() === '') continue
    const row: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { row.push(current); current = '' }
        else current += ch
      }
    }
    row.push(current)
    parsed.push(row)
  }

  if (parsed.length === 0) return { headers: [], rows: [] }
  return { headers: parsed[0], rows: parsed.slice(1) }
}

function toCSVString(headers: string[], rows: string[][]): string {
  const escape = (val: string) =>
    val.includes(',') || val.includes('"') || val.includes('\n')
      ? `"${val.replace(/"/g, '""')}"`
      : val
  return [headers, ...rows].map(row => row.map(escape).join(',')).join('\n')
}

// --- Aggregate Row Detection ---

const AGGREGATE_PATTERN = /^(grand\s+)?(sub\s*total|total|subtotal|sum|average|avg|count|net\s+total|overall|totals?)\b/i

function detectAggregateRows(headers: string[], rows: string[][]): AggregateRow[] {
  const found: AggregateRow[] = []
  rows.forEach((row, i) => {
    for (let col = 0; col < row.length; col++) {
      const val = (row[col] ?? '').trim()
      if (val !== '' && AGGREGATE_PATTERN.test(val)) {
        found.push({
          rowIndex: i,
          row,
          reason: `"${val}" in column "${headers[col] ?? `Col ${col + 1}`}"`,
        })
        break
      }
    }
  })
  return found
}

// --- Helpers ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectDataBlocks(rows: string[][]): AiDataBlock[] {
  const isEmpty = (row: string[]) => row.every(cell => !cell || !cell.trim())
  const blocks: AiDataBlock[] = []
  let blockStart = -1
  for (let i = 0; i <= rows.length; i++) {
    const empty = i === rows.length || isEmpty(rows[i])
    if (!empty && blockStart === -1) {
      blockStart = i
    } else if (empty && blockStart !== -1) {
      const blockRows = rows.slice(blockStart, i)
      blocks.push({
        startRow: blockStart + 1,
        endRow: i,
        rowCount: blockRows.length,
        sampleRows: blockRows.slice(0, 5),
      })
      blockStart = -1
    }
  }
  return blocks
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// --- Main Component ---


export default function CsvOptimizerPlusPage() {
  const navigate = useNavigate()
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: googleTokenStatus, refetch: refetchGoogleStatus } = useQuery({
    queryKey: ['google-token-status', session?.email],
    queryFn: () => pocketbaseService.getGoogleTokenStatus(session!.email),
    enabled: !!session?.email,
    refetchOnMount: 'always',
  })
  const googleConnected = googleTokenStatus?.connected ?? false

  const { data: microsoftTokenStatus, refetch: refetchMicrosoftStatus } = useQuery({
    queryKey: ['microsoft-token-status', session?.email],
    queryFn: () => pocketbaseService.getMicrosoftTokenStatus(session!.email),
    enabled: !!session?.email,
    refetchOnMount: 'always',
  })
  const microsoftConnected = microsoftTokenStatus?.connected ?? false

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === '1') {
      refetchGoogleStatus()
      toast.success('Google account connected')
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('ms_connected') === '1') {
      refetchMicrosoftStatus()
      toast.success('OneDrive connected')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sheet detection (Excel only)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheets, setSelectedSheets] = useState<string[]>([])

  // Page detection (PDF only)
  const [pdfPages, setPdfPages] = useState<{ page_num: number; table_count: number }[]>([])
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [isFetchingPdfInfo, setIsFetchingPdfInfo] = useState(false)

  // Upload progress overlay
  type OverlayStep = { label: string; status: 'pending' | 'active' | 'done' | 'error' }
  const [uploadOverlay, setUploadOverlay] = useState<{ steps: OverlayStep[]; error: string | null } | null>(null)

  // Per-sheet results (replaces single result/aggregateRows/excludedRows)
  const [sheetConversions, setSheetConversions] = useState<SheetConversion[]>([])
  // AI Review state
  const [isAnalyzing, setIsAnalyzing] = useState<Record<string, boolean>>({})
  const [aiReviewOpen, setAiReviewOpen] = useState(false)
  const [aiReviewConv, setAiReviewConv] = useState<SheetConversion | null>(null)
  const [aiReviewPlan, setAiReviewPlan] = useState<AiAnalysisResult | null>(null)
  const [aiReviewCsvText, setAiReviewCsvText] = useState('')
  const [aiReviewFileName, setAiReviewFileName] = useState('')
  const [cleanedCsvs, setCleanedCsvs] = useState<Record<string, string>>({})

  // Expanded sections keyed by "<sheet>.<section>"
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const [options, setOptions] = useState<ConvertOptions>({
    sheet: '0',
    no_unpivot: true,
    keep_dupes: false,
    header_row: '',
  })

  const [gsheetsInputOpen, setGsheetsInputOpen] = useState(false)
  const [gsheetsUrl, setGsheetsUrl] = useState('')
  const [isFetchingSheet, setIsFetchingSheet] = useState(false)
  const lastGsheetsId = useRef<string | null>(null)

  const [onedriveInputOpen, setOnedriveInputOpen] = useState(false)
  const [onedriveUrl, setOnedriveUrl] = useState('')
  const [isFetchingOnedrive, setIsFetchingOnedrive] = useState(false)
  const lastOnedriveUrl = useRef<string | null>(null)

  const isExcel = selectedFile ? /\.(xlsx?|xlsm)$/i.test(selectedFile.name) : false
  const isPdf = selectedFile ? /\.pdf$/i.test(selectedFile.name) : false
  const hasResults = sheetConversions.length > 0

  function parseGoogleSheetId(input: string): string | null {
    const trimmed = input.trim()
    // Full URL: extract /d/{id}/
    const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (urlMatch) return urlMatch[1]
    // Bare ID (no slashes, reasonable length)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed
    return null
  }

  const handleConnectGoogle = async () => {
    if (!session?.email) return
    try {
      const url = await pocketbaseService.getGoogleAuthUrl(session.email)
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get auth URL')
    }
  }

  const handleDisconnectGoogle = async () => {
    if (!session?.email) return
    try {
      await pocketbaseService.disconnectGoogle(session.email)
      queryClient.invalidateQueries({ queryKey: ['google-token-status'] })
      toast.success('Google account disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const handleFetchGoogleSheet = async () => {
    const sheetId = parseGoogleSheetId(gsheetsUrl)
    if (!sheetId) {
      toast.error('Invalid Google Sheet URL or ID')
      return
    }
    setIsFetchingSheet(true)
    try {
      let csvText: string
      if (googleConnected && session?.email) {
        csvText = await pocketbaseService.fetchGoogleSheetCsv(session.email, sheetId)
      } else {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
        const response = await axios.get(exportUrl, { responseType: 'text' })
        csvText = response.data
      }
      const file = new File([csvText], `google_sheet_${sheetId}.csv`, { type: 'text/csv' })
      setSelectedFile(file)
      setSourceName(`google_sheet_${sheetId}`)
      setSheetConversions([])
      lastGsheetsId.current = sheetId
      lastOnedriveUrl.current = null
      setGsheetsInputOpen(false)
      setGsheetsUrl('')
      toast.success('Google Sheet loaded successfully')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: unknown }; message?: string }
      let detail = err instanceof Error ? err.message : String(err)
      const raw = axiosErr?.response?.data
      if (typeof raw === 'string') {
        try { detail = (JSON.parse(raw) as { error?: string }).error ?? detail } catch { detail = raw.slice(0, 200) || detail }
      } else if (raw && typeof raw === 'object' && 'error' in raw) {
        detail = String((raw as { error: unknown }).error)
      }
      toast.error(googleConnected
        ? `Failed to fetch Google Sheet: ${detail}`
        : 'Failed to fetch Google Sheet. Make sure it is shared publicly or connect your Google account.')
    } finally {
      setIsFetchingSheet(false)
    }
  }

  const handleConnectMicrosoft = async () => {
    if (!session?.email) return
    try {
      const url = await pocketbaseService.getMicrosoftAuthUrl(session.email)
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get auth URL')
    }
  }

  const handleDisconnectMicrosoft = async () => {
    if (!session?.email) return
    try {
      await pocketbaseService.disconnectMicrosoft(session.email)
      queryClient.invalidateQueries({ queryKey: ['microsoft-token-status'] })
      toast.success('OneDrive disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const handleFetchOneDriveFile = async () => {
    if (!onedriveUrl.trim()) {
      toast.error('Please enter a OneDrive share URL')
      return
    }
    if (!microsoftConnected || !session?.email) {
      toast.error('Please connect your Microsoft account first')
      return
    }
    setIsFetchingOnedrive(true)
    try {
      const { data, fileName } = await pocketbaseService.fetchOneDriveFileCsv(session.email, onedriveUrl.trim())
      const file = new File([data], fileName, { type: 'application/octet-stream' })
      setSelectedFile(file)
      setSourceName(fileName.replace(/\.(csv|xlsx?|xlsm)$/i, ''))
      setSheetConversions([])
      lastOnedriveUrl.current = onedriveUrl.trim()
      lastGsheetsId.current = null
      setOnedriveInputOpen(false)
      setOnedriveUrl('')
      toast.success('OneDrive file loaded successfully')
    } catch {
      toast.error('Failed to fetch OneDrive file. Make sure the link is a valid share URL and you have access.')
    } finally {
      setIsFetchingOnedrive(false)
    }
  }

  const toggleSection = (key: string) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setSourceName(file.name.replace(/\.(csv|xlsx?|xlsm|pdf)$/i, ''))
    setSheetConversions([])
    setExpandedSections({})
    setPdfPages([])
    setSelectedPages([])

    if (/\.(xlsx?|xlsm)$/i.test(file.name)) {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { bookSheets: true })
      setSheetNames(workbook.SheetNames)
      setSelectedSheets([...workbook.SheetNames])
    } else if (/\.pdf$/i.test(file.name)) {
      setSheetNames([])
      setSelectedSheets([])
      setIsFetchingPdfInfo(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await axios.post('/excel-to-sql/pdf-info', formData)
        const pages: { page_num: number; table_count: number }[] = res.data.pages
        setPdfPages(pages)
        setSelectedPages(pages.filter(p => p.table_count > 0).map(p => p.page_num))
      } catch (err) {
        let message = 'Failed to read PDF page info.'
        if (axios.isAxiosError(err) && err.response?.data?.detail) {
          message = err.response.data.detail
        }
        toast.error(message)
        setSelectedFile(null)
      } finally {
        setIsFetchingPdfInfo(false)
      }
    } else {
      setSheetNames([])
      setSelectedSheets([])
    }
  }

  const toggleSheetSelected = (name: string) => {
    setSelectedSheets(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    )
  }

  const toggleAllSheets = () => {
    setSelectedSheets(prev => prev.length === sheetNames.length ? [] : [...sheetNames])
  }

  const togglePageSelected = (pageNum: number) => {
    setSelectedPages(prev =>
      prev.includes(pageNum) ? prev.filter(p => p !== pageNum) : [...prev, pageNum]
    )
  }

  const toggleAllPages = () => {
    const selectablePages = pdfPages.filter(p => p.table_count > 0).map(p => p.page_num)
    setSelectedPages(prev => prev.length === selectablePages.length ? [] : selectablePages)
  }

  const handleConvert = async () => {
    if (!selectedFile) return

    setIsConverting(true)
    setSheetConversions([])
    setExpandedSections({})
    setCleanedCsvs({})
    setIsAnalyzing({})

    const newConversions: SheetConversion[] = []

    // Build list of "jobs": for PDF use page numbers, for Excel/CSV use sheet names
    type Job = { key: string; params: URLSearchParams }
    let jobs: Job[]

    if (isPdf) {
      jobs = selectedPages.map(pageNum => {
        const params = new URLSearchParams()
        params.set('page', String(pageNum))
        if (options.no_unpivot) params.set('no_unpivot', 'true')
        if (options.keep_dupes) params.set('keep_dupes', 'true')
        if (options.header_row !== '') params.set('header_row', options.header_row)
        return { key: `page_${pageNum}`, params }
      })
    } else {
      // For CSV files fall back to the manual sheet option; for Excel use checkboxes
      const sheets = sheetNames.length > 0 ? selectedSheets : [options.sheet || '0']
      jobs = sheets.map(sheet => {
        const params = new URLSearchParams()
        params.set('sheet', sheet)
        if (options.no_unpivot) params.set('no_unpivot', 'true')
        if (options.keep_dupes) params.set('keep_dupes', 'true')
        if (options.header_row !== '') params.set('header_row', options.header_row)
        return { key: sheet, params }
      })
    }

    for (const job of jobs) {
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const response = await axios.post(`/excel-to-sql/convert?${job.params.toString()}`, formData, {
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        const zip = await JSZip.loadAsync(response.data)

        let cleanCsv = ''
        let profileJson: ProfileData = {}
        let schemaSql = ''
        let relationshipsJson: unknown | null = null

        for (const [filename, fileObj] of Object.entries(zip.files)) {
          if (filename.endsWith('_clean.csv')) {
            cleanCsv = await fileObj.async('string')
          } else if (filename.endsWith('_profile.json')) {
            const text = await fileObj.async('string')
            try { profileJson = JSON.parse(text) } catch { profileJson = {} }
          } else if (filename.endsWith('_schema.sql')) {
            schemaSql = await fileObj.async('string')
          } else if (filename.endsWith('_relationships.json')) {
            const text = await fileObj.async('string')
            try { relationshipsJson = JSON.parse(text) } catch { relationshipsJson = null }
          }
        }

        const zipBlob = new Blob([response.data], { type: 'application/zip' })
        const stem = selectedFile.name.replace(/\.(csv|xlsx?|xlsm|pdf)$/i, '')
        const keySuffix = jobs.length > 1 ? `_${job.key.replace(/[^a-zA-Z0-9]/g, '_')}` : ''

        const convResult: ConversionResult = {
          cleanCsv, profileJson, schemaSql, relationshipsJson, zipBlob,
          zipFileName: `${stem}${keySuffix}_sql_ready.zip`,
        }

        const { headers, rows } = parseCSV(cleanCsv)
        const aggregateRows = detectAggregateRows(headers, rows)

        newConversions.push({
          sheet: job.key,
          result: convResult,
          aggregateRows,
          excludedRows: new Set(aggregateRows.map(r => r.rowIndex)),
          excludedCols: new Set<number>(),
        })

        // Show progress as each job completes
        setSheetConversions([...newConversions])
        setExpandedSections(prev => ({
          ...prev,
          [`${job.key}.profile`]: false,
          [`${job.key}.schema`]: false,
          [`${job.key}.relationships`]: false,
          [`${job.key}.aggregates`]: true,
        }))
      } catch (err: unknown) {
        let message = jobs.length > 1
          ? `${isPdf ? 'Page' : 'Sheet'} "${job.key}": conversion failed.`
          : 'Conversion failed. Make sure the Docker API is running on port 8000.'
        if (axios.isAxiosError(err)) {
          if (err.response) {
            try {
              const text = new TextDecoder().decode(err.response.data as ArrayBuffer)
              const parsed = JSON.parse(text)
              message = parsed.detail || message
            } catch {
              message = jobs.length > 1
                ? `${isPdf ? 'Page' : 'Sheet'} "${job.key}": server error ${err.response.status}`
                : `Server error ${err.response.status}`
            }
          } else if (err.code === 'ECONNREFUSED' || err.message.includes('Network')) {
            message = 'Cannot connect to the converter API. Start it with: docker compose up -d'
          }
        }
        toast.error(message, { duration: 6000 })
      }
    }

    setIsConverting(false)
  }

  // --- Per-sheet helpers ---

  const getActiveCleanCsv = (conv: SheetConversion): string => {
    if (!conv.result.cleanCsv) return ''
    if (conv.excludedRows.size === 0 && conv.excludedCols.size === 0) return conv.result.cleanCsv
    const { headers, rows } = parseCSV(conv.result.cleanCsv)
    const keepCols = headers.map((_, i) => !conv.excludedCols.has(i))
    const filteredHeaders = headers.filter((_, i) => keepCols[i])
    const filteredRows = rows
      .filter((_, i) => !conv.excludedRows.has(i))
      .map(row => row.filter((_, i) => keepCols[i]))
    return toCSVString(filteredHeaders, filteredRows)
  }

  const toggleExcluded = (sheetIdx: number, rowIndex: number) => {
    setSheetConversions(prev => prev.map((sc, i) => {
      if (i !== sheetIdx) return sc
      const next = new Set(sc.excludedRows)
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
      return { ...sc, excludedRows: next }
    }))
  }

  const toggleExcludedCol = (sheetIdx: number, colIdx: number) => {
    setSheetConversions(prev => prev.map((sc, i) => {
      if (i !== sheetIdx) return sc
      const next = new Set(sc.excludedCols)
      next.has(colIdx) ? next.delete(colIdx) : next.add(colIdx)
      return { ...sc, excludedCols: next }
    }))
  }

  const toggleAllCols = (sheetIdx: number, totalCols: number) => {
    setSheetConversions(prev => prev.map((sc, i) => {
      if (i !== sheetIdx) return sc
      const allExcluded = sc.excludedCols.size === totalCols
      return { ...sc, excludedCols: allExcluded ? new Set() : new Set(Array.from({ length: totalCols }, (_, j) => j)) }
    }))
  }

  const toggleAllExcluded = (sheetIdx: number) => {
    setSheetConversions(prev => prev.map((sc, i) => {
      if (i !== sheetIdx) return sc
      const allSelected = sc.excludedRows.size === sc.aggregateRows.length
      return { ...sc, excludedRows: allSelected ? new Set() : new Set(sc.aggregateRows.map(r => r.rowIndex)) }
    }))
  }

  const handleDownloadZip = (conv: SheetConversion) => {
    const url = URL.createObjectURL(conv.result.zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = conv.result.zipFileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadCleanCsv = (conv: SheetConversion) => {
    const csv = getActiveCleanCsv(conv)
    if (!csv) return
    const sheetSuffix = sheetConversions.length > 1 ? `_${conv.sheet.replace(/[^a-zA-Z0-9]/g, '_')}` : ''
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sourceName}${sheetSuffix}_clean.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAiReview = async (conv: SheetConversion) => {
    const csv = cleanedCsvs[conv.sheet] ?? getActiveCleanCsv(conv)
    if (!csv) return

    const { headers, rows } = parseCSV(csv)
    const rawFirstRows = [headers, ...rows].slice(0, 20)
    const sheetSuffix = sheetConversions.length > 1 ? ` - ${conv.sheet}` : ''
    const displayName = `${sourceName}${sheetSuffix}`

    setIsAnalyzing(prev => ({ ...prev, [conv.sheet]: true }))
    try {
      const blocks = detectDataBlocks(rows)
      const plan = await n8nService.analyzeDataQuality({
        fileName: displayName,
        headers,
        firstRows: rows.slice(0, 20),
        lastRows: rows.slice(-10),
        dataBlocks: blocks.length > 1 ? blocks : [],
        rowCount: conv.result.profileJson?.row_count ?? rows.length,
        columnCount: conv.result.profileJson?.column_count ?? headers.length,
        profile: conv.result.profileJson as Record<string, unknown>,
        existingIssues: conv.aggregateRows.map(r => r.reason),
        rawFirstRows,
        ...(appSettings?.analyze_model && { model: appSettings.analyze_model }),
      })
      setAiReviewPlan(plan)
      setAiReviewConv(conv)
      setAiReviewCsvText(csv)
      setAiReviewFileName(`${displayName}_clean.csv`)
      setAiReviewOpen(true)
    } catch (err) {
      toast.error(`AI Review failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [conv.sheet]: false }))
    }
  }

  const handleUploadAsDataset = async (conv: SheetConversion) => {
    const csvSource = cleanedCsvs[conv.sheet] ?? getActiveCleanCsv(conv)
    if (!csvSource || !session?.email) return

    const { headers } = parseCSV(csvSource)
    const excludedColNames = headers.filter((_, i) => conv.excludedCols.has(i))
    const ingestionConfig = {
      source_type: isExcel ? 'excel' as const : 'csv' as const,
      config: {
        sheets: [{ name: conv.sheet, header_row: options.header_row || undefined, excluded_col_names: excludedColNames }],
        no_unpivot: options.no_unpivot,
        keep_dupes: options.keep_dupes,
      },
    }

    const sheetSuffix = sheetConversions.length > 1 ? ` - ${conv.sheet}` : ''
    const displayName = `${sourceName}${sheetSuffix}`

    let sourceInfo: { location_type: string; folder_id: string; schedule: string | null } | undefined
    if (lastGsheetsId.current) {
      sourceInfo = { location_type: 'google_sheets', folder_id: lastGsheetsId.current, schedule: null }
    } else if (lastOnedriveUrl.current) {
      sourceInfo = { location_type: 'onedrive_file', folder_id: lastOnedriveUrl.current, schedule: null }
    }

    const hasDescribePrompt = !!appSettings?.dataset_describe_prompt
    const steps: OverlayStep[] = [
      { label: 'Uploading dataset', status: 'pending' },
      ...(hasDescribePrompt ? [{ label: 'AI is generating dataset description', status: 'pending' as const }] : []),
      { label: 'AI is generating sample questions', status: 'pending' },
      { label: 'Saving', status: 'pending' },
    ]

    const setStep = (index: number, status: OverlayStep['status']) => {
      setUploadOverlay(prev => {
        if (!prev) return prev
        const next = [...prev.steps]
        next[index] = { ...next[index]!, status }
        return { ...prev, steps: next }
      })
    }

    setUploadOverlay({ steps, error: null })

    let stepIdx = 0
    let datasetId = ''
    let uploadedSummary = ''

    try {
      // Step: Upload
      setStep(stepIdx, 'active')
      const csvData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1]!)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(new File([csvSource], `${displayName}_clean.csv`, { type: 'text/csv' }))
      })
      const result = await n8nService.uploadDataset({
        datasetName: displayName,
        description: '',
        email: session.email,
        csvData,
        ...(appSettings?.upload_model && { model: appSettings.upload_model }),
      })
      if (result.status === 'failed' || !result.datasetId) {
        throw new Error(result.message || 'Upload failed — data could not be inserted')
      }
      datasetId = result.datasetId
      uploadedSummary = ''
      setStep(stepIdx, 'done')
      stepIdx++

      // Save ingestion config (non-fatal, silent)
      try {
        await pocketbaseService.saveIngestionConfig({ dataset_id: datasetId, ...ingestionConfig })
        if (sourceInfo && session.email) {
          await pocketbaseService.saveIngestionSchedule({
            dataset_id: datasetId,
            owner_email: session.email,
            folder_id: sourceInfo.folder_id,
            location_type: sourceInfo.location_type,
            schedule: sourceInfo.schedule,
            enabled: true,
          })
        }
      } catch { /* non-fatal */ }

      // Step: AI describe (optional)
      let currentDesc = ''
      if (hasDescribePrompt) {
        setStep(stepIdx, 'active')
        try {
          const descResult = await n8nService.runAnalysis({
            email: session.email,
            model: appSettings!.analyze_model || '',
            datasetId,
            prompt: appSettings!.dataset_describe_prompt!,
          })
          currentDesc = descResult.result || ''
        } catch { /* non-fatal — continue without description */ }
        setStep(stepIdx, 'done')
        stepIdx++
      }

      // Step: Generate sample questions
      setStep(stepIdx, 'active')
      try {
        await n8nService.generateSampleQuestions(datasetId, currentDesc, uploadedSummary, appSettings?.analyze_model ?? undefined)
      } catch { /* non-fatal */ }
      setStep(stepIdx, 'done')
      stepIdx++

      // Step: Save description
      setStep(stepIdx, 'active')
      if (currentDesc) {
        await n8nService.updateSummary({
          datasetId,
          summary: uploadedSummary,
          email: session.email,
          datasetDesc: currentDesc,
          datasetName: displayName,
        })
      }
      setStep(stepIdx, 'done')

      setUploadOverlay(null)
      navigate('/edit-summary', { state: { preSelectedDatasetId: datasetId } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setUploadOverlay(prev => prev ? { ...prev, error: message } : prev)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setSourceName('')
    setSheetNames([])
    setSelectedSheets([])
    setPdfPages([])
    setSelectedPages([])
    setSheetConversions([])
    setExpandedSections({})
    setCleanedCsvs({})
    setIsAnalyzing({})
    setAiReviewOpen(false)
    setAiReviewConv(null)
    setAiReviewPlan(null)
    setAiReviewCsvText('')
    setAiReviewFileName('')
    setGsheetsInputOpen(false)
    setGsheetsUrl('')
    setOnedriveInputOpen(false)
    setOnedriveUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <PageTitle fallback="Uploader PLUS" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Convert, clean, and upload Excel and CSV files to your dataset library.</p>
        </div>

        {/* Info Box */}
        <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <h3 className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">How it works</h3>
          <ul className="text-sm text-purple-700 dark:text-purple-300 list-disc list-inside space-y-1">
            <li>Upload a CSV or Excel file (.xlsx, .xls, .xlsm)</li>
            <li>The file is processed by the Excel → SQL converter API</li>
            <li>Receive a clean SQL-ready CSV, column profile, and schema DDL</li>
            <li>Review and exclude aggregate rows (totals/subtotals) before uploading</li>
            <li>Upload the clean CSV directly as a dataset or download the full ZIP</li>
          </ul>
        </div>

        {/* Upload Card */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload File for Conversion</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="convertFile" className="label">File (CSV, XLSX, XLS, XLSM)</label>
              <input
                ref={fileInputRef}
                type="file"
                id="convertFile"
                accept=".csv,.xlsx,.xls,.xlsm,.pdf"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm
                           file:font-medium file:bg-purple-50 dark:file:bg-purple-900/30 file:text-purple-700
                           dark:file:text-purple-300 hover:file:bg-purple-100 dark:hover:file:bg-purple-900/50
                           transition-colors duration-200"
              />
            </div>

            {/* Google Sheet + OneDrive Import (shown only when Manage Ingestion is enabled) */}
            {appSettings?.show_ingestion_schedule === 'true' && <>
            <div>
              <button
                type="button"
                onClick={() => { setGsheetsInputOpen(v => !v); setGsheetsUrl('') }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-md hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H8v-2h4v2zm4-4H8v-2h8v2zm0-4H8V7h8v2z"/>
                </svg>
                Import from Google Sheet
              </button>
              {gsheetsInputOpen && (
                <div className="mb-2 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gsheetsUrl}
                      onChange={e => setGsheetsUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFetchGoogleSheet()}
                      placeholder="Paste Google Sheet URL or Sheet ID…"
                      className="input-field flex-1 text-sm py-1.5"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleFetchGoogleSheet}
                      disabled={isFetchingSheet || !gsheetsUrl.trim()}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isFetchingSheet ? 'Fetching…' : 'Load Sheet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGsheetsInputOpen(false); setGsheetsUrl('') }}
                      className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {googleConnected ? (
                      <>
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Google connected — private sheets supported
                        </span>
                        <button type="button" onClick={handleDisconnectGoogle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-500 dark:text-gray-400">Public sheets only —</span>
                        <button type="button" onClick={handleConnectGoogle} className="text-green-600 dark:text-green-400 hover:underline font-medium">
                          Connect Google Account
                        </button>
                        <span className="text-gray-400 dark:text-gray-500">to access private sheets</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* OneDrive Import */}
            <div>
              <button
                type="button"
                onClick={() => { setOnedriveInputOpen(v => !v); setOnedriveUrl('') }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-600 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                </svg>
                Import from OneDrive
              </button>
              {onedriveInputOpen && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={onedriveUrl}
                      onChange={e => setOnedriveUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFetchOneDriveFile()}
                      placeholder="Paste OneDrive share link…"
                      className="input-field flex-1 text-sm py-1.5"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleFetchOneDriveFile}
                      disabled={isFetchingOnedrive || !onedriveUrl.trim() || !microsoftConnected}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-md disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isFetchingOnedrive ? 'Fetching…' : 'Load File'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOnedriveInputOpen(false); setOnedriveUrl('') }}
                      className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {microsoftConnected ? (
                      <>
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Microsoft connected — shared files supported
                        </span>
                        <button type="button" onClick={handleDisconnectMicrosoft} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-500 dark:text-gray-400">Not connected —</span>
                        <button type="button" onClick={handleConnectMicrosoft} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                          Connect Microsoft Account
                        </button>
                        <span className="text-gray-400 dark:text-gray-500">to import OneDrive files</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            </>}

            {/* Sheet Selector — Excel files only */}
            {sheetNames.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Sheets to Convert
                    <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal">
                      ({selectedSheets.length} of {sheetNames.length} selected)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllSheets}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {selectedSheets.length === sheetNames.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sheetNames.map(name => {
                    const checked = selectedSheets.includes(name)
                    return (
                      <label
                        key={name}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${
                          checked
                            ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSheetSelected(name)}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                        />
                        {name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* PDF Page Selector */}
            {isFetchingPdfInfo && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent shrink-0"></div>
                Scanning PDF pages for tables...
              </div>
            )}
            {pdfPages.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pages to Convert
                    <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal">
                      ({selectedPages.length} of {pdfPages.filter(p => p.table_count > 0).length} with tables selected)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllPages}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {selectedPages.length === pdfPages.filter(p => p.table_count > 0).length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pdfPages.map(p => {
                    const hasTable = p.table_count > 0
                    const checked = selectedPages.includes(p.page_num)
                    return (
                      <label
                        key={p.page_num}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          !hasTable
                            ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                            : checked
                              ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 cursor-pointer'
                              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!hasTable}
                          onChange={() => hasTable && togglePageSelected(p.page_num)}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 disabled:opacity-40"
                        />
                        <span>
                          Page {p.page_num}
                          <span className="ml-1 text-xs opacity-70">
                            {p.table_count > 0 ? `(${p.table_count} table${p.table_count > 1 ? 's' : ''})` : '(no tables)'}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Advanced Options */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                <ChevronIcon open={showAdvanced} />
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  {/* Sheet field only for CSV — Excel and PDF use their own selectors above */}
                  {!isExcel && !isPdf && (
                    <div>
                      <label className="label text-xs">Sheet (name, index, or "all")</label>
                      <input
                        type="text"
                        value={options.sheet}
                        onChange={e => setOptions(o => ({ ...o, sheet: e.target.value }))}
                        placeholder="0"
                        className="input text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <label className="label text-xs flex items-center gap-1.5">
                      Header Row (0-based index, optional)
                      <HelpTip text="Specify which row contains column headers. Leave blank to auto-detect." />
                    </label>
                    <input
                      type="number"
                      value={options.header_row}
                      onChange={e => setOptions(o => ({ ...o, header_row: e.target.value }))}
                      placeholder="Auto-detect"
                      min={0}
                      className="input text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="noUnpivot"
                      checked={options.no_unpivot}
                      onChange={e => setOptions(o => ({ ...o, no_unpivot: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                    />
                    <label htmlFor="noUnpivot" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      Disable wide-to-long unpivot
                      <HelpTip text="When checked, keeps wide data as-is. When unchecked, transforms wide data to tall format." />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="keepDupes"
                      checked={options.keep_dupes}
                      onChange={e => setOptions(o => ({ ...o, keep_dupes: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                    />
                    <label htmlFor="keepDupes" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      Keep duplicate rows
                      <HelpTip text="When checked, preserves all duplicate rows. When unchecked, removes duplicates." />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">({formatFileSize(selectedFile.size)})</span>
                </div>
                <div className="flex gap-2">
                  {hasResults && (
                    <button onClick={handleReset} className="btn-secondary text-sm">Clear</button>
                  )}
                  <button
                    onClick={handleConvert}
                    disabled={isConverting || isFetchingPdfInfo || (sheetNames.length > 0 && selectedSheets.length === 0) || (isPdf && selectedPages.length === 0)}
                    className="btn-primary text-sm"
                  >
                    {isConverting ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        {isPdf
                          ? `Converting${sheetConversions.length > 0 ? ` (${sheetConversions.length}/${selectedPages.length})` : '...'}`
                          : `Converting${sheetConversions.length > 0 ? ` (${sheetConversions.length}/${selectedSheets.length})` : '...'}`}
                      </span>
                    ) : hasResults ? 'Re-convert' : 'Convert'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results — one block per converted sheet */}
        {sheetConversions.map((conv, sheetIdx) => {
          const activeCleanCsv = getActiveCleanCsv(conv)
          const originalParsed = conv.result.cleanCsv ? parseCSV(conv.result.cleanCsv) : null
          const preview = activeCleanCsv ? parseCSV(activeCleanCsv) : null
          const rowCount = conv.result.profileJson?.row_count ?? preview?.rows.length ?? 0
          const colCount = conv.result.profileJson?.column_count ?? preview?.headers.length ?? 0
          const sk = (section: string) => `${conv.sheet}.${section}`

          return (
            <div key={conv.sheet} className="mb-8">
              {/* Sheet divider — only for multi-sheet */}
              {sheetConversions.length > 1 && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  <span className="px-3 py-1 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700">
                    {isPdf
                      ? `Page: ${conv.sheet.replace('page_', '')}`
                      : `Sheet: ${conv.sheet}`}
                  </span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>
              )}

              {/* Summary Bar */}
              <div className="card p-4 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{rowCount.toLocaleString()}</span> rows,{' '}
                    <span className="font-medium">{colCount - conv.excludedCols.size}</span> columns
                    {conv.excludedCols.size > 0 && (
                      <span className="ml-1 text-gray-500 dark:text-gray-400">of {colCount}</span>
                    )}{' '}processed
                    {conv.excludedRows.size > 0 && (
                      <span className="ml-2 text-yellow-700 dark:text-yellow-400">
                        ({conv.excludedRows.size} row{conv.excludedRows.size > 1 ? 's' : ''} excluded)
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Conversion successful
                  </span>
                </div>
              </div>

              {/* Aggregate / Double-Count Rows */}
              {conv.aggregateRows.length > 0 && (
                <div className="mb-4 border border-yellow-300 dark:border-yellow-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(sk('aggregates'))}
                    className="w-full flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span className="font-medium text-yellow-800 dark:text-yellow-200">
                        Potential Double-Count Rows ({conv.aggregateRows.length} detected)
                      </span>
                      {conv.excludedRows.size > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200">
                          {conv.excludedRows.size} excluded
                        </span>
                      )}
                    </div>
                    <ChevronIcon open={!!expandedSections[sk('aggregates')]} />
                  </button>

                  {expandedSections[sk('aggregates')] && (
                    <div className="bg-white dark:bg-gray-800">
                      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-yellow-100 dark:border-yellow-900/30">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Rows containing totals or subtotals may cause double-counting in AI analysis. Check the rows you want to exclude.
                        </p>
                        <button
                          onClick={() => toggleAllExcluded(sheetIdx)}
                          className="shrink-0 ml-4 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {conv.excludedRows.size === conv.aggregateRows.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {conv.aggregateRows.map(({ rowIndex, row, reason }) => {
                          const isExcluded = conv.excludedRows.has(rowIndex)
                          return (
                            <label
                              key={rowIndex}
                              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                isExcluded
                                  ? 'bg-yellow-50/60 dark:bg-yellow-900/10'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isExcluded}
                                onChange={() => toggleExcluded(sheetIdx, rowIndex)}
                                className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-yellow-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                  Row {rowIndex + 2} — matched: <span className="font-medium text-yellow-700 dark:text-yellow-400">{reason}</span>
                                </div>
                                <div className={`text-xs font-mono text-gray-700 dark:text-gray-300 truncate ${isExcluded ? 'line-through opacity-50' : ''}`}>
                                  {row.join(', ')}
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Column Profile */}
              <div className="mb-4 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(sk('profile'))}
                  className="w-full flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 hover:opacity-90 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="font-medium text-blue-800 dark:text-blue-200">Column Profile</span>
                  </div>
                  <ChevronIcon open={!!expandedSections[sk('profile')]} />
                </button>
                {expandedSections[sk('profile')] && (
                  <div className="p-4 bg-white dark:bg-gray-800">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                      {JSON.stringify(conv.result.profileJson, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Schema SQL */}
              {conv.result.schemaSql && (
                <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(sk('schema'))}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4 8 4s8 1.79 8 4" />
                      </svg>
                      <span className="font-medium text-gray-800 dark:text-gray-200">Schema SQL</span>
                    </div>
                    <ChevronIcon open={!!expandedSections[sk('schema')]} />
                  </button>
                  {expandedSections[sk('schema')] && (
                    <div className="p-4 bg-white dark:bg-gray-800">
                      <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                        {conv.result.schemaSql}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Relationships */}
              {conv.result.relationshipsJson != null && (
                <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(sk('relationships'))}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="font-medium text-gray-800 dark:text-gray-200">Cross-Sheet Relationships</span>
                    </div>
                    <ChevronIcon open={!!expandedSections[sk('relationships')]} />
                  </button>
                  {expandedSections[sk('relationships')] && (
                    <div className="p-4 bg-white dark:bg-gray-800">
                      <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                        {JSON.stringify(conv.result.relationshipsJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Data Preview + Actions */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Clean CSV Preview</h2>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleDownloadZip(conv)} className="btn-secondary text-sm">Download ZIP</button>
                    <button onClick={() => handleDownloadCleanCsv(conv)} className="btn-secondary text-sm">Download CSV</button>
                    <button
                      onClick={() => handleAiReview(conv)}
                      disabled={!!isAnalyzing[conv.sheet]}
                      className="btn-secondary text-sm border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-50"
                    >
                      {isAnalyzing[conv.sheet] ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-purple-500 border-t-transparent" />
                          Analyzing…
                        </span>
                      ) : cleanedCsvs[conv.sheet] ? (
                        '✓ AI Reviewed'
                      ) : (
                        'AI Review'
                      )}
                    </button>
                    <button onClick={() => handleUploadAsDataset(conv)} className="btn-primary text-sm">Upload as Dataset</button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">{colCount - conv.excludedCols.size}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Columns{conv.excludedCols.size > 0 ? ` (${conv.excludedCols.size} hidden)` : ''}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {(originalParsed ? originalParsed.rows.length - conv.excludedRows.size : rowCount).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Rows{conv.excludedRows.size > 0 ? ` (${conv.excludedRows.size} excluded)` : ''}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {formatFileSize(conv.result.zipBlob.size)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">ZIP Size</div>
                  </div>
                </div>

                {/* Column Picker */}
                {originalParsed && originalParsed.headers.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Columns ({originalParsed.headers.length - conv.excludedCols.size} of {originalParsed.headers.length} included)
                      </span>
                      <button
                        onClick={() => toggleAllCols(sheetIdx, originalParsed.headers.length)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {conv.excludedCols.size === originalParsed.headers.length ? 'Include all' : 'Exclude all'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {originalParsed.headers.map((h, colIdx) => {
                        const excluded = conv.excludedCols.has(colIdx)
                        return (
                          <label
                            key={colIdx}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer text-xs transition-colors ${
                              excluded
                                ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through'
                                : 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => toggleExcludedCol(sheetIdx, colIdx)}
                              className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                            />
                            {h || `Col ${colIdx + 1}`}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                {originalParsed && originalParsed.headers.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                          {originalParsed.headers.map((h, i) => (
                            <th key={i} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                              conv.excludedCols.has(i)
                                ? 'text-gray-300 dark:text-gray-600 line-through opacity-40'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {originalParsed.rows.slice(0, 10).map((row, i) => {
                          const isExcluded = conv.excludedRows.has(i)
                          return (
                            <tr
                              key={i}
                              className={`transition-colors ${
                                isExcluded
                                  ? 'bg-yellow-50/60 dark:bg-yellow-900/10 opacity-50'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                              }`}
                            >
                              {row.map((val, j) => (
                                <td
                                  key={j}
                                  className={`px-3 py-2 whitespace-nowrap max-w-xs truncate ${isExcluded ? 'line-through' : ''} ${
                                    conv.excludedCols.has(j)
                                      ? 'opacity-25 text-gray-400 dark:text-gray-600'
                                      : 'text-gray-800 dark:text-gray-200'
                                  }`}
                                >
                                  {val || <span className="text-gray-400 dark:text-gray-500 italic">empty</span>}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {originalParsed.rows.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 text-center">
                        Showing 10 of {originalParsed.rows.length.toLocaleString()} rows
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No preview available.</p>
                )}
              </div>
            </div>
          )
        })}
      </main>

      {/* Upload Progress Overlay */}
      {uploadOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
              {uploadOverlay.error ? 'Upload failed' : 'Uploading dataset…'}
            </h3>
            <div className="space-y-3 mb-5">
              {uploadOverlay.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {step.status === 'active' && (
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                      <span className="inline-block w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    </span>
                  )}
                  {step.status === 'done' && (
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center text-green-500">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </span>
                  )}
                  {step.status === 'error' && (
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center text-red-500">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </span>
                  )}
                  {step.status === 'pending' && (
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                    </span>
                  )}
                  <span className={`text-sm ${
                    step.status === 'active' ? 'text-gray-900 dark:text-white font-medium' :
                    step.status === 'done' ? 'text-gray-500 dark:text-gray-400' :
                    step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-400 dark:text-gray-600'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            {uploadOverlay.error && (
              <>
                <p className="text-sm text-red-600 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  {uploadOverlay.error}
                </p>
                <button
                  onClick={() => setUploadOverlay(null)}
                  className="w-full btn-secondary"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI Review Modal */}
      {aiReviewOpen && aiReviewPlan && aiReviewConv && (
        <AiReviewModal
          isOpen={aiReviewOpen}
          onClose={() => setAiReviewOpen(false)}
          cleaningPlan={aiReviewPlan}
          csvText={aiReviewCsvText}
          fileName={aiReviewFileName}
          onCleanComplete={(cleanedCsv) => {
            setCleanedCsvs(prev => ({ ...prev, [aiReviewConv!.sheet]: cleanedCsv }))
            setAiReviewOpen(false)
          }}
        />
      )}
    </div>
  )
}
