import { useState, useEffect } from 'react'
import axios from 'axios'
import type { AiAnalysisResult } from '../types'

interface CleanResponse {
  cleaned_csv: string
  changes_applied: {
    headers_merged: number
    islands_removed: number
    rows_dropped: number
    columns_renamed: number
  }
}

interface AiReviewModalProps {
  isOpen: boolean
  onClose: () => void
  cleaningPlan: AiAnalysisResult
  csvText: string
  fileName: string
  onCleanComplete: (cleanedCsvText: string, changes: CleanResponse['changes_applied']) => void
}

export default function AiReviewModal({
  isOpen,
  onClose,
  cleaningPlan,
  csvText,
  fileName,
  onCleanComplete,
}: AiReviewModalProps) {
  const [isCleaning, setIsCleaning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [changes, setChanges] = useState<CleanResponse['changes_applied'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setIsCleaning(false)
      setIsDone(false)
      setChanges(null)
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const hasAnythingToClean =
    (cleaningPlan.header_merges?.length ?? 0) > 0 ||
    (cleaningPlan.data_islands?.length ?? 0) > 0 ||
    (cleaningPlan.rows_to_exclude?.length ?? 0) > 0 ||
    (cleaningPlan.column_suggestions?.some(s => s.suggested_name && s.suggested_name !== s.original) ?? false)

  const buildCleaningPlanPayload = () => ({
    header_merges: cleaningPlan.header_merges ?? [],
    data_islands: cleaningPlan.data_islands ?? [],
    rows_to_exclude: cleaningPlan.rows_to_exclude ?? [],
    column_renames: Object.fromEntries(
      (cleaningPlan.column_suggestions ?? [])
        .filter(s => s.suggested_name && s.suggested_name !== s.original)
        .map(s => [s.original, s.suggested_name!])
    ),
  })

  const handleAcceptAndClean = async () => {
    setIsCleaning(true)
    setError(null)
    try {
      const formData = new FormData()
      const blob = new Blob([csvText], { type: 'text/csv' })
      formData.append('file', blob, fileName)
      formData.append('cleaning_plan', JSON.stringify(buildCleaningPlanPayload()))
      const response = await axios.post<CleanResponse>('/excel-to-sql/clean', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      const { cleaned_csv, changes_applied } = response.data
      setChanges(changes_applied)
      setIsDone(true)
      setTimeout(() => {
        setIsDone(false)
        setChanges(null)
        onCleanComplete(cleaned_csv, changes_applied)
        onClose()
      }, 1500)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(String(err.response.data.detail))
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">

        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Data Review</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Reviewing <span className="font-medium">{fileName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCleaning}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* Summary */}
          {cleaningPlan.summary && (
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-800 dark:text-purple-300">{cleaningPlan.summary}</p>
            </div>
          )}

          {/* Header Merges */}
          {(cleaningPlan.header_merges?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Header Merges</h3>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Source Rows</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Merged Headers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {cleaningPlan.header_merges!.map((m, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          rows {m.source_rows.join(', ')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                          {m.merged_headers.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Islands */}
          {(cleaningPlan.data_islands?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Data Islands to Remove</h3>
              <div className="space-y-2">
                {cleaningPlan.data_islands!.map((island, i) => (
                  <div key={i} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="text-xs font-medium text-red-700 dark:text-red-400">
                      Rows {island.start_row}–{island.end_row}, Cols {island.start_col}–{island.end_col}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-300 mt-0.5">{island.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column Renames (from column_suggestions) */}
          {(cleaningPlan.column_suggestions?.filter(s => s.suggested_name && s.suggested_name !== s.original).length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Column Renames</h3>
              <div className="space-y-1.5">
                {cleaningPlan.column_suggestions!
                  .filter(s => s.suggested_name && s.suggested_name !== s.original)
                  .map((s, i) => (
                    <div key={i} className="text-sm border-l-2 border-blue-400 dark:border-blue-600 pl-3">
                      <span className="font-mono text-gray-600 dark:text-gray-400">{s.original}</span>
                      <span className="text-gray-400 dark:text-gray-500"> → </span>
                      <span className="font-mono font-medium text-gray-900 dark:text-white">{s.suggested_name}</span>
                      {s.reason && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.reason}</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Row exclusions */}
          {(cleaningPlan.rows_to_exclude?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rows to Drop</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cleaningPlan.rows_to_exclude!.length} row
                {cleaningPlan.rows_to_exclude!.length !== 1 ? 's' : ''} flagged:{' '}
                rows {cleaningPlan.rows_to_exclude!.slice(0, 10).join(', ')}
                {cleaningPlan.rows_to_exclude!.length > 10 ? '…' : ''}
              </p>
            </div>
          )}

          {/* Nothing to clean */}
          {!hasAnythingToClean && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                No cleaning needed. Your data looks clean.
              </p>
            </div>
          )}

          {/* Success state */}
          {isDone && changes && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">✓ Data cleaned successfully</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {changes.headers_merged} headers merged · {changes.islands_removed} island rows removed ·{' '}
                {changes.rows_dropped} rows dropped · {changes.columns_renamed} columns renamed
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} disabled={isCleaning} className="btn-secondary">
            Skip
          </button>
          {hasAnythingToClean && !isDone && (
            <button onClick={handleAcceptAndClean} disabled={isCleaning} className="btn-primary">
              {isCleaning ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Cleaning…
                </span>
              ) : (
                'Accept & Clean'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
