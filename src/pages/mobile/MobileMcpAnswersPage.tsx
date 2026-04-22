// src/pages/mobile/MobileMcpAnswersPage.tsx
import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { useAccessibleDatasets } from '../../hooks/useAccessibleDatasets'
import { mcpAnswersService } from '../../services/mcpAnswersService'
import { n8nService } from '../../services/mcpN8nService'
import Navigation from '../../components/Navigation'
import SaveQuestionModal from '../../components/SaveQuestionModal'
import ReportHtml from '../../components/ReportHtml'
import type { McpAnswersChatEntry } from '../../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function isHtmlAnswer(text: string): boolean {
  const t = text.trim()
  return t.startsWith('<') || /<(p|h[1-6]|table|ul|ol|div|strong|em|br)[\s>]/i.test(t)
}

function isClarificationResponse(text: string): boolean {
  const trimmed = text.trimEnd()
  if (trimmed.endsWith('?')) return true
  const lower = text.toLowerCase()
  return (
    lower.includes('could you clarify') ||
    lower.includes('could you please clarify') ||
    lower.includes('can you clarify') ||
    lower.includes('can you please') ||
    lower.includes('could you specify') ||
    lower.includes('please specify') ||
    lower.includes('please clarify') ||
    lower.includes('what do you mean') ||
    lower.includes('do you mean')
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SqlBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-xs font-mono text-gray-600 dark:text-gray-400"
      >
        <span>SQL</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <pre className="px-3 py-2 text-xs bg-gray-900 text-green-400 overflow-x-auto whitespace-pre-wrap">{sql}</pre>
      )}
    </div>
  )
}

function ResultsTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = expanded ? rows : rows.slice(0, 5)
  return (
    <div className="mt-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map(col => (
                <th key={col} className="px-2.5 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                {columns.map(col => (
                  <td key={col} className="px-2.5 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 5 && (
        <button onClick={() => setExpanded(e => !e)} className="mt-1 text-xs text-blue-500 dark:text-blue-400">
          {expanded ? 'Show less' : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  )
}

function ChatBubble({ entry, onSave }: { entry: McpAnswersChatEntry; onSave: (entry: McpAnswersChatEntry) => void }) {
  const isClarification = isClarificationResponse(entry.answer)
  const isHtml = isHtmlAnswer(entry.answer)

  return (
    <div className="mb-3">
      {/* User question — right */}
      <div className="flex justify-end mb-2">
        <div className="max-w-[85%] bg-purple-900 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm shadow-sm">
          {entry.question}
        </div>
      </div>

      {/* AI answer — left */}
      <div className="flex justify-start">
        <div className={`max-w-[92%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm border text-sm ${
          isClarification
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
        }`}>
          {isClarification && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Clarification needed
            </div>
          )}
          {isHtml ? (
            <ReportHtml html={entry.answer} className="report-html" />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-100
              prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
              prose-headings:text-gray-900 dark:prose-headings:text-white
              prose-strong:text-gray-900 dark:prose-strong:text-white
              prose-code:text-purple-700 dark:prose-code:text-purple-300
              prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:rounded prose-code:px-1">
              <ReactMarkdown>{entry.answer}</ReactMarkdown>
            </div>
          )}
          {entry.sql && <SqlBlock sql={entry.sql} />}
          {entry.columns && entry.rows && entry.rows.length > 0 && (
            <ResultsTable columns={entry.columns} rows={entry.rows} />
          )}
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => onSave(entry)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DatasetScope = 'all' | 'mine' | 'company' | 'unit' | 'team'

const SCOPE_CHIPS: { id: DatasetScope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'company', label: 'Company' },
  { id: 'unit', label: 'Unit' },
  { id: 'team', label: 'Team' },
]

export default function MobileMcpAnswersPage() {
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const { datasets, isLoading: datasetsLoading } = useAccessibleDatasets()

  // Dataset selection
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [datasetSearch, setDatasetSearch] = useState('')
  const [showDatasetSheet, setShowDatasetSheet] = useState(false)
  const [datasetScope, setDatasetScope] = useState<DatasetScope>('all')

  // Chat state
  const [question, setQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [entries, setEntries] = useState<McpAnswersChatEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saveEntry, setSaveEntry] = useState<McpAnswersChatEntry | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scoped + filtered datasets
  const scopedDatasets = useMemo(() => {
    const profile = session?.profile?.trim() || ''
    if (datasetScope === 'all') return datasets
    if (datasetScope === 'mine') return datasets.filter(d => d.owner_email === session?.email)
    if (profile.length < 9 || profile === 'admadmadm') return datasets
    const uCo = profile.substring(0, 3), uBu = profile.substring(3, 6), uTm = profile.substring(6, 9)
    return datasets.filter(d => {
      const pc = (d.profile_code || '').trim()
      if (!pc) return false
      const pCo = pc.substring(0, 3), pBu = pc.substring(3, 6), pTm = pc.substring(6, 9)
      if (datasetScope === 'company') return pCo === uCo && pBu === '000' && pTm === '000'
      if (datasetScope === 'unit')    return pCo === uCo && pBu === uBu  && pTm === '000'
      if (datasetScope === 'team')    return pCo === uCo && pBu === uBu  && pTm === uTm
      return false
    })
  }, [datasets, datasetScope, session])

  const filteredDatasets = useMemo(() => {
    const term = datasetSearch.toLowerCase()
    return [...scopedDatasets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(d => !term || d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term))
  }, [scopedDatasets, datasetSearch])

  const selectedDataset = useMemo(() => datasets.find(d => d.id === selectedDatasetId), [datasets, selectedDatasetId])

  // Sample questions for selected dataset
  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  // Conversation history for multi-turn
  const conversationHistory = useMemo(() =>
    entries.flatMap(e => [
      { role: 'user' as const, content: e.question },
      { role: 'assistant' as const, content: e.answer },
    ]),
    [entries]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, isAsking])

  async function handleSubmit() {
    const q = question.trim()
    if (!q || isAsking) return
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsAsking(true)
    setError(null)
    setQuestion('')
    setPendingQuestion(q)
    try {
      const result = await mcpAnswersService.query({
        question: q,
        email: session!.email,
        datasetId: selectedDatasetId || undefined,
        datasetName: selectedDataset?.name || undefined,
        conversationHistory,
      }, controller.signal)
      setPendingQuestion(null)
      setEntries(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        question: q,
        answer: result.answer,
        sql: result.sql,
        rows: result.rows,
        columns: result.columns,
        timestamp: new Date(),
        model: result.model || undefined,
        datasetId: selectedDatasetId || undefined,
        datasetName: selectedDataset?.name || undefined,
        queriedDatasets: result.queriedDatasets || [],
      }])
    } catch (err: unknown) {
      setPendingQuestion(null)
      const isCancelled = (err instanceof Error && err.name === 'CanceledError') ||
        (err as { code?: string })?.code === 'ERR_CANCELED'
      if (!isCancelled) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      abortControllerRef.current = null
      setIsAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const sampleQuestions = datasetDetail?.sample_questions?.questions || []

  return (
    <div className="flex flex-col h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />

      {/* Dataset bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setShowDatasetSheet(true)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="min-w-0">
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide leading-none mb-0.5">Dataset</p>
            <p className="text-sm text-gray-900 dark:text-white truncate">
              {selectedDataset ? selectedDataset.name : 'All accessible datasets'}
            </p>
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Sample questions (when dataset selected) */}
      {sampleQuestions.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {sampleQuestions.map((q: any) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuestion(q.question)}
                disabled={isAsking}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-400 bg-white dark:bg-gray-800 whitespace-nowrap transition-colors"
              >
                {q.question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 && !isAsking && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-600 pb-8">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">Ask anything about your data</p>
            <p className="text-xs mt-1 px-6">e.g. "What were the top 5 products by revenue last quarter?"</p>
          </div>
        )}

        {entries.map(entry => (
          <ChatBubble key={entry.id} entry={entry} onSave={setSaveEntry} />
        ))}

        {pendingQuestion && (
          <div className="flex justify-end mb-2">
            <div className="max-w-[85%] bg-purple-900 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm shadow-sm">
              {pendingQuestion}
            </div>
          </div>
        )}

        {isAsking && (
          <div className="flex justify-start mb-3">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
              <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — sticky at bottom */}
      <div className="bg-purple-50 dark:bg-gray-800/60 border-t border-purple-100 dark:border-gray-700 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data…"
            rows={2}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
          {isAsking ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!question.trim()}
              className="flex-shrink-0 px-4 py-2 bg-purple-900 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Ask
            </button>
          )}
        </div>
      </div>

      {/* Dataset picker sheet */}
      {showDatasetSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDatasetSheet(false)} />

          {/* Sheet */}
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl max-h-[80vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            <div className="px-4 pb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Select Dataset</h2>
              <button
                type="button"
                onClick={() => setShowDatasetSheet(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  value={datasetSearch}
                  onChange={e => setDatasetSearch(e.target.value)}
                  placeholder="Search datasets…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
            </div>

            {/* Scope chips */}
            <div className="px-4 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {SCOPE_CHIPS.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setDatasetScope(chip.id)}
                    className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      datasetScope === chip.id
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dataset list */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {/* "All" option */}
              <button
                type="button"
                onClick={() => { setSelectedDatasetId(''); setDatasetSearch(''); setShowDatasetSheet(false) }}
                className={`w-full text-left px-3 py-3 rounded-lg mb-1 text-sm transition-colors ${
                  !selectedDatasetId
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium'
                    : 'text-gray-500 dark:text-gray-400 italic hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                All accessible datasets
              </button>

              {datasetsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
                </div>
              ) : filteredDatasets.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No datasets found</p>
              ) : (
                <div className="space-y-1">
                  {filteredDatasets.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => { setSelectedDatasetId(d.id); setDatasetSearch(''); setShowDatasetSheet(false) }}
                      className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                        selectedDatasetId === d.id
                          ? 'bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <p className={`text-sm font-medium ${selectedDatasetId === d.id ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'}`}>
                        {d.name}
                        {d.row_count != null && (
                          <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">({d.row_count.toLocaleString()} rows)</span>
                        )}
                      </p>
                      {d.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{d.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save Question modal */}
      {saveEntry && session && (
        <SaveQuestionModal
          conv={{
            prompt: saveEntry.question,
            dataset_id: saveEntry.datasetId || saveEntry.queriedDatasets?.[0]?.datasetId || null,
            dataset_name: saveEntry.datasetName || saveEntry.queriedDatasets?.[0]?.datasetName || null,
            ai_model: saveEntry.model || appSettings?.analyze_model || 'mcp-answers',
            user_email: session.email,
          }}
          source="mcp_answers"
          onClose={() => setSaveEntry(null)}
          onSaved={() => setSaveEntry(null)}
        />
      )}
    </div>
  )
}
