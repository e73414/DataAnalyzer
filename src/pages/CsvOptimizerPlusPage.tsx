import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import Navigation from '../components/Navigation'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sheet detection (Excel only)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheets, setSelectedSheets] = useState<string[]>([])

  // Per-sheet results (replaces single result/aggregateRows/excludedRows)
  const [sheetConversions, setSheetConversions] = useState<SheetConversion[]>([])

  // Expanded sections keyed by "<sheet>.<section>"
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const [options, setOptions] = useState<ConvertOptions>({
    sheet: '0',
    no_unpivot: false,
    keep_dupes: false,
    header_row: '',
  })

  const isExcel = selectedFile ? /\.(xlsx?|xlsm)$/i.test(selectedFile.name) : false
  const hasResults = sheetConversions.length > 0

  const toggleSection = (key: string) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setSourceName(file.name.replace(/\.(csv|xlsx?|xlsm)$/i, ''))
    setSheetConversions([])
    setExpandedSections({})

    if (/\.(xlsx?|xlsm)$/i.test(file.name)) {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { bookSheets: true })
      setSheetNames(workbook.SheetNames)
      setSelectedSheets([...workbook.SheetNames])
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

  const handleConvert = async () => {
    if (!selectedFile) return

    // For CSV files fall back to the manual sheet option; for Excel use checkboxes
    const sheets = sheetNames.length > 0 ? selectedSheets : [options.sheet || '0']

    setIsConverting(true)
    setSheetConversions([])
    setExpandedSections({})

    const newConversions: SheetConversion[] = []

    for (const sheet of sheets) {
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const params = new URLSearchParams()
        params.set('sheet', sheet)
        if (options.no_unpivot) params.set('no_unpivot', 'true')
        if (options.keep_dupes) params.set('keep_dupes', 'true')
        if (options.header_row !== '') params.set('header_row', options.header_row)

        const response = await axios.post(`/excel-to-sql/convert?${params.toString()}`, formData, {
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
        const stem = selectedFile.name.replace(/\.(csv|xlsx?|xlsm)$/i, '')
        const sheetSuffix = sheets.length > 1 ? `_${sheet.replace(/[^a-zA-Z0-9]/g, '_')}` : ''

        const convResult: ConversionResult = {
          cleanCsv, profileJson, schemaSql, relationshipsJson, zipBlob,
          zipFileName: `${stem}${sheetSuffix}_sql_ready.zip`,
        }

        const { headers, rows } = parseCSV(cleanCsv)
        const aggregateRows = detectAggregateRows(headers, rows)

        newConversions.push({
          sheet,
          result: convResult,
          aggregateRows,
          excludedRows: new Set(aggregateRows.map(r => r.rowIndex)),
          excludedCols: new Set<number>(),
        })

        // Show progress as each sheet completes
        setSheetConversions([...newConversions])
        setExpandedSections(prev => ({
          ...prev,
          [`${sheet}.profile`]: false,
          [`${sheet}.schema`]: false,
          [`${sheet}.relationships`]: false,
          [`${sheet}.aggregates`]: true,
        }))
      } catch (err: unknown) {
        let message = sheets.length > 1
          ? `Sheet "${sheet}": conversion failed.`
          : 'Conversion failed. Make sure the Docker API is running on port 8000.'
        if (axios.isAxiosError(err)) {
          if (err.response) {
            try {
              const text = new TextDecoder().decode(err.response.data as ArrayBuffer)
              const parsed = JSON.parse(text)
              message = parsed.detail || message
            } catch {
              message = sheets.length > 1
                ? `Sheet "${sheet}": server error ${err.response.status}`
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

  const handleUploadAsDataset = (conv: SheetConversion) => {
    const csv = getActiveCleanCsv(conv)
    if (!csv) return
    const sheetSuffix = sheetConversions.length > 1 ? ` - ${conv.sheet}` : ''
    const displayName = `${sourceName}${sheetSuffix}`
    const fileName = `${displayName}_clean.csv`
    const blob = new Blob([csv], { type: 'text/csv' })
    const file = new File([blob], fileName, { type: 'text/csv' })
    navigate('/upload-dataset', { state: { csvFile: file, fileName: displayName } })
  }

  const handleReset = () => {
    setSelectedFile(null)
    setSourceName('')
    setSheetNames([])
    setSelectedSheets([])
    setSheetConversions([])
    setExpandedSections({})
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* Info Box */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">How it works</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
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
                accept=".csv,.xlsx,.xls,.xlsm"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm
                           file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700
                           dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                           transition-colors duration-200"
              />
            </div>

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
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
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
                  {/* Sheet field only for CSV — Excel uses the checkboxes above */}
                  {!isExcel && (
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
                    <label className="label text-xs">Header Row (0-based index, optional)</label>
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
                    <label htmlFor="noUnpivot" className="text-sm text-gray-700 dark:text-gray-300">
                      Disable wide-to-long unpivot
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
                    <label htmlFor="keepDupes" className="text-sm text-gray-700 dark:text-gray-300">
                      Keep duplicate rows
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
                    disabled={isConverting || (sheetNames.length > 0 && selectedSheets.length === 0)}
                    className="btn-primary text-sm"
                  >
                    {isConverting ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        Converting{sheetConversions.length > 0 ? ` (${sheetConversions.length}/${selectedSheets.length})` : '...'}
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
                    Sheet: {conv.sheet}
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
              <div className="mb-4 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(sk('profile'))}
                  className="w-full flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 hover:opacity-90 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
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
    </div>
  )
}
