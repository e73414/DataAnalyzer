import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { AnalysisResult } from '../types'

const WITTY_PHRASES = [
  'Doodling',
  'Thinking really hard',
  'Crunching numbers',
  'Consulting the oracle',
  'Brewing insights',
  'Pondering the data',
  'Mining for gold',
  'Connecting the dots',
  'Reading tea leaves',
  'Channeling the AI spirits',
  'Decoding the matrix',
  'Summoning wisdom',
  'Beating up on Ironman',
  'Heckling Jarvis',
  'Fixing the Great Wall',
  'Finding Nemo',
  'Waiting for AGI',
  'Playing Poker',
  'Watching paint dry',
  'Watching Friends reruns',
  'Doing situps',
  'Running backwards',
  'Kicking tires',
  'Praying for a raise',
  'Buying fartcoin',
  'Lowering expectations',
  'Brushing teeth',
]

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

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
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>([])
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const state = location.state as LocationState | undefined

  const { data: aiModels } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', session?.email],
    queryFn: () => pocketbaseService.getUserProfile(session!.email),
    enabled: !!session?.email,
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

      // Save initial conversation to history
      if (session?.email) {
        pocketbaseService.saveConversation({
          email: session.email,
          prompt: state.prompt,
          response: state.result.result,
          aiModel: session.aiModel,
          datasetId: state.datasetId,
          datasetName: state.datasetName,
        }).catch((err) => {
          console.error('Failed to save conversation to history:', err)
        })
      }
    }
  }, [state, conversation.length, session])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  // Timer for elapsed time during analysis
  useEffect(() => {
    if (isAnalyzing) {
      setElapsedSeconds(0)
      setShuffledPhrases(shuffleArray(WITTY_PHRASES))
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isAnalyzing])

  const getCurrentPhrase = useCallback(() => {
    if (shuffledPhrases.length === 0) return WITTY_PHRASES[0]
    const phraseIndex = Math.floor(elapsedSeconds / 10) % shuffledPhrases.length
    return shuffledPhrases[phraseIndex]
  }, [elapsedSeconds, shuffledPhrases])

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
        templateId: userProfile?.template_id,
      })

      const trimmedPrompt = followUpPrompt.trim()
      setConversation((prev) => [
        ...prev,
        {
          prompt: trimmedPrompt,
          response: result.result,
          processUsed: result.processUsed,
          timestamp: new Date(),
        },
      ])
      setFollowUpPrompt('')
      setHasSaved(false)

      // Save follow-up conversation to history
      pocketbaseService.saveConversation({
        email: session.email,
        prompt: trimmedPrompt,
        response: result.result,
        aiModel: selectedModelId || session.aiModel,
        datasetId: datasetId,
        datasetName: datasetName,
      }).catch((err) => {
        console.error('Failed to save conversation to history:', err)
      })
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
      const lastItem = conversation[conversation.length - 1]
      const conversationData = [{
        prompt: lastItem.prompt,
        output: lastItem.response,
        processUsed: lastItem.processUsed,
      }]

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
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conversation</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Dataset: <span className="font-medium text-gray-900 dark:text-gray-200">{datasetName}</span>
              </p>
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
                  <div className="bg-gray-100 dark:bg-gray-700/50 rounded-2xl rounded-tl-md px-4 py-3 w-full shadow-sm">
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

                {index === conversation.length - 1 && (
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={handleSaveAll}
                      disabled={isSaving || hasSaved}
                      className={`px-3 py-1 text-xs rounded border transition-colors duration-200 ${
                        hasSaved
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                      } disabled:cursor-not-allowed`}
                    >
                      {isSaving ? (
                        <span className="flex items-center gap-1">
                          <span className="inline-block animate-spin rounded-full h-2.5 w-2.5 border border-gray-400 border-t-transparent"></span>
                          saving...
                        </span>
                      ) : hasSaved ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          saved
                        </span>
                      ) : (
                        'save conversation'
                      )}
                    </button>
                  </div>
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

            {/* AI Model Dropdown, Elapsed Time, and Email Checkbox */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label htmlFor="model-select" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
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

                {isAnalyzing && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {getCurrentPhrase()} for {elapsedSeconds} sec{elapsedSeconds !== 1 ? 's' : ''}...
                  </p>
                )}
              </div>

              {/* Email Response Checkbox - Right Justified */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="emailResponseFollowUp"
                  checked={emailResponse}
                  onChange={(e) => setEmailResponse(e.target.checked)}
                  disabled={isAnalyzing || isSaving}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-600"
                />
                <label htmlFor="emailResponseFollowUp" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Email the response
                </label>
              </div>
            </div>

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
