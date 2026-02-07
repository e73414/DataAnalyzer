import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null)

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

  // Get conversations to display based on current view and selection
  const displayConversations = useMemo(() => {
    if (viewMode === 'by-date' && selectedDate) {
      return groupedByDate[selectedDate] || []
    }
    if (viewMode === 'by-dataset' && selectedDataset) {
      // Group by date within selected dataset
      const datasetConvs = groupedByDataset[selectedDataset] || []
      return datasetConvs
    }
    return []
  }, [viewMode, selectedDate, selectedDataset, groupedByDate, groupedByDataset])

  // Group display conversations by date (for dataset view)
  const displayConversationsByDate = useMemo(() => {
    if (viewMode !== 'by-dataset' || !selectedDataset) return null
    const grouped: GroupedConversations = {}
    displayConversations.forEach((conv) => {
      const date = getDateFromCreated(conv.created)
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(conv)
    })
    return grouped
  }, [viewMode, selectedDataset, displayConversations])

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

  const handleBack = () => {
    if (viewMode === 'by-date') {
      setSelectedDate(null)
    } else {
      setSelectedDataset(null)
    }
    setExpandedConversation(null)
  }

  const renderConversationCard = (conv: ConversationHistory) => {
    const isExpanded = expandedConversation === conv.id

    return (
      <div
        key={conv.id}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div
          className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onClick={() => setExpandedConversation(isExpanded ? null : conv.id)}
        >
          <div className="flex justify-between items-start gap-4">
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              {(selectedDate || selectedDataset) && (
                <button
                  onClick={handleBack}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedDate
                  ? formatDate(selectedDate)
                  : selectedDataset
                    ? selectedDataset
                    : 'Conversation History'}
              </h2>
            </div>

            {/* View Mode Toggle */}
            {!selectedDate && !selectedDataset && (
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <button
                  onClick={() => setViewMode('by-date')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'by-date'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  By Date
                </button>
                <button
                  onClick={() => setViewMode('by-dataset')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'by-dataset'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  By Dataset
                </button>
              </div>
            )}
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
          ) : !selectedDate && !selectedDataset ? (
            // Show list of dates or datasets
            <div className="space-y-2">
              {viewMode === 'by-date' && dates.length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No conversations found. Try refreshing the page.
                </p>
              )}
              {viewMode === 'by-dataset' && datasets.length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No conversations found. Try refreshing the page.
                </p>
              )}
              {viewMode === 'by-date'
                ? dates.map((date) => (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{formatDate(date)}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {groupedByDate[date]?.length || 0} conversation{(groupedByDate[date]?.length || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))
                : datasets.map((dataset) => (
                    <button
                      key={dataset}
                      onClick={() => setSelectedDataset(dataset)}
                      className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{dataset}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {groupedByDataset[dataset]?.length || 0} conversation{(groupedByDataset[dataset]?.length || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
            </div>
          ) : viewMode === 'by-date' && selectedDate ? (
            // Show conversations for selected date
            <div className="space-y-3">
              {displayConversations.map(renderConversationCard)}
            </div>
          ) : viewMode === 'by-dataset' && selectedDataset && displayConversationsByDate ? (
            // Show conversations for selected dataset, grouped by date
            <div className="space-y-6">
              {Object.keys(displayConversationsByDate)
                .sort((a, b) => b.localeCompare(a))
                .map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
                      {formatDate(date)}
                    </h3>
                    <div className="space-y-3">
                      {displayConversationsByDate[date].map(renderConversationCard)}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
