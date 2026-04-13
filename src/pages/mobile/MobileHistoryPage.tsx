// src/pages/mobile/MobileHistoryPage.tsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { n8nService } from '../../services/mcpN8nService'
import Navigation from '../../components/Navigation'
import ReportHtml from '../../components/ReportHtml'
import SaveQuestionModal from '../../components/SaveQuestionModal'
import type { ConversationHistory } from '../../types'

type ViewMode = 'by-date' | 'by-dataset'
type ItemType = 'conversation' | 'report' | 'both'

interface GroupedConversations { [key: string]: ConversationHistory[] }

export default function MobileHistoryPage() {
  const { session } = useSession()
  const { appSettings } = useAppSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<ViewMode>('by-date')
  const [itemType, setItemType] = useState<ItemType>('both')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState<ConversationHistory | null>(null)

  // Single-conversation send state
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [isSending, setIsSending] = useState(false)

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversation-history', session?.email],
    queryFn: () => pocketbaseService.getConversationHistory(session!.email),
    enabled: !!session?.email,
  })

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', session?.email],
    queryFn: () => pocketbaseService.getUserProfile(session!.email),
    enabled: !!session?.email,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-history'] })
      toast.success('Conversation deleted')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete conversation')
    },
  })

  const userTimezone = userProfile?.user_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const toDate = (s: string): Date | null => {
    if (!s) return null
    let normalized = s.includes('T') ? s : s.replace(' ', 'T')
    if (!/[Zz]/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized)) normalized += 'Z'
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }

  const toDateKey = (d: Date): string =>
    d.toLocaleDateString('sv-SE', { timeZone: userTimezone })

  const getDateFromCreated = (created: string): string => {
    const d = toDate(created)
    return d ? toDateKey(d) : 'Unknown Date'
  }

  const parsePromptType = (prompt: string | null | undefined): { type: string | null; displayPrompt: string } => {
    if (!prompt) return { type: null, displayPrompt: '' }
    const match = prompt.match(/^\[(Conversation|Execute Plan|Plan Report|Scheduled)\]\s*(.*)$/s)
    if (match) return { type: match[1], displayPrompt: match[2] }
    return { type: null, displayPrompt: prompt }
  }

  const formatDate = (dateKey: string) => {
    if (!dateKey || dateKey === 'Unknown Date') return dateKey
    try {
      const [y, m, d] = dateKey.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      if (isNaN(date.getTime())) return dateKey
      return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    } catch { return dateKey }
  }

  const formatTime = (created: string) => {
    if (!created) return ''
    try {
      const d = toDate(created)
      if (!d) return ''
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })
    } catch { return '' }
  }

  const filteredConversations = useMemo(() => {
    if (!conversations) return []
    let filtered = conversations
    if (itemType === 'conversation') filtered = filtered.filter(c => !c.report_id)
    else if (itemType === 'report') filtered = filtered.filter(c => !!c.report_id)
    if (!searchQuery.trim()) return filtered
    const q = searchQuery.toLowerCase()
    return filtered.filter(c => {
      const { displayPrompt } = parsePromptType(c.prompt)
      return (
        displayPrompt.toLowerCase().includes(q) ||
        (c.response ?? '').toLowerCase().includes(q) ||
        (c.dataset_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [conversations, searchQuery, itemType])

  const groupedByDate = useMemo(() => {
    const grouped: GroupedConversations = {}
    filteredConversations.forEach(conv => {
      const date = getDateFromCreated(conv.created)
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(conv)
    })
    return grouped
  }, [filteredConversations, userTimezone])

  const groupedByDataset = useMemo(() => {
    const grouped: GroupedConversations = {}
    filteredConversations.forEach(conv => {
      const ds = conv.dataset_name
      if (!grouped[ds]) grouped[ds] = []
      grouped[ds].push(conv)
    })
    return grouped
  }, [filteredConversations])

  const dates = useMemo(() => Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a)), [groupedByDate])
  const dsKeys = useMemo(() => Object.keys(groupedByDataset).sort(), [groupedByDataset])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this conversation?')) deleteMutation.mutate(id)
  }

  const handleLoadIntoPlan = (conv: ConversationHistory) => {
    navigate('/plan-report', { state: {
      prompt: conv.prompt ?? '',
      reportPlan: conv.report_plan ?? '',
      report: conv.response ?? '',
      reportId: conv.report_id ?? '',
      datasetId: conv.dataset_id ?? '',
      datasetName: conv.dataset_name ?? '',
      aiModel: conv.ai_model ?? '',
      savedRecordId: conv.id,
    }})
  }

  const handleSendSingle = async (conv: ConversationHistory) => {
    const emails = sendEmail.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) { toast.error('Enter at least one email'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (emails.some(e => !emailRegex.test(e))) { toast.error('Invalid email format'); return }
    setIsSending(true)
    try {
      const content = `Dataset: ${conv.dataset_name}\n\nPROMPT:\n${conv.prompt}\n\nRESPONSE:\n${conv.response}`
      await n8nService.sendReport({
        emails,
        content,
        review: false,
        templateId: userProfile?.template_id,
        ...(appSettings?.report_model && { model: appSettings.report_model }),
      })
      toast.success('Report sent!')
      setSendingId(null)
      setSendEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setIsSending(false)
    }
  }

  const getTypeBadgeStyle = (type: string) => {
    switch (type) {
      case 'Conversation': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      case 'Execute Plan': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
      case 'Plan Report': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
    }
  }

  const renderCard = (conv: ConversationHistory) => {
    const isExpanded = expandedConversation === conv.id
    const { type: promptType, displayPrompt } = parsePromptType(conv.prompt)
    const isSendingThis = sendingId === conv.id

    return (
      <div key={conv.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Card header — tappable */}
        <div
          className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
          onClick={() => {
            if (isExpanded) {
              if (sendingId === conv.id) { setSendingId(null); setSendEmail('') }
              setExpandedConversation(null)
            } else {
              setExpandedConversation(conv.id)
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
                {displayPrompt || '(no prompt)'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {promptType && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getTypeBadgeStyle(promptType)}`}>
                    {promptType}
                  </span>
                )}
                {conv.report_id && !promptType && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    Report
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{conv.dataset_name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(conv.created)}</span>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-gray-700">
            {/* Response */}
            <div className="p-3 max-h-72 overflow-y-auto">
              {conv.report_id ? (
                <ReportHtml html={conv.response ?? ''} />
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {conv.response ?? '(no response)'}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-3 pb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/analyze', { state: { preSelectedDatasetId: conv.dataset_id } })}
                className="flex-1 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                Load into Analyze
              </button>
              {conv.report_id && (
                <button
                  type="button"
                  onClick={() => handleLoadIntoPlan(conv)}
                  className="flex-1 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                >
                  Load into Plan
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSaveModal(conv)}
                className="flex-1 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Save Question
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sendingId === conv.id) { setSendingId(null); setSendEmail('') }
                  else { setSendingId(conv.id); setSendEmail('') }
                }}
                className="flex-1 py-2 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                Send Report
              </button>
              <button
                type="button"
                onClick={() => handleDelete(conv.id)}
                disabled={deleteMutation.isPending}
                className="py-2 px-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            </div>

            {/* Inline send form */}
            {isSendingThis && (
              <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <input
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="input-field py-3"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSendSingle(conv)}
                  disabled={isSending || !sendEmail.trim()}
                  className="w-full py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const groups = viewMode === 'by-date' ? dates : dsKeys
  const grouped = viewMode === 'by-date' ? groupedByDate : groupedByDataset

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />

      <main className="px-4 py-4 space-y-3">

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="w-full pl-9 pr-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['both', 'conversation', 'report'] as ItemType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setItemType(type)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                itemType === type
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              }`}
            >
              {type === 'both' ? 'All' : type === 'conversation' ? 'Questions' : 'Reports'}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['by-date', 'by-dataset'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {mode === 'by-date' ? 'By Date' : 'By Dataset'}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : 'Failed to load history'}
            </p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No results found.' : 'No history yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(groupKey => {
              const items = grouped[groupKey] ?? []
              if (items.length === 0) return null
              const isOpen = expandedGroups.has(groupKey)
              const label = viewMode === 'by-date' ? formatDate(groupKey) : groupKey
              return (
                <div key={groupKey}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center justify-between py-1.5 text-left"
                  >
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{items.length}</span>
                  </button>
                  {(!expandedGroups.size || isOpen) && (
                    <div className="space-y-2">
                      {items.map(conv => renderCard(conv))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Save Question modal — reuse desktop component */}
      {showSaveModal && (
        <SaveQuestionModal
          conv={showSaveModal}
          onClose={() => setShowSaveModal(null)}
        />
      )}
    </div>
  )
}
