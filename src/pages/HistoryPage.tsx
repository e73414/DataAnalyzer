import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { ConversationHistory } from '../types'

type ViewMode = 'by-date' | 'by-dataset'

interface GroupedConversations {
  [key: string]: ConversationHistory[]
}

export default function HistoryPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('by-date')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null)
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [recipientEmails, setRecipientEmails] = useState('')
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [editBeforeSending, setEditBeforeSending] = useState(false)

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewSubject, setReviewSubject] = useState('')
  const [reviewEmails, setReviewEmails] = useState('')
  const [reviewContent, setReviewContent] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversation-history', session?.email],
    queryFn: () => pocketbaseService.getConversationHistory(session!.email),
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

  // Helper to extract date from Pocketbase datetime (handles both "2024-01-15 10:30:00" and "2024-01-15T10:30:00" formats)
  const getDateFromCreated = (created: string): string => {
    if (!created) return 'Unknown Date'
    // Pocketbase uses space-separated format, but also handle ISO format
    const parts = created.split(/[T\s]/)
    return parts[0] || 'Unknown Date'
  }

  // Group conversations by date
  const groupedByDate = useMemo(() => {
    if (!conversations) return {}
    const grouped: GroupedConversations = {}
    conversations.forEach((conv) => {
      const date = getDateFromCreated(conv.created)
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(conv)
    })
    return grouped
  }, [conversations])

  // Group conversations by dataset
  const groupedByDataset = useMemo(() => {
    if (!conversations) return {}
    const grouped: GroupedConversations = {}
    conversations.forEach((conv) => {
      const dataset = conv.dataset_name
      if (!grouped[dataset]) grouped[dataset] = []
      grouped[dataset].push(conv)
    })
    return grouped
  }, [conversations])

  // Get unique dates sorted descending
  const dates = useMemo(() => {
    return Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))
  }, [groupedByDate])

  // Get unique datasets sorted
  const datasets = useMemo(() => {
    return Object.keys(groupedByDataset).sort()
  }, [groupedByDataset])

  // Toggle group expansion
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  // Toggle conversation selection
  const toggleConversationSelection = (convId: string) => {
    setSelectedConversations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(convId)) {
        newSet.delete(convId)
      } else {
        newSet.add(convId)
      }
      return newSet
    })
  }

  // Select/deselect all conversations in a group
  const toggleGroupSelection = (groupKey: string) => {
    const groupConvs = viewMode === 'by-date' ? groupedByDate[groupKey] : groupedByDataset[groupKey]
    if (!groupConvs) return

    const groupIds = groupConvs.map((c) => c.id)
    const allSelected = groupIds.every((id) => selectedConversations.has(id))

    setSelectedConversations((prev) => {
      const newSet = new Set(prev)
      if (allSelected) {
        groupIds.forEach((id) => newSet.delete(id))
      } else {
        groupIds.forEach((id) => newSet.add(id))
      }
      return newSet
    })
  }

  // Get selected conversations data
  const selectedConversationData = useMemo(() => {
    if (!conversations) return []
    return conversations.filter((c) => selectedConversations.has(c.id))
  }, [conversations, selectedConversations])

  // Build report content from selected conversations
  const buildReportContent = () => {
    return selectedConversationData
      .map((conv) => {
        const date = formatDate(getDateFromCreated(conv.created))
        const time = formatTime(conv.created)
        return `=== ${date} at ${time} ===\nDataset: ${conv.dataset_name}\nAI Model: ${conv.ai_model}\n\nPROMPT:\n${conv.prompt}\n\nRESPONSE:\n${conv.response}\n`
      })
      .join('\n' + '='.repeat(50) + '\n\n')
  }

  // Send report via n8n webhook
  const handleSendReport = async () => {
    if (selectedConversations.size === 0) {
      toast.error('Please select at least one conversation')
      return
    }

    const emails = recipientEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)

    if (emails.length === 0) {
      toast.error('Please enter at least one recipient email')
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = emails.filter((e) => !emailRegex.test(e))
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email format: ${invalidEmails.join(', ')}`)
      return
    }

    setIsSendingReport(true)
    try {
      const reportContent = buildReportContent()
      const result = await n8nService.sendReport({
        emails: emails,
        content: reportContent,
        review: editBeforeSending,
      })

      if (editBeforeSending) {
        // Open review modal with the returned data (use defaults if missing)
        setReviewSubject(result.subject ?? 'Data Analysis Report')
        setReviewEmails(result.emails?.join(', ') ?? emails.join(', '))
        setReviewContent(result.content ?? reportContent)
        setShowReviewModal(true)
      } else {
        toast.success('Report sent successfully!')
        setSelectedConversations(new Set())
        setRecipientEmails('')
        setEditBeforeSending(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send report')
    } finally {
      setIsSendingReport(false)
    }
  }

  // Send email after review/edit
  const handleSendEmail = async () => {
    const emails = reviewEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)

    if (emails.length === 0) {
      toast.error('Please enter at least one recipient email')
      return
    }

    if (!reviewSubject.trim()) {
      toast.error('Please enter a subject')
      return
    }

    if (!reviewContent.trim()) {
      toast.error('Please enter content')
      return
    }

    setIsSendingEmail(true)
    try {
      await n8nService.sendEmail({
        subject: reviewSubject,
        emails: emails,
        content: reviewContent,
      })
      toast.success('Email sent successfully!')
      setShowReviewModal(false)
      setSelectedConversations(new Set())
      setRecipientEmails('')
      setEditBeforeSending(false)
      setReviewSubject('')
      setReviewEmails('')
      setReviewContent('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send email')
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleCloseReviewModal = () => {
    setShowReviewModal(false)
    setReviewSubject('')
    setReviewEmails('')
    setReviewContent('')
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Unknown Date') return dateStr
    try {
      // Handle Pocketbase format "2024-01-15 10:30:00.000Z" by replacing space with T
      const isoDate = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
      const date = new Date(isoDate)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      // Handle Pocketbase format
      const isoDate = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
      const date = new Date(isoDate)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  const handleDeleteConversation = (id: string) => {
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      deleteMutation.mutate(id)
    }
  }

  const renderConversationCard = (conv: ConversationHistory) => {
    const isExpanded = expandedConversation === conv.id
    const isSelected = selectedConversations.has(conv.id)

    return (
      <div
        key={conv.id}
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border overflow-hidden transition-colors ${
          isSelected
            ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400'
            : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div
          className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onClick={() => setExpandedConversation(isExpanded ? null : conv.id)}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <div
              className="flex-shrink-0 pt-0.5"
              onClick={(e) => {
                e.stopPropagation()
                toggleConversationSelection(conv.id)
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {conv.prompt}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatTime(conv.created)}</span>
                <span>•</span>
                <span>{conv.ai_model}</span>
                {viewMode === 'by-date' && (
                  <>
                    <span>•</span>
                    <span className="text-blue-600 dark:text-blue-400">{conv.dataset_name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteConversation(conv.id)
                }}
                disabled={deleteMutation.isPending}
                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Delete conversation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">AI Model: </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{conv.ai_model}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Dataset: </span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{conv.dataset_name}</span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Prompt
                </h4>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{conv.prompt}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Response
                </h4>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 [&_*]:text-gray-800 dark:[&_*]:text-gray-200 [&_*]:!bg-transparent"
                  dangerouslySetInnerHTML={{ __html: conv.response }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Render a group header with expand/collapse and select all
  const renderGroupHeader = (groupKey: string, count: number, isDataset: boolean = false) => {
    const isExpanded = expandedGroups.has(groupKey)
    const groupConvs = isDataset ? groupedByDataset[groupKey] : groupedByDate[groupKey]
    const groupIds = groupConvs?.map((c) => c.id) || []
    const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedConversations.has(id))
    const someSelected = groupIds.some((id) => selectedConversations.has(id))

    return (
      <div
        className="w-full p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
      >
        <div className="flex items-center gap-3">
          {/* Group checkbox */}
          <div
            className="flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              toggleGroupSelection(groupKey)
            }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allSelected
              }}
              onChange={() => {}}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
            />
          </div>

          <div
            className="flex-1 flex justify-between items-center cursor-pointer"
            onClick={() => toggleGroup(groupKey)}
          >
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {isDataset ? groupKey : formatDate(groupKey)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {count} conversation{count !== 1 ? 's' : ''}
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Conversation History
              </h2>
              {selectedConversations.size > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                  {selectedConversations.size} selected
                </span>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => {
                  setViewMode('by-date')
                  setExpandedGroups(new Set())
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'by-date'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                By Date
              </button>
              <button
                onClick={() => {
                  setViewMode('by-dataset')
                  setExpandedGroups(new Set())
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'by-dataset'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                By Dataset
              </button>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading history...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400">
                {error instanceof Error ? error.message : 'Failed to load history'}
              </p>
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">No conversation history found.</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Your conversations will appear here after you analyze data.
              </p>
            </div>
          ) : (
            // Show all groups with expand/collapse
            <div className="space-y-3">
              {viewMode === 'by-date'
                ? dates.map((date) => (
                    <div key={date}>
                      {renderGroupHeader(date, groupedByDate[date]?.length || 0, false)}
                      {expandedGroups.has(date) && (
                        <div className="mt-2 ml-6 space-y-2">
                          {groupedByDate[date].map(renderConversationCard)}
                        </div>
                      )}
                    </div>
                  ))
                : datasets.map((dataset) => (
                    <div key={dataset}>
                      {renderGroupHeader(dataset, groupedByDataset[dataset]?.length || 0, true)}
                      {expandedGroups.has(dataset) && (
                        <div className="mt-2 ml-6 space-y-2">
                          {groupedByDataset[dataset].map(renderConversationCard)}
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          )}
        </div>

        {/* Send Report Panel - appears when conversations are selected */}
        {selectedConversations.size > 0 && (
          <div className="mt-6 card p-6 border-2 border-blue-500 dark:border-blue-400">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Send Report ({selectedConversations.size} conversation{selectedConversations.size !== 1 ? 's' : ''})
            </h3>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="recipientEmails"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Recipient Email(s)
                </label>
                <input
                  type="text"
                  id="recipientEmails"
                  value={recipientEmails}
                  onChange={(e) => setRecipientEmails(e.target.value)}
                  placeholder="Enter email addresses (comma or space separated)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Separate multiple emails with commas, semicolons, or spaces
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={handleSendReport}
                  disabled={isSendingReport || recipientEmails.trim().length === 0}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isSendingReport ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {editBeforeSending ? 'Processing...' : 'Sending...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {editBeforeSending ? 'Generate Report' : 'Send Report'}
                    </>
                  )}
                </button>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editBeforeSending}
                    onChange={(e) => setEditBeforeSending(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Edit Before Sending</span>
                </label>

                <button
                  onClick={() => {
                    setSelectedConversations(new Set())
                    setRecipientEmails('')
                    setEditBeforeSending(false)
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Review/Edit Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Review & Edit Report
                </h3>
                <button
                  onClick={handleCloseReviewModal}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label
                  htmlFor="reviewSubject"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Subject
                </label>
                <input
                  type="text"
                  id="reviewSubject"
                  value={reviewSubject}
                  onChange={(e) => setReviewSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="reviewEmails"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Recipients
                </label>
                <input
                  type="text"
                  id="reviewEmails"
                  value={reviewEmails}
                  onChange={(e) => setReviewEmails(e.target.value)}
                  placeholder="Enter email addresses (comma separated)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="reviewContent"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Content
                </label>
                <textarea
                  id="reviewContent"
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  rows={15}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white font-mono text-sm resize-y"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={handleCloseReviewModal}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isSendingEmail}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSendingEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
