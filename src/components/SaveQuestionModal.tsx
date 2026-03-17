import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import type { ConversationHistory, SavedQuestion } from '../types'

interface SaveQuestionModalProps {
  conv: ConversationHistory
  onClose: () => void
  /** If provided, the modal operates in edit mode (PATCH instead of POST) */
  existing?: SavedQuestion
  onSaved?: () => void
}

export default function SaveQuestionModal({ conv, onClose, existing, onSaved }: SaveQuestionModalProps) {
  const [audience, setAudience] = useState<string[]>(existing?.audience ?? [])
  const [emailInput, setEmailInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [editable, setEditable] = useState(existing?.editable ?? true)
  const [savedId, setSavedId] = useState<string | null>(existing ? existing.id : null)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayPrompt = conv.prompt.replace(/^\[Conversation\]\s*/i, '')
  const savedLink = savedId ? `${window.location.origin}/question/${savedId}` : null

  useEffect(() => {
    if (emailInput.length < 2) { setSuggestions([]); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await pocketbaseService.searchUsers(emailInput)
        setSuggestions(results.filter(e => !audience.includes(e)))
      } catch {
        setSuggestions([])
      }
    }, 250)
  }, [emailInput, audience])

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase()
    if (trimmed && !audience.includes(trimmed)) {
      setAudience(prev => [...prev, trimmed])
    }
    setEmailInput('')
    setSuggestions([])
    inputRef.current?.focus()
  }

  const removeEmail = (email: string) => {
    setAudience(prev => prev.filter(e => e !== email))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
      e.preventDefault()
      addEmail(emailInput)
    }
    if (e.key === 'Escape') { setSuggestions([]); onClose() }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (existing) {
        await pocketbaseService.updateSavedQuestion(existing.id, { editable, audience })
        toast.success('Question updated')
        onSaved?.()
        onClose()
      } else {
        const prompt = conv.prompt.replace(/^\[Conversation\]\s*/i, '')
        const sq = await pocketbaseService.createSavedQuestion({
          prompt,
          dataset_id: conv.dataset_id,
          dataset_name: conv.dataset_name,
          ai_model: conv.ai_model,
          editable,
          audience,
          owner_email: conv.user_email,
        })
        setSavedId(sq.id)
        onSaved?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save question')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopy = async () => {
    if (!savedLink) return
    try {
      await navigator.clipboard.writeText(savedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {existing ? 'Edit Saved Question' : 'Save Question'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Question */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Question
            </label>
            <div className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-200 max-h-24 overflow-y-auto whitespace-pre-wrap">
              {displayPrompt}
            </div>
          </div>

          {/* Dataset & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Dataset
              </label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-200 truncate">
                {conv.dataset_name}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                AI Model
              </label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-200 truncate">
                {conv.ai_model}
              </div>
            </div>
          </div>

          {/* Editable */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Allow recipient to edit question?
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="editable"
                  checked={editable}
                  onChange={() => setEditable(true)}
                  className="mt-0.5 accent-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Yes</span> — recipient can edit the question before running
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="editable"
                  checked={!editable}
                  onChange={() => setEditable(false)}
                  className="mt-0.5 accent-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">No</span> — analysis runs immediately when link is opened
                </span>
              </label>
            </div>
          </div>

          {/* Audience */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Restrict access (optional)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Leave empty for anyone with the link. Add emails to restrict access.
            </p>
            <div className="relative">
              {/* Pills + input */}
              <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent min-h-[42px]">
                {audience.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-xs font-medium"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="hover:text-blue-600 dark:hover:text-blue-300"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={audience.length === 0 ? 'Type email and press Enter...' : ''}
                  className="flex-1 min-w-[140px] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                />
              </div>
              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map(email => (
                    <li key={email}>
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); addEmail(email) }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        {email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Saved link */}
          {savedLink && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
              <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-2">
                Question saved! Share this link:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={savedLink}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            {savedId && !existing ? 'Close' : 'Cancel'}
          </button>
          {(!savedId || existing) && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {existing ? 'Update' : 'Save & Get Link'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
