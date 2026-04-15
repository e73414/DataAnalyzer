import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { n8nService } from '../services/mcpN8nService'
import type { AiAnalysisResult, AiIssue, AiDataBlock } from '../types'

interface AiReviewState {
  csvFile: File
  fileName: string
  headers: string[]
  rows: string[][]
  rowCount: number
  columnCount: number
  profile?: Record<string, unknown>
  existingIssues: string[]
  // passed through to UploadDatasetPage unchanged
  ingestionConfig?: unknown
  sourceInfo?: unknown
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

function severityBadge(severity: AiIssue['severity']) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
        Critical
      </span>
    )
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
        Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
      Info
    </span>
  )
}

export default function AiReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as AiReviewState | null

  const [result, setResult] = useState<AiAnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!state) {
      navigate('/upload-excel')
      return
    }
    runAnalysis()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function runAnalysis() {
    if (!state) return
    setLoading(true)
    setError(null)

    const { rows, headers, rowCount, columnCount, fileName, profile, existingIssues } = state
    const dataBlocks = detectDataBlocks(rows)

    try {
      const res = await n8nService.analyzeDataQuality({
        fileName,
        headers,
        firstRows: rows.slice(0, 20),
        lastRows: rows.slice(-10),
        dataBlocks: dataBlocks.length > 1 ? dataBlocks : [],
        rowCount,
        columnCount,
        profile,
        existingIssues: existingIssues || [],
      })
      setResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AiReviewPage] analyzeDataQuality failed:', msg)
      setError(`AI review unavailable: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  function navigateToUpload() {
    if (!state) return
    navigate('/upload-dataset', {
      state: {
        csvFile: state.csvFile,
        fileName: state.fileName,
        ingestionConfig: state.ingestionConfig,
        sourceInfo: state.sourceInfo,
      }
    })
  }

  function handleContinue() { navigateToUpload() }
  function handleSkip() { navigateToUpload() }

  const criticalIssues = result?.issues.filter(i => i.severity === 'critical') ?? []
  const otherIssues = result?.issues.filter(i => i.severity !== 'critical') ?? []
  const allCriticalAcknowledged = criticalIssues.every((_, idx) => acknowledged.has(idx))
  const canContinue = !loading && (error !== null || allCriticalAcknowledged || criticalIssues.length === 0)

  if (!state) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Data Quality Review</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Reviewing <span className="font-medium">{state.fileName}</span> for data quality issues before upload.
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500 border-t-transparent" />
              <p className="text-gray-600 dark:text-gray-400 text-sm">AI is reviewing your data for quality issues...</p>
            </div>
          </div>
        )}

        {/* Error / unavailable */}
        {!loading && error && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-300">{error}</p>
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <>
            {/* Summary */}
            {result.summary && (
              <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p className="text-sm text-purple-800 dark:text-purple-300">{result.summary}</p>
              </div>
            )}

            {result.issues.length === 0 && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-300 font-medium">No issues found. Your data looks clean.</p>
              </div>
            )}

            {/* Critical issues */}
            {criticalIssues.length > 0 && (
              <div className="card p-6 mb-6">
                <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4">
                  Critical Issues — Acknowledge to Continue
                </h2>
                <div className="space-y-4">
                  {criticalIssues.map((issue, idx) => (
                    <label key={idx} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledged.has(idx)}
                        onChange={e => {
                          setAcknowledged(prev => {
                            const next = new Set(prev)
                            e.target.checked ? next.add(idx) : next.delete(idx)
                            return next
                          })
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {severityBadge(issue.severity)}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{issue.type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{issue.description}</p>
                        {issue.suggested_fix && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span className="font-medium">Suggested fix:</span> {issue.suggested_fix}
                          </p>
                        )}
                        {(issue.columns?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Columns: {issue.columns!.join(', ')}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings and info */}
            {otherIssues.length > 0 && (
              <div className="card p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Warnings & Notes</h2>
                <div className="space-y-4">
                  {otherIssues.map((issue, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {severityBadge(issue.severity)}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{issue.type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{issue.description}</p>
                        {issue.suggested_fix && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span className="font-medium">Suggested fix:</span> {issue.suggested_fix}
                          </p>
                        )}
                        {(issue.columns?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Columns: {issue.columns!.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column suggestions */}
            {result.column_suggestions && result.column_suggestions.length > 0 && (
              <div className="card p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Column Suggestions</h2>
                <div className="space-y-3">
                  {result.column_suggestions.map((s, idx) => (
                    <div key={idx} className="text-sm border-l-2 border-blue-400 dark:border-blue-600 pl-3">
                      <span className="font-medium text-gray-900 dark:text-white">{s.original}</span>
                      {s.suggested_name && s.suggested_name !== s.original && (
                        <span className="text-gray-500 dark:text-gray-400"> → <span className="font-mono">{s.suggested_name}</span></span>
                      )}
                      {s.suggested_type && (
                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">({s.suggested_type})</span>
                      )}
                      {s.date_format && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">format: {s.date_format}</span>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        {!loading && (
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
            >
              Skip AI Review
            </button>
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className="btn-primary"
            >
              Continue to Upload →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
