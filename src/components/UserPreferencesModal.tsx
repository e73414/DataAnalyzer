import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../services/mcpPocketbaseService'

const MAX_CHARS = 1000

interface UserPreferencesModalProps {
  email: string
  onClose: () => void
}

export default function UserPreferencesModal({ email, onClose }: UserPreferencesModalProps) {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    pocketbaseService.getUserPrompt(email)
      .then(setPrompt)
      .catch(() => setPrompt(''))
      .finally(() => setIsLoading(false))
  }, [email])

  const handleSave = async () => {
    if (prompt.length > MAX_CHARS) return
    setIsSaving(true)
    try {
      await pocketbaseService.updateUserPrompt(email, prompt)
      toast.success('Preferences saved')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setIsSaving(false)
    }
  }

  const charsUsed = prompt.length
  const counterColor =
    charsUsed >= MAX_CHARS
      ? 'text-red-500 dark:text-red-400'
      : charsUsed >= 900
      ? 'text-amber-500 dark:text-amber-400'
      : 'text-gray-400 dark:text-gray-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Preferences</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              MCP Answers — Personal Context
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Add context that MCP Answers will always consider when answering your questions — business rules, exclusions, or preferred terminology.
            </p>
            {isLoading ? (
              <div className="h-28 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
            ) : (
              <>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
                  placeholder={'e.g. Always exclude loss reasons "Duplicate" and "Administrative" when selecting renewal losses.'}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                />
                <div className={`text-right text-xs mt-1 ${counterColor}`}>
                  {charsUsed.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || charsUsed > MAX_CHARS}
            className="px-5 py-2 text-sm font-medium bg-purple-900 text-white rounded-lg hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
