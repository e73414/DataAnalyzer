import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import { useSession } from '../context/SessionContext'
import ReportHtml from '../components/ReportHtml'

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useSession()

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAutoRun, setHasAutoRun] = useState(false)

  const { data: sq, isLoading, error: fetchError } = useQuery({
    queryKey: ['saved-question', id],
    queryFn: () => pocketbaseService.getSavedQuestion(id!),
    enabled: !!id,
    retry: false,
  })

  // Seed the editable textarea when the question loads
  useEffect(() => {
    if (sq) setCurrentPrompt(sq.prompt)
  }, [sq])

  // Auto-run for non-editable questions
  useEffect(() => {
    if (sq && !sq.editable && !hasAutoRun && !isRunning && !result) {
      setHasAutoRun(true)
      runAnalysis(sq.prompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sq])

  // Public questions (anyone with link) skip login and lock the prompt
  const isPublic = sq?.audience?.includes('__public__')

  const runAnalysis = async (prompt: string) => {
    if (!sq) return
    // Security: public questions must run the exact saved prompt
    if (isPublic && prompt !== sq.prompt) {
      setError('This question cannot be modified.')
      return
    }
    setIsRunning(true)
    setError(null)
    try {
      const res = await n8nService.runAnalysis({
        email: sq.owner_email,
        model: sq.ai_model,
        datasetId: sq.dataset_id,
        prompt,
      })
      setResult(res.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsRunning(false)
    }
  }

  // Access checks — public questions require neither login nor audience membership
  const isNotLoggedIn = sq && !isPublic && !session?.email
  const isRestricted =
    sq &&
    !isPublic &&
    session?.email &&
    sq.audience &&
    sq.audience.length > 0 &&
    !sq.audience.includes(session.email)

  const isHtml = result != null && (() => {
    const t = result.trim()
    return t.startsWith('<') || /<(p|h[1-6]|table|ul|ol|div|strong|em|br)[\s>]/i.test(t)
  })()

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (fetchError || !sq) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950 p-4">
        <div className="max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Question not found</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">This link may have expired or been removed.</p>
        </div>
      </div>
    )
  }

  if (isNotLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950 p-4">
        <div className="max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Sign in required</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            You must be signed in to view this question.
          </p>
        </div>
      </div>
    )
  }

  if (isRestricted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-200 dark:bg-gray-950 p-4">
        <div className="max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v.01M12 9v3m9.75 3a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Access restricted</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            This question is restricted to specific users. Your account does not have access.
          </p>
        </div>
      </div>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Saved Question
            <span className="mx-1">·</span>
            <span className="font-medium text-gray-600 dark:text-gray-300">{sq.dataset_name}</span>
            <span className="mx-1">·</span>
            <span>{sq.ai_model}</span>
          </div>
        </div>

        {/* Editable prompt or read-only auto-run view */}
        {sq.editable ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Question
            </label>
            <textarea
              value={currentPrompt}
              onChange={e => setCurrentPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => runAnalysis(currentPrompt)}
                disabled={isRunning || !currentPrompt.trim()}
                className="px-5 py-2 text-sm font-medium bg-purple-900 text-white rounded-lg hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running...
                  </>
                ) : 'Run Analysis'}
              </button>
            </div>
          </div>
        ) : (
          /* Non-editable: show prompt as read-only while auto-running */
          !result && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Question
              </label>
              <div className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {sq.prompt}
              </div>
            </div>
          )
        )}

        {/* Running spinner */}
        {isRunning && (
          <div className="flex items-center justify-center gap-3 py-12 text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm">Running analysis…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Analysis Result</span>
            </div>
            <div className="p-6">
              {isHtml ? (
                <ReportHtml html={result} className="report-html" />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Powered by Data Analyzer · Dataset: {sq.dataset_name}
        </div>
      </div>
    </div>
  )
}
