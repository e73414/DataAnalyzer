import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Navigation from '../components/Navigation'

// --- Robust Excel-to-CSV conversion ---

function sheetToCleanCSV(sheet: XLSX.WorkSheet): string {
  // Convert to 2D array with all values as strings, empty cells as ''
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,       // Format dates/numbers as strings
    defval: '',       // Fill merged/empty cells with ''
    blankrows: false, // Skip entirely blank rows
  })

  if (rawData.length === 0) return ''

  // Find the actual data boundary (trim trailing empty columns)
  let maxCol = 0
  for (const row of rawData) {
    for (let c = row.length - 1; c >= 0; c--) {
      const val = String(row[c] ?? '').trim()
      if (val !== '') {
        if (c + 1 > maxCol) maxCol = c + 1
        break
      }
    }
  }
  if (maxCol === 0) return ''

  // Clean and escape each cell, build CSV
  const lines: string[] = []
  for (const row of rawData) {
    const cells: string[] = []
    for (let c = 0; c < maxCol; c++) {
      let val = String(row[c] ?? '').trim()

      // Replace Excel formula errors with empty
      if (/^#(REF|VALUE|N\/A|DIV\/0|NAME\?|NUM|NULL)!?$/i.test(val)) {
        val = ''
      }

      // Replace embedded newlines/tabs with space
      val = val.replace(/[\r\n\t]+/g, ' ').trim()

      // CSV escape: quote if contains comma, quote, or is multiword with special chars
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`
      }

      cells.push(val)
    }

    // Skip rows that are entirely empty after cleaning
    if (cells.every(c => c === '' || c === '""')) continue

    lines.push(cells.join(','))
  }

  return lines.join('\n')
}

function getSheetInfo(sheet: XLSX.WorkSheet): { rows: number; cols: number } {
  const ref = sheet['!ref']
  if (!ref) return { rows: 0, cols: 0 }
  const range = XLSX.utils.decode_range(ref)
  return { rows: range.e.r - range.s.r + 1, cols: range.e.c - range.s.c + 1 }
}

// --- Component ---

export default function ExcelUploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setError('Please select an Excel file (.xlsx or .xls)')
      setSelectedFile(null)
      setSheetNames([])
      setWorkbook(null)
      return
    }

    setError(null)
    setIsProcessing(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,    // Parse dates as Date objects for proper formatting
        cellNF: false,       // Don't need number formats
        cellText: false,     // Don't need formatted text
      })
      setSelectedFile(file)
      setWorkbook(wb)
      setSheetNames(wb.SheetNames)
      setSelectedSheet(wb.SheetNames[0] || '')
    } catch {
      setError('Failed to read Excel file. The file may be corrupted or in an unsupported format.')
      setSelectedFile(null)
      setSheetNames([])
      setWorkbook(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSubmit = () => {
    if (!workbook || !selectedSheet) return

    const sheet = workbook.Sheets[selectedSheet]
    if (!sheet) {
      setError('Selected sheet not found.')
      return
    }

    const csvText = sheetToCleanCSV(sheet)
    if (!csvText.trim()) {
      setError('Selected sheet appears to be empty.')
      return
    }

    const baseName = selectedFile?.name.replace(/\.(xlsx|xls)$/i, '') || 'excel_data'
    const fileName = `${baseName}_${selectedSheet}`

    navigate('/csv-optimizer', { state: { csvText, fileName } })
  }

  const handleReset = () => {
    setSelectedFile(null)
    setSheetNames([])
    setSelectedSheet('')
    setWorkbook(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Preview: show first few rows of selected sheet as a table
  const sheetPreview = (() => {
    if (!workbook || !selectedSheet) return null
    const sheet = workbook.Sheets[selectedSheet]
    if (!sheet) return null
    const csv = sheetToCleanCSV(sheet)
    if (!csv.trim()) return null
    const lines = csv.split('\n').slice(0, 6)
    return lines
  })()

  // Sheet metadata
  const sheetInfo = (() => {
    if (!workbook || !selectedSheet) return null
    const sheet = workbook.Sheets[selectedSheet]
    if (!sheet) return null
    return getSheetInfo(sheet)
  })()

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Info Box */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">How it works</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
            <li>Upload an Excel file (.xlsx or .xls)</li>
            <li>Select the sheet tab you want to use as your dataset</li>
            <li>The sheet will be cleaned and converted to CSV, then sent to the CSV Optimizer for review</li>
            <li>Merged cells, formula errors, and extra whitespace are automatically handled</li>
          </ul>
        </div>

        {/* Upload Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Excel File</h2>

          <div className="space-y-6">
            {/* File Input */}
            <div>
              <label htmlFor="excelFile" className="label">Excel File</label>
              <input
                ref={fileInputRef}
                type="file"
                id="excelFile"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm
                           file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700
                           dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                           transition-colors duration-200"
                disabled={isProcessing}
              />
            </div>

            {/* Processing Spinner */}
            {isProcessing && (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Reading Excel file...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* File Info + Sheet Selection */}
            {selectedFile && sheetNames.length > 0 && (
              <>
                {/* File Info */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">({formatFileSize(selectedFile.size)})</span>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      &middot; {sheetNames.length} sheet{sheetNames.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button onClick={handleReset} className="btn-secondary text-sm">
                    Clear
                  </button>
                </div>

                {/* Sheet Selection */}
                <div>
                  <label className="label">Select Sheet</label>
                  <div className="space-y-2">
                    {sheetNames.map((name) => {
                      const sheet = workbook?.Sheets[name]
                      const info = sheet ? getSheetInfo(sheet) : null
                      return (
                        <label
                          key={name}
                          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors duration-200 ${
                            selectedSheet === name
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="sheet"
                              value={name}
                              checked={selectedSheet === name}
                              onChange={() => setSelectedSheet(name)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                              </svg>
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{name}</span>
                            </div>
                          </div>
                          {info && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {info.rows} rows &times; {info.cols} cols
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Sheet Preview */}
                {sheetPreview && (
                  <div>
                    <label className="label">
                      Preview (first 5 rows)
                      {sheetInfo && (
                        <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                          — {sheetInfo.rows} rows, {sheetInfo.cols} columns in sheet
                        </span>
                      )}
                    </label>
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 whitespace-pre overflow-x-auto">
                        {sheetPreview.join('\n')}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!selectedSheet}
                  className="btn-primary w-full"
                >
                  Continue to CSV Optimizer
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
