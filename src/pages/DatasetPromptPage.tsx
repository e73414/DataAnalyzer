import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function DatasetPromptPage() {
  const navigate = useNavigate()
  const { session, setAIModel } = useSession()
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [prompt, setPrompt] = useState('')
  const [emailResponse, setEmailResponse] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useQuery({
    queryKey: ['datasets', session?.email],
    queryFn: () => pocketbaseService.getDatasetsByEmail(session!.email),
    enabled: !!session?.email,
  })

  const {
    data: aiModels,
    isLoading: isLoadingModels,
    error: modelsError,
  } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  useEffect(() => {
    if (aiModels && aiModels.length > 0 && !selectedModelId) {
      const defaultModel = aiModels[0].id
      setSelectedModelId(defaultModel)
      setAIModel(defaultModel)
    }
  }, [aiModels, selectedModelId, setAIModel])

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

  const getCurrentPhrase = () => {
    if (shuffledPhrases.length === 0) return WITTY_PHRASES[0]
    const phraseIndex = Math.floor(elapsedSeconds / 10) % shuffledPhrases.length
    return shuffledPhrases[phraseIndex]
  }

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId)
    setAIModel(modelId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDatasetId) {
      toast.error('Please select a dataset')
      return
    }
    if (!selectedModelId) {
      toast.error('Please select an AI model')
      return
    }
    if (!prompt.trim()) {
      toast.error('Please enter a prompt')
      return
    }
    if (!session) return

    setIsAnalyzing(true)
    try {
      const result: AnalysisResult = await n8nService.runAnalysis({
        email: session.email,
        model: selectedModelId,
        datasetId: selectedDatasetId,
        prompt: prompt.trim(),
        emailResponse,
      })

      const selectedDataset = datasets?.find((d) => d.id === selectedDatasetId)

      navigate('/results', {
        state: {
          result,
          datasetId: selectedDatasetId,
          datasetName: selectedDataset?.name || 'Unknown Dataset',
          prompt: prompt.trim(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed'
      toast.error(message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const isLoading = isLoadingDatasets || isLoadingModels

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Select Dataset & Enter Prompt
          </h2>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : datasetsError || modelsError ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400">
                {datasetsError && `Failed to load datasets: ${datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}`}
                {modelsError && `Failed to load AI models: ${modelsError instanceof Error ? modelsError.message : 'Unknown error'}`}
              </p>
            </div>
          ) : datasets?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">No datasets found for your email address.</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Please ensure you have datasets associated with {session?.email}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* AI Model Selection */}
              <div>
                <label htmlFor="aiModel" className="label">
                  AI Model
                </label>
                <select
                  id="aiModel"
                  value={selectedModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="input-field"
                  disabled={isAnalyzing}
                >
                  {aiModels?.length === 0 ? (
                    <option value="">No models available</option>
                  ) : (
                    aiModels?.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                        {model.provider && ` (${model.provider})`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Dataset Selection */}
              <div>
                <label htmlFor="dataset" className="label">
                  Select Dataset
                </label>
                <select
                  id="dataset"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="input-field"
                  disabled={isAnalyzing}
                >
                  <option value="">-- Select a dataset --</option>
                  {datasets?.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                      {dataset.description && ` - ${dataset.description}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt Input */}
              <div>
                <label htmlFor="prompt" className="label">
                  Enter your analysis prompt
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="input-field resize-y"
                  placeholder="What would you like to know about this dataset?"
                  disabled={isAnalyzing}
                />
              </div>

              {/* Analyze Button Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="submit"
                    disabled={isAnalyzing || !selectedDatasetId || !selectedModelId || !prompt.trim()}
                    className="btn-primary"
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        Analyzing...
                      </span>
                    ) : (
                      'Analyze'
                    )}
                  </button>

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
                    id="emailResponse"
                    checked={emailResponse}
                    onChange={(e) => setEmailResponse(e.target.checked)}
                    disabled={isAnalyzing}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-600"
                  />
                  <label htmlFor="emailResponse" className="text-sm text-gray-700 dark:text-gray-300">
                    Email the response
                  </label>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
