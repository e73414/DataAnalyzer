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
  'Singing Let it go',
  'Moonwalking',
  'Driving without hands on the wheel',
  'Running with scissors',
  'Looking for Inspector Gadget',
  'Looking for Satoshi',
  'Invading Vatican',
  'Skiing in Hawaii',
  'Crawling Home',
  'Pretending to pray',
  'Googling the answer',
  'Asking ChatGPT for help',
  'Bribing the server hamsters',
  'Counting backwards from infinity',
  'Arguing with the algorithm',
  'Negotiating with cloud servers',
  'Stealing WiFi from NASA',
  'Teaching a goldfish calculus',
  'Arm wrestling a neural network',
  'Filibustering the database',
  'Outsourcing to an intern',
  'Feeding the squirrels',
  'Sharpening the pixels',
  'Reticulating splines',
  'Calibrating the flux capacitor',
  'Whispering to the data gods',
  'Herding cats',
  'Overthinking everything',
  'Blaming the previous developer',
  'Staring into the void',
  'Rage quitting and coming back',
  'Trash talking Siri',
  'Doing the robot dance',
  'Filing a complaint with the cloud',
  'Hacking the mainframe badly',
  'Speed dating the datasets',
  'Ghosting the firewall',
  'Panic Googling',
  'Asking for the manager',
  'Judging your prompts silently',
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
  durationSeconds?: number
  timestamp: Date
}

interface LocationState {
  result: AnalysisResult
  datasetId: string
  datasetName: string
  prompt: string
  durationSeconds?: number
}

export default function ResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, setAIModel } = useSession()
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [followUpPrompt, setFollowUpPrompt] = useState('')
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [captureProcess, setCaptureProcess] = useState(false)
  const [emailResponse, setEmailResponse] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [datasetId, setDatasetId] = useState('')
  const [datasetName, setDatasetName] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>([])
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initialSavedRef = useRef(false)

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

  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset-detail', datasetId],
    queryFn: () => n8nService.getDatasetDetail(datasetId, session!.email),
    enabled: !!datasetId && !!session?.email && showPreview,
  })

  const { data: datasetPreview, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['dataset-preview', datasetId],
    queryFn: () => n8nService.getDatasetPreview(datasetId, session!.email, 20),
    enabled: !!datasetId && !!session?.email && showPreview,
  })

  useEffect(() => {
    if (state?.result && conversation.length === 0) {
      setConversation([
        {
          prompt: state.prompt,
          response: state.result.result,
          processUsed: state.result.processUsed,
          durationSeconds: state.durationSeconds,
          timestamp: new Date(),
        },
      ])
      setDatasetId(state.datasetId)
      setDatasetName(state.datasetName)

      // Save initial conversation to history (ref guard prevents double-save in Strict Mode)
      if (session?.email && !initialSavedRef.current) {
        initialSavedRef.current = true
        pocketbaseService.saveConversation({
          email: session.email,
          prompt: `[Conversation] ${state.prompt}`,
          response: state.result.result,
          aiModel: session.aiModel,
          datasetId: state.datasetId,
          datasetName: state.datasetName,
          durationSeconds: state.durationSeconds,
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

  const hasProcessContent = (processUsed?: string) =>
    !!processUsed && processUsed.trim() !== '' && processUsed.trim() !== 'No process steps recorded.'

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
    const startTime = Date.now()
    try {
      const result = await n8nService.runAnalysis({
        email: session.email,
        model: selectedModelId || session.aiModel,
        datasetId: datasetId,
        prompt: followUpPrompt.trim(),
        emailResponse,
        ...(emailSubject.trim() && { emailSubject: emailSubject.trim() }),
        returnSteps: captureProcess,
        templateId: userProfile?.template_id,
      })

      const trimmedPrompt = followUpPrompt.trim()
      const duration = Math.round((Date.now() - startTime) / 1000)
      setConversation((prev) => [
        ...prev,
        {
          prompt: trimmedPrompt,
          response: result.result,
          processUsed: result.processUsed,
          durationSeconds: duration,
          timestamp: new Date(),
        },
      ])
      setFollowUpPrompt('')
      setHasSaved(false)

      // Save follow-up conversation to history
      pocketbaseService.saveConversation({
        email: session.email,
        prompt: `[Conversation] ${trimmedPrompt}`,
        response: result.result,
        aiModel: selectedModelId || session.aiModel,
        datasetId: datasetId,
        datasetName: datasetName,
        durationSeconds: duration,
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
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showPreview ? 'Hide Preview' : 'View Data'}
                </button>
              </p>
            </div>
            {showPreview && (
              <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {isLoadingPreview ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading preview...</span>
                  </div>
                ) : datasetPreview && datasetPreview.columns.length > 0 ? (() => {
                  const columnMapping = (() => {
                    if (!datasetDetail?.column_mapping) return {} as Record<string, string>
                    if (typeof datasetDetail.column_mapping === 'string') {
                      try { return JSON.parse(datasetDetail.column_mapping) as Record<string, string> } catch { return {} as Record<string, string> }
                    }
                    return datasetDetail.column_mapping
                  })()
                  const dbToOriginal: Record<string, string> = {}
                  Object.entries(columnMapping).forEach(([originalName, dbCol]) => {
                    dbToOriginal[dbCol] = originalName
                  })
                  const displayColumns = datasetPreview.columns.filter(col => dbToOriginal[col])

                  return displayColumns.length > 0 ? (
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                          <tr>
                            {displayColumns.map((col) => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                {dbToOriginal[col]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {datasetPreview.rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              {displayColumns.map((col) => (
                                <td key={col} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap max-w-[200px] truncate">
                                  {row[col] != null ? String(row[col]) : ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">No preview available</p>
                  )
                })() : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">No preview available</p>
                )}
              </div>
            )}
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
                  <div className="bg-gray-100 dark:bg-gray-700/50 rounded-2xl rounded-tl-md px-4 py-3 w-full shadow-sm overflow-x-auto">
                    <div className="min-w-fit">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 [&_*]:text-gray-800 dark:[&_*]:text-gray-200 [&_*]:!bg-transparent"
                      dangerouslySetInnerHTML={{ __html: item.response }}
                    />
                    </div>
                    {item.durationSeconds != null && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Response time: {item.durationSeconds} sec{item.durationSeconds !== 1 ? 's' : ''}
                      </p>
                    )}
                    {hasProcessContent(item.processUsed) && (
                      <details className={`${item.durationSeconds != null ? 'mt-1' : 'mt-3'} text-xs`}>
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

                {index === conversation.length - 1 && hasProcessContent(item.processUsed) && (
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

              </div>

              {/* Checkboxes - Right Justified */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="captureProcessFollowUp"
                    checked={captureProcess}
                    onChange={(e) => setCaptureProcess(e.target.checked)}
                    disabled={isAnalyzing || isSaving}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-600"
                  />
                  <label htmlFor="captureProcessFollowUp" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Capture Process
                  </label>
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
                  <label htmlFor="emailResponseFollowUp" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Email the response
                  </label>
                </div>
              </div>
            </div>
            {emailResponse && (
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor="emailSubjectFollowUp" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Subject:
                </label>
                <input
                  id="emailSubjectFollowUp"
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  disabled={isAnalyzing || isSaving}
                  placeholder="(optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {isAnalyzing && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                {getCurrentPhrase()} for {elapsedSeconds} sec{elapsedSeconds !== 1 ? 's' : ''}...
              </p>
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
