import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import Navigation from '../components/Navigation'
import SaveQuestionModal from '../components/SaveQuestionModal'
import type { SavedQuestion, ConversationHistory } from '../types'

/** Convert a SavedQuestion back to the ConversationHistory shape needed by SaveQuestionModal */
function sqToConv(sq: SavedQuestion): ConversationHistory {
  return {
    id: sq.id,
    user_email: sq.owner_email,
    prompt: sq.prompt,
    response: '',
    ai_model: sq.ai_model,
    dataset_id: sq.dataset_id,
    dataset_name: sq.dataset_name,
    created: sq.created_at,
  }
}

export default function ManageQuestionsPage() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const isAdmin = session?.profile?.trim() === 'admadmadm'

  const [ownerFilter, setOwnerFilter] = useState('')
  const [editTarget, setEditTarget] = useState<SavedQuestion | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['saved-questions', session?.email, isAdmin],
    queryFn: () => pocketbaseService.getSavedQuestions(session!.email, isAdmin),
    enabled: !!session?.email,
    refetchOnMount: 'always',
  })

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this saved question?')) return
    try {
      await pocketbaseService.deleteSavedQuestion(id)
      queryClient.invalidateQueries({ queryKey: ['saved-questions'] })
      toast.success('Question deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleCopy = async (id: string) => {
    const link = `${window.location.origin}/question/${id}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const ta = document.createElement('textarea')
        ta.value = link
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const ownerEmails = isAdmin
    ? [...new Set(questions.map(q => q.owner_email))].sort()
    : []

  const filtered = ownerFilter
    ? questions.filter(q => q.owner_email === ownerFilter)
    : questions

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Questions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Create, edit, and organize questions for your datasets.</p>
          </div>
          {isAdmin && ownerEmails.length > 0 && (
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All owners</option>
              {ownerEmails.map(email => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <svg className="mx-auto w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-sm">No saved questions yet.</p>
            <p className="text-xs mt-1">Save a question from your conversation history to share it.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Question</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Dataset</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Access</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden lg:table-cell">Date</th>
                  {isAdmin && (
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Owner</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    {/* Prompt */}
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-800 dark:text-gray-200 truncate" title={q.prompt}>
                        {q.prompt.length > 80 ? q.prompt.slice(0, 80) + '…' : q.prompt}
                      </p>
                      <span className={`mt-0.5 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        q.editable
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {q.editable ? 'Editable' : 'Auto-run'}
                      </span>
                    </td>
                    {/* Dataset */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      <span className="truncate block max-w-[160px]" title={q.dataset_name}>{q.dataset_name}</span>
                    </td>
                    {/* Audience */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {q.audience?.includes('__public__') ? (
                        <span className="text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 px-2 py-0.5 rounded-full">
                          Public link
                        </span>
                      ) : q.audience && q.audience.length > 0 ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
                          {q.audience.length} email{q.audience.length !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 px-2 py-0.5 rounded-full">
                          All registered
                        </span>
                      )}
                    </td>
                    {/* Date */}
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell whitespace-nowrap">
                      {new Date(q.created_at).toLocaleDateString()}
                    </td>
                    {/* Owner (admin only) */}
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell max-w-[140px]">
                        <span className="truncate block" title={q.owner_email}>{q.owner_email}</span>
                      </td>
                    )}
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Copy link */}
                        <button
                          onClick={() => handleCopy(q.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Copy link"
                        >
                          {copiedId === q.id ? (
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        {/* Edit */}
                        <button
                          onClick={() => setEditTarget(q)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <SaveQuestionModal
          conv={sqToConv(editTarget)}
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['saved-questions'] })}
        />
      )}
    </div>
  )
}
