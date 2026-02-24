import { useState, useRef, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navigation from '../components/Navigation'

// --- Types ---

interface Issue {
  severity: 'error' | 'warning' | 'suggestion'
  message: string
  columns?: string[]
  rows?: number[]
  autoFixable: boolean
}

interface AnalysisResult {
  issues: Issue[]
  originalHeaders: string[]
  originalRows: string[][]
  rowCount: number
  columnCount: number
}

interface IncomingState {
  csvText?: string
  fileName?: string
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
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          row.push(current)
          current = ''
        } else {
          current += ch
        }
      }
    }
    row.push(current)
    parsed.push(row)
  }

  if (parsed.length === 0) return { headers: [], rows: [] }
  return { headers: parsed[0], rows: parsed.slice(1) }
}

// --- Analysis Functions ---

const NULL_LIKE = new Set(['n/a', 'na', 'null', 'none', '-', 'undefined', 'nil', '#n/a', '#null', 'nan'])
const FORMULA_ERROR_REGEX = /^#(REF|VALUE|N\/A|DIV\/0|NAME\?|NUM|NULL)!?$/i
const DATE_REGEX_YMD = /^\d{4}-\d{2}-\d{2}$/
const DATE_REGEX_MDY = /^\d{1,2}\/\d{1,2}\/\d{4}$/
const DATE_REGEX_LONG = /^\w+ \d{1,2},? \d{4}$/ // e.g., "January 5, 2025"
const CURRENCY_REGEX = /^[$€£¥][\s]?-?[\d,]+\.?\d*$/
const NUMBER_WITH_COMMAS = /^-?[\d,]+\.?\d*$/

function isFormulaError(value: string): boolean {
  return FORMULA_ERROR_REGEX.test(value.trim())
}

function detectType(value: string): 'empty' | 'int' | 'real' | 'date' | 'bool' | 'currency' | 'formula_error' | 'string' {
  const trimmed = value.trim()
  if (trimmed === '' || NULL_LIKE.has(trimmed.toLowerCase())) return 'empty'
  if (isFormulaError(trimmed)) return 'formula_error'
  if (/^(true|false)$/i.test(trimmed)) return 'bool'
  if (DATE_REGEX_YMD.test(trimmed) || DATE_REGEX_MDY.test(trimmed)) return 'date'
  if (CURRENCY_REGEX.test(trimmed)) return 'currency'
  const cleaned = trimmed.replace(/[$€£¥,\s]/g, '')
  if (cleaned !== '' && !isNaN(Number(cleaned))) {
    return cleaned.includes('.') ? 'real' : 'int'
  }
  return 'string'
}

function toSnakeCase(header: string): string {
  return header
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function analyzeCSV(headers: string[], rows: string[][]): Issue[] {
  const issues: Issue[] = []

  if (rows.length === 0) {
    issues.push({ severity: 'error', message: 'File contains no data rows (only headers or empty).', autoFixable: false })
    return issues
  }

  // Duplicate headers
  const headerLower = headers.map(h => h.trim().toLowerCase())
  const seen = new Map<string, number[]>()
  headerLower.forEach((h, i) => {
    if (!seen.has(h)) seen.set(h, [])
    seen.get(h)!.push(i)
  })
  const dupes = [...seen.entries()].filter(([, idxs]) => idxs.length > 1)
  if (dupes.length > 0) {
    issues.push({
      severity: 'error',
      message: `Duplicate column headers found: ${dupes.map(([name]) => `"${name}"`).join(', ')}. Each column must have a unique name.`,
      columns: dupes.map(([name]) => name),
      autoFixable: false,
    })
  }

  // Inconsistent row lengths
  const expectedCols = headers.length
  const badRows: number[] = []
  rows.forEach((row, i) => {
    if (row.length !== expectedCols) badRows.push(i + 2)
  })
  if (badRows.length > 0) {
    const display = badRows.length > 5 ? badRows.slice(0, 5).join(', ') + ` and ${badRows.length - 5} more` : badRows.join(', ')
    issues.push({
      severity: 'error',
      message: `${badRows.length} row(s) have inconsistent column count (expected ${expectedCols}). Rows: ${display}.`,
      rows: badRows,
      autoFixable: false,
    })
  }

  // Empty or missing headers
  const emptyHeaders: number[] = []
  headers.forEach((h, i) => {
    if (h.trim() === '') emptyHeaders.push(i + 1)
  })
  if (emptyHeaders.length > 0) {
    issues.push({
      severity: 'error',
      message: `${emptyHeaders.length} column(s) have empty/missing headers (positions: ${emptyHeaders.join(', ')}). Every column must have a name.`,
      autoFixable: true,
    })
  }

  // Mixed types per column
  for (let col = 0; col < headers.length; col++) {
    const types = new Set<string>()
    for (const row of rows) {
      const val = row[col] ?? ''
      const t = detectType(val)
      if (t !== 'empty' && t !== 'formula_error') types.add(t === 'currency' ? 'real' : t)
    }
    if (types.size > 1 && types.has('string')) {
      const nonString = [...types].filter(t => t !== 'string')
      issues.push({
        severity: 'error',
        message: `Column "${headers[col].trim()}" has mixed types (${[...types].join(', ')}). Text values mixed with ${nonString.join('/')} will force the entire column to string type, preventing numeric/date queries.`,
        columns: [headers[col].trim()],
        autoFixable: false,
      })
    }
  }

  // Formula errors (#REF!, #VALUE!, #DIV/0!, etc.)
  const colsWithErrors: string[] = []
  let formulaErrorCount = 0
  for (let col = 0; col < headers.length; col++) {
    let found = false
    for (const row of rows) {
      if (isFormulaError((row[col] ?? '').trim())) {
        formulaErrorCount++
        if (!found) { colsWithErrors.push(headers[col].trim() || `Column ${col + 1}`); found = true }
      }
    }
  }
  if (formulaErrorCount > 0) {
    issues.push({
      severity: 'warning',
      message: `${formulaErrorCount} cell(s) contain Excel formula errors (#REF!, #VALUE!, etc.). These will be replaced with empty values.`,
      columns: colsWithErrors,
      autoFixable: true,
    })
  }

  // Embedded newlines/tabs in cell values
  let embeddedNewlineCount = 0
  const colsWithNewlines: string[] = []
  for (let col = 0; col < headers.length; col++) {
    let found = false
    for (const row of rows) {
      if (/[\r\n\t]/.test(row[col] ?? '')) {
        embeddedNewlineCount++
        if (!found) { colsWithNewlines.push(headers[col].trim() || `Column ${col + 1}`); found = true }
      }
    }
  }
  if (embeddedNewlineCount > 0) {
    issues.push({
      severity: 'warning',
      message: `${embeddedNewlineCount} cell(s) contain embedded newlines or tabs. These will be replaced with spaces.`,
      columns: colsWithNewlines,
      autoFixable: true,
    })
  }

  // Long date format (e.g., "January 5, 2025") that won't be detected as date type
  const colsWithLongDates: string[] = []
  for (let col = 0; col < headers.length; col++) {
    for (const row of rows) {
      if (DATE_REGEX_LONG.test((row[col] ?? '').trim())) {
        colsWithLongDates.push(headers[col].trim())
        break
      }
    }
  }
  if (colsWithLongDates.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Text date formats detected (e.g., "January 5, 2025"). Use YYYY-MM-DD or MM/DD/YYYY for proper date detection.`,
      columns: colsWithLongDates,
      autoFixable: false,
    })
  }

  // Null-like values
  const colsWithNulls: string[] = []
  for (let col = 0; col < headers.length; col++) {
    for (const row of rows) {
      const val = (row[col] ?? '').trim().toLowerCase()
      if (NULL_LIKE.has(val)) {
        colsWithNulls.push(headers[col].trim())
        break
      }
    }
  }
  if (colsWithNulls.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Non-standard null values (N/A, NULL, none, etc.) found. These may cause type detection issues.`,
      columns: colsWithNulls,
      autoFixable: true,
    })
  }

  // Whitespace in headers
  const headersWithWhitespace = headers.filter(h => h !== h.trim() || /\s/.test(h.trim()))
  if (headersWithWhitespace.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Headers contain spaces or leading/trailing whitespace. These will be converted to snake_case.`,
      columns: headersWithWhitespace.map(h => h.trim()),
      autoFixable: true,
    })
  }

  // Special characters in headers
  const headersWithSpecial = headers.filter(h => /[^a-zA-Z0-9_\s]/.test(h.trim()))
  if (headersWithSpecial.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Headers contain special characters. These will be converted to snake_case.`,
      columns: headersWithSpecial.map(h => h.trim()),
      autoFixable: true,
    })
  }

  // Currency symbols
  const colsWithCurrency: string[] = []
  for (let col = 0; col < headers.length; col++) {
    for (const row of rows) {
      if (CURRENCY_REGEX.test((row[col] ?? '').trim())) {
        colsWithCurrency.push(headers[col].trim())
        break
      }
    }
  }
  if (colsWithCurrency.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Currency symbols found in numeric columns. Symbols and thousand separators will be stripped.`,
      columns: colsWithCurrency,
      autoFixable: true,
    })
  }

  // Mixed date formats
  for (let col = 0; col < headers.length; col++) {
    let hasYMD = false, hasMDY = false
    for (const row of rows) {
      const val = (row[col] ?? '').trim()
      if (DATE_REGEX_YMD.test(val)) hasYMD = true
      if (DATE_REGEX_MDY.test(val)) hasMDY = true
    }
    if (hasYMD && hasMDY) {
      issues.push({
        severity: 'warning',
        message: `Column "${headers[col].trim()}" has mixed date formats (YYYY-MM-DD and MM/DD/YYYY). Dates will be standardized to YYYY-MM-DD.`,
        columns: [headers[col].trim()],
        autoFixable: true,
      })
    }
  }

  // Summary/total rows
  const totalRows: number[] = []
  rows.forEach((row, i) => {
    const firstVal = (row[0] ?? '').trim().toLowerCase()
    if (/^(total|sum|grand total|subtotal|average|avg|count)$/i.test(firstVal)) {
      totalRows.push(i + 2)
    }
  })
  if (totalRows.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Possible summary/total rows detected. These can cause double-counting in AI analysis. Review rows: ${totalRows.join(', ')}.`,
      rows: totalRows,
      autoFixable: false,
    })
  }

  // Whitespace in values
  let valueWhitespaceCount = 0
  for (const row of rows) {
    for (const val of row) {
      if (val !== val.trim()) valueWhitespaceCount++
    }
  }
  if (valueWhitespaceCount > 0) {
    issues.push({
      severity: 'warning',
      message: `${valueWhitespaceCount} cell(s) have leading/trailing whitespace. These will be trimmed.`,
      autoFixable: true,
    })
  }

  if (headers.length > 50) {
    issues.push({
      severity: 'suggestion',
      message: `Dataset has ${headers.length} columns. Consider removing columns irrelevant to your analysis for faster query performance.`,
      autoFixable: false,
    })
  }

  if (rows.length > 100000) {
    issues.push({
      severity: 'suggestion',
      message: `Dataset has ${rows.length.toLocaleString()} rows. Large datasets work but queries may take longer. Consider filtering to relevant data before upload.`,
      autoFixable: false,
    })
  }

  // Empty columns
  const emptyCols: string[] = []
  for (let col = 0; col < headers.length; col++) {
    const allEmpty = rows.every(row => (row[col] ?? '').trim() === '' || NULL_LIKE.has((row[col] ?? '').trim().toLowerCase()))
    if (allEmpty) emptyCols.push(headers[col].trim())
  }
  if (emptyCols.length > 0) {
    issues.push({
      severity: 'suggestion',
      message: `${emptyCols.length} column(s) are entirely empty or null. Consider removing them.`,
      columns: emptyCols,
      autoFixable: true,
    })
  }

  // Category inconsistencies
  for (let col = 0; col < headers.length; col++) {
    const values = new Map<string, Set<string>>()
    for (const row of rows) {
      const val = (row[col] ?? '').trim()
      if (val === '') continue
      const key = val.toLowerCase()
      if (!values.has(key)) values.set(key, new Set())
      values.get(key)!.add(val)
    }
    const uniqueCount = values.size
    if (uniqueCount > 0 && uniqueCount <= 50) {
      const inconsistent = [...values.entries()].filter(([, variants]) => variants.size > 1)
      if (inconsistent.length > 0) {
        const examples = inconsistent.slice(0, 3).map(([, variants]) => `"${[...variants].join('" vs "')}"`)
        issues.push({
          severity: 'suggestion',
          message: `Column "${headers[col].trim()}" has inconsistent casing/formatting: ${examples.join('; ')}. Standardize for more accurate grouping.`,
          columns: [headers[col].trim()],
          autoFixable: false,
        })
      }
    }
  }

  // Long string values
  const longCols: string[] = []
  for (let col = 0; col < headers.length; col++) {
    for (const row of rows) {
      if ((row[col] ?? '').length > 500) {
        longCols.push(headers[col].trim())
        break
      }
    }
  }
  if (longCols.length > 0) {
    issues.push({
      severity: 'suggestion',
      message: `Column(s) contain very long text values (>500 chars). These may slow down queries.`,
      columns: longCols,
      autoFixable: false,
    })
  }

  return issues
}

// --- Optimization ---

function optimizeCSV(headers: string[], rows: string[][]): { headers: string[]; rows: string[][]; fixCount: number } {
  let fixCount = 0

  // Find empty columns to remove (including those with only formula errors/nulls)
  const emptyColIdxs = new Set<number>()
  for (let col = 0; col < headers.length; col++) {
    const allEmpty = rows.every(row => {
      const val = (row[col] ?? '').trim().toLowerCase()
      return val === '' || NULL_LIKE.has(val) || isFormulaError(val)
    })
    if (allEmpty) emptyColIdxs.add(col)
  }
  if (emptyColIdxs.size > 0) fixCount += emptyColIdxs.size

  // Convert headers to snake_case, generate names for empty headers, filter empty cols
  const newHeaders: string[] = []
  const keepCols: number[] = []
  for (let i = 0; i < headers.length; i++) {
    if (emptyColIdxs.has(i)) continue
    const original = headers[i]
    let snake = toSnakeCase(original)
    // Generate name for empty headers
    if (!snake) {
      snake = `column_${i + 1}`
      fixCount++
    } else if (snake !== original.trim()) {
      fixCount++
    }
    newHeaders.push(snake)
    keepCols.push(i)
  }

  // Process rows
  const newRows: string[][] = []
  for (const row of rows) {
    const allEmpty = keepCols.every(col => {
      const val = (row[col] ?? '').trim()
      return val === '' || isFormulaError(val)
    })
    if (allEmpty) { fixCount++; continue }

    const newRow: string[] = []
    for (const col of keepCols) {
      let val = (row[col] ?? '')

      // Replace embedded newlines/tabs with spaces
      if (/[\r\n\t]/.test(val)) {
        val = val.replace(/[\r\n\t]+/g, ' ')
        fixCount++
      }

      val = val.trim()

      // Replace formula errors with empty
      if (isFormulaError(val)) {
        val = ''
        fixCount++
      }

      // Replace null-like values
      if (val !== '' && NULL_LIKE.has(val.toLowerCase())) {
        val = ''
        fixCount++
      }

      // Strip currency symbols and thousand separators from numeric values
      if (CURRENCY_REGEX.test(val) || (NUMBER_WITH_COMMAS.test(val) && val.includes(','))) {
        const cleaned = val.replace(/[$€£¥,\s]/g, '')
        if (!isNaN(Number(cleaned)) && cleaned !== '') {
          if (cleaned !== val) fixCount++
          val = cleaned
        }
      }

      // Standardize dates MM/DD/YYYY -> YYYY-MM-DD
      if (DATE_REGEX_MDY.test(val)) {
        const parts = val.split('/')
        const m = parts[0].padStart(2, '0')
        const d = parts[1].padStart(2, '0')
        const y = parts[2]
        val = `${y}-${m}-${d}`
        fixCount++
      }

      // Count trimming
      if ((row[col] ?? '') !== (row[col] ?? '').trim()) fixCount++

      newRow.push(val)
    }
    newRows.push(newRow)
  }

  return { headers: newHeaders, rows: newRows, fixCount }
}

function toCSVString(headers: string[], rows: string[][]): string {
  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n')
}

// --- Component Helpers ---

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function SeverityBadge({ severity, count }: { severity: 'error' | 'warning' | 'suggestion'; count: number }) {
  const colors = {
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    suggestion: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  }
  const labels = { error: 'Errors', warning: 'Warnings', suggestion: 'Suggestions' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[severity]}`}>
      {count} {labels[severity]}
    </span>
  )
}

// --- Main Component ---

export default function CsvOptimizerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const incomingState = location.state as IncomingState | null

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceName, setSourceName] = useState<string>('')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [optimizedCSV, setOptimizedCSV] = useState<{ headers: string[]; rows: string[][]; csvString: string; fixCount: number } | null>(null)
  const [originalCSVString, setOriginalCSVString] = useState<string>('')
  const [useOptimized, setUseOptimized] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ error: true, warning: true, suggestion: false })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)

  // Handle incoming data from Excel Upload page
  useEffect(() => {
    if (loadedRef.current) return
    if (incomingState?.csvText) {
      loadedRef.current = true
      setSourceName(incomingState.fileName || 'excel_data')
      // Auto-analyze the incoming CSV
      const { headers, rows } = parseCSV(incomingState.csvText)
      const issues = analyzeCSV(headers, rows)
      setAnalysis({ issues, originalHeaders: headers, originalRows: rows, rowCount: rows.length, columnCount: headers.length })
      setOriginalCSVString(incomingState.csvText)

      const { headers: optHeaders, rows: optRows, fixCount } = optimizeCSV(headers, rows)
      const csvString = toCSVString(optHeaders, optRows)
      setOptimizedCSV({ headers: optHeaders, rows: optRows, csvString, fixCount })
      setUseOptimized(fixCount > 0)
      setExpandedSections({ error: true, warning: true, suggestion: false })
    }
  }, [incomingState])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setSourceName(file.name.replace(/\.csv$/i, ''))
    setAnalysis(null)
    setOptimizedCSV(null)
    setOriginalCSVString('')
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return
    setIsAnalyzing(true)
    try {
      const text = await selectedFile.text()
      const { headers, rows } = parseCSV(text)
      const issues = analyzeCSV(headers, rows)
      setAnalysis({ issues, originalHeaders: headers, originalRows: rows, rowCount: rows.length, columnCount: headers.length })
      setOriginalCSVString(text)

      const { headers: optHeaders, rows: optRows, fixCount } = optimizeCSV(headers, rows)
      const csvString = toCSVString(optHeaders, optRows)
      setOptimizedCSV({ headers: optHeaders, rows: optRows, csvString, fixCount })
      setUseOptimized(fixCount > 0)
      setExpandedSections({ error: true, warning: true, suggestion: false })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleDownload = () => {
    if (!optimizedCSV) return
    const csvString = useOptimized ? optimizedCSV.csvString : originalCSVString
    const blob = new Blob([csvString], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = useOptimized ? '_optimized' : ''
    a.download = `${sourceName || 'data'}${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleUploadAsDataset = () => {
    if (!analysis) return
    const csvString = useOptimized && optimizedCSV ? optimizedCSV.csvString : originalCSVString
    const fileName = `${sourceName || 'data'}${useOptimized ? '_optimized' : ''}.csv`
    const blob = new Blob([csvString], { type: 'text/csv' })
    const file = new File([blob], fileName, { type: 'text/csv' })
    navigate('/upload-dataset', { state: { csvFile: file, fileName: sourceName || 'data' } })
  }

  const handleReset = () => {
    setSelectedFile(null)
    setSourceName('')
    setAnalysis(null)
    setOptimizedCSV(null)
    setOriginalCSVString('')
    setUseOptimized(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const issuesByType = useMemo(() => {
    if (!analysis) return { error: [], warning: [], suggestion: [] }
    return {
      error: analysis.issues.filter(i => i.severity === 'error'),
      warning: analysis.issues.filter(i => i.severity === 'warning'),
      suggestion: analysis.issues.filter(i => i.severity === 'suggestion'),
    }
  }, [analysis])

  const hasNoIssues = analysis && analysis.issues.length === 0
  const hasAutoFixes = optimizedCSV && optimizedCSV.fixCount > 0

  // Active preview data based on toggle
  const activeHeaders = useOptimized && optimizedCSV ? optimizedCSV.headers : analysis?.originalHeaders || []
  const activeRows = useOptimized && optimizedCSV ? optimizedCSV.rows : analysis?.originalRows || []

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isFromExcel = !!incomingState?.csvText

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Info Box */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">How it works</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
            <li>Upload a CSV file to check for issues that could affect data analysis</li>
            <li>Review errors, warnings, and suggestions for your data</li>
            <li>Choose to use the optimized version or keep the original</li>
            <li>Upload directly as a dataset or download the file</li>
          </ul>
        </div>

        {/* Upload Card — hidden when data came from Excel */}
        {!isFromExcel && (
          <div className="card p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload CSV for Analysis</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="csvFile" className="label">CSV File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="csvFile"
                  accept=".csv"
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

              {selectedFile && (
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">({formatFileSize(selectedFile.size)})</span>
                  </div>
                  <div className="flex gap-2">
                    {analysis && (
                      <button onClick={handleReset} className="btn-secondary text-sm">
                        Clear
                      </button>
                    )}
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="btn-primary text-sm"
                    >
                      {isAnalyzing ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                          Analyzing...
                        </span>
                      ) : analysis ? 'Re-analyze' : 'Analyze'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Source info when from Excel */}
        {isFromExcel && analysis && (
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Source: <span className="font-medium">{sourceName}</span> (from Excel)
              </div>
              <button
                onClick={() => navigate('/upload-excel')}
                className="btn-secondary text-sm"
              >
                Back to Excel Upload
              </button>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <>
            {/* Summary Bar */}
            <div className="card p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{analysis.rowCount.toLocaleString()}</span> rows,{' '}
                  <span className="font-medium">{analysis.columnCount}</span> columns analyzed
                </div>
                <div className="flex gap-2">
                  {issuesByType.error.length > 0 && <SeverityBadge severity="error" count={issuesByType.error.length} />}
                  {issuesByType.warning.length > 0 && <SeverityBadge severity="warning" count={issuesByType.warning.length} />}
                  {issuesByType.suggestion.length > 0 && <SeverityBadge severity="suggestion" count={issuesByType.suggestion.length} />}
                  {hasNoIssues && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      No issues found
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* No Issues */}
            {hasNoIssues && (
              <div className="card p-8 mb-6 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Your CSV looks great!</h3>
                <p className="text-gray-600 dark:text-gray-400">No issues detected. This file is ready for upload.</p>
              </div>
            )}

            {/* Issue Sections */}
            {(['error', 'warning', 'suggestion'] as const).map(severity => {
              const items = issuesByType[severity]
              if (items.length === 0) return null
              const colors = {
                error: {
                  border: 'border-red-200 dark:border-red-800',
                  bg: 'bg-red-50 dark:bg-red-900/20',
                  headerText: 'text-red-800 dark:text-red-200',
                  icon: 'text-red-600 dark:text-red-400',
                },
                warning: {
                  border: 'border-yellow-200 dark:border-yellow-800',
                  bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                  headerText: 'text-yellow-800 dark:text-yellow-200',
                  icon: 'text-yellow-600 dark:text-yellow-400',
                },
                suggestion: {
                  border: 'border-blue-200 dark:border-blue-800',
                  bg: 'bg-blue-50 dark:bg-blue-900/20',
                  headerText: 'text-blue-800 dark:text-blue-200',
                  icon: 'text-blue-600 dark:text-blue-400',
                },
              }
              const c = colors[severity]
              const titles = { error: 'Errors', warning: 'Warnings', suggestion: 'Suggestions' }
              const icons = {
                error: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
                warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
                suggestion: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              }

              return (
                <div key={severity} className={`mb-4 border ${c.border} rounded-lg overflow-hidden`}>
                  <button
                    onClick={() => toggleSection(severity)}
                    className={`w-full flex items-center justify-between p-4 ${c.bg} hover:opacity-90 transition-opacity`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[severity]} />
                      </svg>
                      <span className={`font-medium ${c.headerText}`}>
                        {titles[severity]} ({items.length})
                      </span>
                    </div>
                    <ChevronIcon open={expandedSections[severity]} />
                  </button>
                  {expandedSections[severity] && (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {items.map((issue, i) => (
                        <div key={i} className="p-4 bg-white dark:bg-gray-800">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <p className="text-sm text-gray-800 dark:text-gray-200">{issue.message}</p>
                              {issue.columns && issue.columns.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {issue.columns.map((col, j) => (
                                    <span key={j} className="inline-block px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                      {col}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {issue.autoFixable && (
                              <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                Auto-fix
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Data Version Toggle + Preview */}
            <div className="card p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {hasAutoFixes ? 'Choose Data Version' : 'Data Preview'}
                </h2>
                <div className="flex items-center gap-3">
                  <button onClick={handleDownload} className="btn-secondary text-sm">
                    Download
                  </button>
                  <button onClick={handleUploadAsDataset} className="btn-primary text-sm">
                    Upload as Dataset
                  </button>
                </div>
              </div>

              {/* Toggle: Optimized vs Original */}
              {hasAutoFixes && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setUseOptimized(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      useOptimized
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-2 border-green-500'
                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Use Optimized
                    <span className="ml-1 text-xs">({optimizedCSV!.fixCount} fixes applied)</span>
                  </button>
                  <button
                    onClick={() => setUseOptimized(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      !useOptimized
                        ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 border-2 border-gray-500'
                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Use Original (as-is)
                  </button>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{activeHeaders.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Columns</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{activeRows.length.toLocaleString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Rows</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatFileSize((useOptimized && optimizedCSV ? optimizedCSV.csvString : originalCSVString).length)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">File Size</div>
                </div>
                {hasAutoFixes && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <div className={`text-lg font-semibold ${useOptimized ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {useOptimized ? optimizedCSV!.fixCount : 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Fixes Applied</div>
                  </div>
                )}
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      {activeHeaders.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {activeRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        {row.map((val, j) => (
                          <td key={j} className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap max-w-xs truncate">
                            {val || <span className="text-gray-400 dark:text-gray-500 italic">empty</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeRows.length > 10 && (
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 text-center">
                    Showing 10 of {activeRows.length.toLocaleString()} rows
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
