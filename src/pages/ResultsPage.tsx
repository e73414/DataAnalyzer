import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { AnalysisResult } from '../types'

interface ConversationItem {
  prompt: string
  response: string
  processUsed?: string
  timestamp: Date
}

interface LocationState {
  result: AnalysisResult
  datasetId: string
  datasetName: string
  prompt: string
}

export default function ResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, setAIModel } = useSession()
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [followUpPrompt, setFollowUpPrompt] = useState('')
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [emailResponse, setEmailResponse] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [datasetId, setDatasetId] = useState('')
  const [datasetName, setDatasetName] = useState('')
  const conversationEndRef = useRef<HTMLDivElement>(null)

  const state = location.state as LocationState | undefined

  const { data: aiModels } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  useEffect(() => {
    if (state?.result && conversation.length === 0) {
      setConversation([
        {
          prompt: state.prompt,
          response: state.result.result,
          processUsed: state.result.processUsed,
          timestamp: new Date(),
        },
      ])
      setDatasetId(state.datasetId)
      setDatasetName(state.datasetName)
    }
  }, [state, conversation.length])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  if (!state?.result && conversation.length === 0) {
    navigate('/analyze', { replace: true })
    return null
  }

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId)
    setAIModel(modelId)
  }

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!followUpPrompt.trim() || !session) return

    setIsAnalyzing(true)
    try {
      const result = await n8nService.runAnalysis({
        email: session.email,
        model: selectedModelId || session.aiModel,
        datasetId: datasetId,
        prompt: followUpPrompt.trim(),
        emailResponse,
      })

      setConversation((prev) => [
        ...prev,
        {
          prompt: followUpPrompt.trim(),
          response: result.result,
          processUsed: result.processUsed,
          timestamp: new Date(),
        },
      ])
      setFollowUpPrompt('')
      setHasSaved(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed'
      toast.error(message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSaveAll = async () => {
    if (!session || hasSaved || conversation.length === 0) return

    setIsSaving(true)
    try {
      const conversationData = conversation.map((item) => ({
        prompt: item.prompt,
        output: item.response,
        processUsed: item.processUsed,
      }))

      await pocketbaseService.saveAnalysisResult({
        datasetId,
        conversation: conversationData,
        email: session.email,
        aiModel: selectedModelId || session.aiModel,
      })
      setHasSaved(true)
      toast.success('Conversation saved successfully!')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col transition-colors duration-200">
      <Navigation />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 flex flex-col min-h-0">
        <div className="card flex-1 flex flex-col overflow-hidden">
          {/* Dataset Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conversation</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Dataset: <span className="font-medium text-gray-900 dark:text-gray-200">{datasetName}</span>
                </p>
              </div>
              <button
                onClick={handleSaveAll}
                disabled={isSaving || hasSaved || conversation.length === 0}
                className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors duration-200 ${
                  hasSaved
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 cursor-default'
                    : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-blue-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-gray-500 dark:border-gray-400 border-t-transparent"></span>
                    Saving...
                  </span>
                ) : hasSaved ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                ) : (
                  'Save Conversation'
                )}
              </button>
            </div>
          </div>

          {/* Scrollable Conversation History */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {conversation.map((item, index) => (
              <div key={index} className="space-y-3">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%] shadow-sm">
                    <p className="text-sm">{item.prompt}</p>
                  </div>
                </div>

                {/* AI Response */}
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700/50 rounded-2xl rounded-tl-md px-4 py-3 max-w-[90%] shadow-sm">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 [&_*]:text-gray-800 dark:[&_*]:text-gray-200 [&_*]:!bg-transparent"
                      dangerouslySetInnerHTML={{ __html: item.response }}
                    />
                    {item.processUsed && (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                          View process used
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-200 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">
                          {item.processUsed}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>

                {index < conversation.length - 1 && (
                  <hr className="border-gray-200 dark:border-gray-700" />
                )}
              </div>
            ))}
            <div ref={conversationEndRef} />
          </div>

          {/* Follow-up Input */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
            <form onSubmit={handleFollowUp} className="flex gap-3">
              <input
                type="text"
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                placeholder={hasSaved ? "Ask another question..." : "Ask a follow-up question..."}
                disabled={isAnalyzing || isSaving}
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={isAnalyzing || isSaving || !followUpPrompt.trim()}
                className="btn-primary"
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    Analyzing...
                  </span>
                ) : (
                  'Send'
                )}
              </button>
            </form>

            {/* AI Model Dropdown and Email Checkbox */}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-sm text-gray-600 dark:text-gray-400">
                  AI Model:
                </label>
                <select
                  id="model-select"
                  value={selectedModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={isAnalyzing || isSaving}
                  className="input-field max-w-xs py-1.5 text-sm"
                >
                  {aiModels?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                      {model.provider && ` (${model.provider})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="emailResponseFollowUp"
                  checked={emailResponse}
                  onChange={(e) => setEmailResponse(e.target.checked)}
                  disabled={isAnalyzing || isSaving}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-600"
                />
                <label htmlFor="emailResponseFollowUp" className="text-sm text-gray-600 dark:text-gray-400">
                  Email the response
                </label>
              </div>
            </div>

            {isAnalyzing && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Processing your question...</p>
            )}
            {hasSaved && !isAnalyzing && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2">Conversation saved. You can continue asking questions.</p>
            )}
          </div>
        </div>

        {/* Model Info */}
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center flex-shrink-0">
          {conversation.length} message{conversation.length !== 1 ? 's' : ''}
        </div>
      </main>
    </div>
  )
}
