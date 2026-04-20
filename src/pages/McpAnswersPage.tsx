import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { useSession } from '../context/SessionContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import { mcpAnswersService } from '../services/mcpAnswersService'
import { n8nService } from '../services/mcpN8nService'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import PageTitle from '../components/PageTitle'
import SaveQuestionModal from '../components/SaveQuestionModal'
import ReportHtml from '../components/ReportHtml'
import type { McpAnswersChatEntry } from '../types'

function isHtmlAnswer(text: string): boolean {
  const t = text.trim()
  return t.startsWith('<') || /<(p|h[1-6]|table|ul|ol|div|strong|em|br)[\s>]/i.test(t)
}

/** Returns true if the answer text is primarily a question / clarification request */
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
    lower.includes('which') && trimmed.endsWith('?') ||
    lower.includes('what do you mean') ||
    lower.includes('do you mean')
  )
}

function SqlBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-xs font-mono text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span>SQL</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  const displayRows = expanded ? rows : rows.slice(0, 10)
  return (
    <div className="mt-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
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
    <div className="mb-4">
      <div className="flex justify-end mb-2">
        <div className="max-w-xl bg-purple-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm">
          {entry.question}
        </div>
      </div>
      <div className="flex justify-start">
        <div className={`max-w-3xl rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border ${
          isClarification
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
        }`}>
          {isClarification && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
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
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onSave(entry)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
              title="Save question"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Save question
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function McpAnswersPage() {
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const { datasets, isLoading: datasetsLoading } = useAccessibleDatasets()

  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [datasetSearch, setDatasetSearch] = useState('')
  const [showDatasetDropdown, setShowDatasetDropdown] = useState(false)
  const [datasetScope, setDatasetScope] = useState<'all' | 'mine' | 'company' | 'unit' | 'team'>('all')
  const datasetDropdownRef = useRef<HTMLDivElement>(null)

  const [question, setQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [entries, setEntries] = useState<McpAnswersChatEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saveEntry, setSaveEntry] = useState<McpAnswersChatEntry | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (selectedDatasetId && datasets.length > 0) {
      const found = datasets.find(d => d.id === selectedDatasetId)
      if (found) setDatasetSearch(found.name)
    }
  }, [selectedDatasetId, datasets])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (datasetDropdownRef.current && !datasetDropdownRef.current.contains(e.target as Node))
        setShowDatasetDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  const { data: datasetPreview, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['dataset-preview', selectedDatasetId],
    queryFn: () => pocketbaseService.getDatasetPreview(selectedDatasetId, session!.email, 20),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  const dbToOriginal = useMemo<Record<string, string>>(() => {
    if (!datasetDetail?.column_mapping) return {}
    const mapping = typeof datasetDetail.column_mapping === 'string'
      ? (() => { try { return JSON.parse(datasetDetail.column_mapping) } catch { return {} } })()
      : datasetDetail.column_mapping
    const result: Record<string, string> = {}
    Object.entries(mapping as Record<string, string>).forEach(([orig, db]) => { result[db] = orig })
    return result
  }, [datasetDetail])

  // Build conversation history from chat entries for multi-turn context
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || isAsking) return
    setIsAsking(true)
    setError(null)
    setQuestion('')
    setPendingQuestion(q)
    try {
      const selectedDataset = datasets.find(d => d.id === selectedDatasetId)
      const result = await mcpAnswersService.query({
        question: q,
        email: session!.email,
        datasetId: selectedDatasetId || undefined,
        datasetName: selectedDataset?.name || undefined,
        conversationHistory,
      })
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
    } catch (err) {
      setPendingQuestion(null)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsAsking(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <PageTitle fallback="MCP Answers" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ask questions about your data in plain language</p>
        </div>

        {/* Top card: dataset selector + preview + sample questions */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 mb-6">

          {/* Dataset selector */}
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap w-20 shrink-0">Dataset</label>
              <div className="flex flex-1 gap-2 items-center">
                <div className="relative flex-1" ref={datasetDropdownRef}>
                  <input
                    type="text"
                    value={datasetSearch}
                    onChange={(e) => { setDatasetSearch(e.target.value); setSelectedDatasetId(''); setShowDatasetDropdown(true) }}
                    onFocus={() => setShowDatasetDropdown(true)}
                    placeholder="All accessible datasets…"
                    className="input-field w-full pr-8"
                    disabled={isAsking}
                    autoComplete="off"
                  />
                  {datasetSearch && !isAsking && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setDatasetSearch(''); setSelectedDatasetId(''); setShowDatasetDropdown(true) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                      tabIndex={-1}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  {showDatasetDropdown && !isAsking && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                      <div
                        onMouseDown={() => { setSelectedDatasetId(''); setDatasetSearch(''); setShowDatasetDropdown(false) }}
                        className={`px-3 py-2 cursor-pointer text-sm italic hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-500 dark:text-gray-400 ${!selectedDatasetId ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                      >
                        All accessible datasets
                      </div>
                      {datasetsLoading ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
                      ) : filteredDatasets.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No datasets found</div>
                      ) : filteredDatasets.map(d => (
                        <div
                          key={d.id}
                          onMouseDown={() => { setSelectedDatasetId(d.id); setDatasetSearch(d.name); setShowDatasetDropdown(false) }}
                          className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${selectedDatasetId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}
                        >
                          <div className="text-gray-900 dark:text-gray-100">{d.name}{d.row_count != null ? ` (rows: ${d.row_count.toLocaleString()})` : ''}</div>
                          {d.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.description}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Scope</label>
                  <select
                    value={datasetScope}
                    onChange={(e) => setDatasetScope(e.target.value as typeof datasetScope)}
                    className="input-field text-sm py-1.5 px-2 min-w-fit"
                    disabled={isAsking}
                  >
                    <option value="all">All</option>
                    <option value="mine">My Datasets</option>
                    <option value="company">Company Datasets</option>
                    <option value="unit">Unit Datasets</option>
                    <option value="team">Team Datasets</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Dataset preview */}
          {selectedDatasetId && (
            isLoadingPreview ? (
              <div className="flex items-center justify-center gap-2 py-4 px-6 border-b border-gray-100 dark:border-gray-800">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Loading preview…</span>
              </div>
            ) : datasetPreview && datasetPreview.columns.length > 0 ? (() => {
              const displayColumns = datasetPreview.columns.filter(col => dbToOriginal[col])
              return (
                <div className="overflow-x-auto overflow-y-auto max-h-44 border-b border-gray-100 dark:border-gray-800">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                      <tr>
                        {displayColumns.map(col => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                            {dbToOriginal[col]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {datasetPreview.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          {displayColumns.map(col => (
                            <td key={col} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap max-w-[200px] truncate">
                              {row[col] != null ? String(row[col]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })() : null
          )}

          {/* Sample questions */}
          {datasetDetail?.sample_questions?.questions && datasetDetail.sample_questions.questions.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Sample questions</p>
              <div className="flex flex-wrap gap-2">
                {datasetDetail.sample_questions.questions.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQuestion(q.question)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    {q.question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat card — chat area (white) + input footer (gray, matching Analyze page) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">

          {/* Chat body */}
          <div className="px-6 py-4 min-h-[120px]">
            {entries.length === 0 && !isAsking && !error && (
              <div className="flex flex-col items-center justify-center py-6 text-center text-gray-400 dark:text-gray-600">
                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-sm">Ask anything about your data</p>
                <p className="text-xs mt-1">e.g. "What were the top 5 products by revenue last quarter?"</p>
              </div>
            )}

            {entries.map(entry => <ChatBubble key={entry.id} entry={entry} onSave={setSaveEntry} />)}

            {pendingQuestion && (
              <div className="flex justify-end mb-2">
                <div className="max-w-xl bg-purple-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm">
                  {pendingQuestion}
                </div>
              </div>
            )}

            {isAsking && (
              <div className="flex justify-start mb-4">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                  <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing your data…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input footer — different background matching Analyze page action area */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your data… (Enter to send, Shift+Enter for newline)"
                disabled={isAsking}
                rows={2}
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim()}
                className="flex-shrink-0 px-4 py-2 bg-purple-900 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isAsking ? 'Asking…' : 'Ask'}
              </button>
            </form>
          </div>
        </div>
      </main>

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
