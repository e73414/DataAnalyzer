import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { useTheme } from '../../context/ThemeContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { n8nService } from '../../services/mcpN8nService'
import { useAccessibleDatasets } from '../../hooks/useAccessibleDatasets'
import Navigation from '../../components/Navigation'
import type { AnalysisResult, PromptDialogQuestion } from '../../types'

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

export default function MobileDatasetPromptPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, setAIModel } = useSession()
  const { appSettings } = useAppSettings()
  const { theme } = useTheme()
  const [selectedDatasetId, setSelectedDatasetId] = useState(
    (location.state as { preSelectedDatasetId?: string } | null)?.preSelectedDatasetId || ''
  )
  const [datasetSearch, setDatasetSearch] = useState('')
  const [showDatasetDropdown, setShowDatasetDropdown] = useState(false)
  const datasetDropdownRef = useRef<HTMLDivElement>(null)
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [prompt, setPrompt] = useState('')
  const [emailResponse, setEmailResponse] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [datasetScope, setDatasetScope] = useState<'all' | 'mine' | 'company' | 'unit' | 'team'>('all')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSelectingDataset, setIsSelectingDataset] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogQuestions, setDialogQuestions] = useState<PromptDialogQuestion[]>([])
  const [dialogAnswers, setDialogAnswers] = useState<Record<string, string>>({})
  const [dialogCustomAnswers, setDialogCustomAnswers] = useState<Record<string, string>>({})
  const [suggestedDataset, setSuggestedDataset] = useState<{ dataset_id: string; dataset_name: string; dataset_desc?: string; confidence_level?: string } | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    datasets: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useAccessibleDatasets()

  const {
    data: aiModels,
    isLoading: isLoadingModels,
    error: modelsError,
  } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', session?.email],
    queryFn: () => pocketbaseService.getUserProfile(session!.email),
    enabled: !!session?.email,
  })

  useEffect(() => {
    if (aiModels && aiModels.length > 0 && !selectedModelId) {
      const defaultModel = aiModels[0].id
      setSelectedModelId(defaultModel)
      setAIModel(defaultModel)
    }
  }, [aiModels, selectedModelId, setAIModel])

  // Sync search field to show selected dataset name
  useEffect(() => {
    if (selectedDatasetId && datasets.length > 0) {
      const found = datasets.find(d => d.id === selectedDatasetId)
      if (found) setDatasetSearch(found.name)
    }
  }, [selectedDatasetId, datasets])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (datasetDropdownRef.current && !datasetDropdownRef.current.contains(e.target as Node)) {
        setShowDatasetDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  const scopedDatasets = useMemo(() => {
    const profile = session?.profile?.trim() || ''
    if (datasetScope === 'all') return datasets
    if (datasetScope === 'mine') return datasets.filter(d => d.owner_email === session?.email)
    // Company/Unit/Team scopes require a valid 9-char profile
    if (profile.length < 9 || profile === 'admadmadm') return datasets
    const uCo = profile.substring(0, 3)
    const uBu = profile.substring(3, 6)
    const uTm = profile.substring(6, 9)
    return datasets.filter(d => {
      const pc = (d.profile_code || '').trim()
      if (!pc) return false
      const pCo = pc.substring(0, 3)
      const pBu = pc.substring(3, 6)
      const pTm = pc.substring(6, 9)
      if (datasetScope === 'company') return pCo === uCo && pBu === '000' && pTm === '000'
      if (datasetScope === 'unit')    return pCo === uCo && pBu === uBu  && pTm === '000'
      if (datasetScope === 'team')    return pCo === uCo && pBu === uBu  && pTm === uTm
      return false
    })
  }, [datasets, datasetScope, session])

  const filteredDatasets = useMemo(() => {
    const term = datasetSearch.toLowerCase()
    return [...scopedDatasets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(d => !term || d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term))
  }, [scopedDatasets, datasetSearch])

  const effectiveAnalyzeModel = appSettings?.analyze_model || selectedModelId

  const runAnalysisWithDataset = async (datasetId: string) => {
    if (!effectiveAnalyzeModel) {
      toast.error('Please select an AI model')
      return
    }
    if (!prompt.trim()) {
      toast.error('Please enter a prompt')
      return
    }
    if (!session) return

    setIsAnalyzing(true)
    const startTime = Date.now()
    try {
      const result: AnalysisResult = await n8nService.runAnalysis({
        email: session.email,
        model: effectiveAnalyzeModel,
        datasetId,
        prompt: prompt.trim(),
        emailResponse,
        ...(emailSubject.trim() && { emailSubject: emailSubject.trim() }),
        returnSteps: false,
        templateId: userProfile?.template_id,
      })

      const chosenDataset = datasets?.find((d) => d.id === datasetId)
      const durationSeconds = Math.round((Date.now() - startTime) / 1000)

      navigate('/results', {
        state: {
          result,
          datasetId,
          datasetName: chosenDataset?.name || 'Unknown Dataset',
          prompt: prompt.trim(),
          durationSeconds,
          model: effectiveAnalyzeModel,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed'
      toast.error(message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleLetAiAsk = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt first')
      return
    }
    setDialogLoading(true)
    try {
      const result = await n8nService.promptDialog({
        prompt,
        email: session!.email,
        datasetIds: selectedDatasetId ? [selectedDatasetId] : [],
        model: effectiveAnalyzeModel,
      })
      setDialogQuestions(result.questions)
      setDialogAnswers({})
      setDialogCustomAnswers({})
      setDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate questions')
    } finally {
      setDialogLoading(false)
    }
  }

  const handleDialogSubmit = async () => {
    const answered = dialogQuestions
      .filter(q => {
        const ans = dialogAnswers[q.id]
        return ans === '__custom__' ? !!dialogCustomAnswers[q.id]?.trim() : !!ans?.trim()
      })
      .map(q => {
        const ans = dialogAnswers[q.id] === '__custom__'
          ? dialogCustomAnswers[q.id].trim()
          : dialogAnswers[q.id].trim()
        return `- ${q.question.replace(/\?$/, '')}: ${ans}`
      })
      .join('\n')
    const enhanced = answered
      ? `${prompt.trim()}\n\nAdditional context:\n${answered}`
      : prompt.trim()
    setPrompt(enhanced)
    setDialogOpen(false)
    if (selectedDatasetId) {
      await runAnalysisWithDataset(selectedDatasetId)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDatasetId) {
      await handleSelectDataset()
      return
    }
    await runAnalysisWithDataset(selectedDatasetId)
  }

  const handleSelectDataset = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt first')
      return
    }
    setIsSelectingDataset(true)
    try {
      const datasetIds = filteredDatasets.map(d => d.id)
      const result = await n8nService.selectDataset(prompt.trim(), datasetIds, effectiveAnalyzeModel)
      if (!result.dataset_id) {
        toast.error('No suitable dataset found')
        return
      }
      const found = datasets?.find(d => d.id === result.dataset_id)
      setSuggestedDataset({
        dataset_id: result.dataset_id,
        dataset_name: result.dataset_name || found?.name || 'Unknown Dataset',
        dataset_desc: result.dataset_desc || found?.description,
        confidence_level: result.confidence_level,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to select dataset')
    } finally {
      setIsSelectingDataset(false)
    }
  }

  const isLoading = isLoadingDatasets || isLoadingModels

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 transition-colors duration-200">
      <div className="flex items-center justify-center gap-2 pt-4 pb-1">
        <img src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} alt="DataPilot" className="h-8 w-auto" />
        <span className="text-xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: "'Syne', sans-serif" }}>DataPilot</span>
      </div>
      <Navigation />

      <main className="px-4 py-4 space-y-4">

        {/* Loading / error / empty states */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mb-4"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        ) : datasetsError || modelsError ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {datasetsError
                ? `Failed to load datasets: ${datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}`
                : `Failed to load AI models: ${modelsError instanceof Error ? modelsError.message : 'Unknown error'}`}
            </p>
          </div>
        ) : datasets?.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">No datasets found for your account.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Dataset selector */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">

              {/* Dataset search input */}
              <div>
                <label className="label">Dataset</label>
                <div className="relative" ref={datasetDropdownRef}>
                  <input
                    type="text"
                    value={datasetSearch}
                    onChange={(e) => {
                      setDatasetSearch(e.target.value)
                      setSelectedDatasetId('')
                      setShowDatasetDropdown(true)
                    }}
                    onFocus={() => setShowDatasetDropdown(true)}
                    placeholder="Search datasets..."
                    className="input-field w-full py-3 pr-8"
                    disabled={isAnalyzing}
                    autoComplete="off"
                  />
                  {datasetSearch && !isAnalyzing && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setDatasetSearch('')
                        setSelectedDatasetId('')
                        setShowDatasetDropdown(true)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      tabIndex={-1}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {showDatasetDropdown && !isAnalyzing && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                      {filteredDatasets.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No datasets found</div>
                      ) : filteredDatasets.map(d => (
                        <div
                          key={d.id}
                          onMouseDown={() => {
                            setSelectedDatasetId(d.id)
                            setDatasetSearch(d.name)
                            setShowDatasetDropdown(false)
                          }}
                          className={`px-3 py-3 cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                            selectedDatasetId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''
                          }`}
                        >
                          <div className="text-gray-900 dark:text-gray-100">{d.name}</div>
                          {d.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{d.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="label">Scope</label>
                <select
                  value={datasetScope}
                  onChange={(e) => setDatasetScope(e.target.value as typeof datasetScope)}
                  className="input-field py-3"
                  disabled={isAnalyzing}
                >
                  <option value="all">All Datasets</option>
                  <option value="mine">My Datasets</option>
                  <option value="company">Company Datasets</option>
                  <option value="unit">Unit Datasets</option>
                  <option value="team">Team Datasets</option>
                </select>
              </div>
            </div>

            {/* Suggested dataset banner */}
            {suggestedDataset && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                  AI suggested: {suggestedDataset.dataset_name}
                  {suggestedDataset.confidence_level && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">({suggestedDataset.confidence_level})</span>
                  )}
                </p>
                {suggestedDataset.dataset_desc && (
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">{suggestedDataset.dataset_desc}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDatasetId(suggestedDataset.dataset_id)
                      setDatasetSearch(suggestedDataset.dataset_name)
                      setSuggestedDataset(null)
                    }}
                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Use This Dataset
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedDataset(null)}
                    className="px-4 py-2 text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Prompt + controls */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
              <div>
                <label htmlFor="prompt" className="label">Your question</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="input-field resize-none"
                  style={{ minHeight: '120px' }}
                  placeholder="What would you like to know about this dataset?"
                  disabled={isAnalyzing}
                />
              </div>

              {/* AI Model — hidden when admin locks it */}
              {!appSettings?.analyze_model && (
                <div>
                  <label htmlFor="aiModel" className="label">AI Model</label>
                  <select
                    id="aiModel"
                    value={selectedModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="input-field py-3"
                    disabled={isAnalyzing}
                  >
                    {aiModels?.length === 0 ? (
                      <option value="">No models available</option>
                    ) : aiModels?.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}{model.provider && ` (${model.provider})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Email response toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="emailResponse"
                  checked={emailResponse}
                  onChange={(e) => setEmailResponse(e.target.checked)}
                  disabled={isAnalyzing}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="emailResponse" className="text-sm text-gray-700 dark:text-gray-300">
                  Email me the response
                </label>
              </div>
              {emailResponse && (
                <div>
                  <label htmlFor="emailSubject" className="label">Subject (optional)</label>
                  <input
                    id="emailSubject"
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={isAnalyzing}
                    placeholder="(optional)"
                    className="input-field py-3"
                  />
                </div>
              )}

              {/* Loading phrase */}
              {isAnalyzing && (
                <p className="text-sm text-center text-gray-400 dark:text-gray-500 italic py-2">
                  {getCurrentPhrase()} — {elapsedSeconds}s
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLetAiAsk}
                  disabled={isAnalyzing || dialogLoading || !prompt.trim()}
                  className="flex-1 py-3 text-sm font-medium text-purple-800 dark:text-purple-200 bg-purple-100 dark:bg-purple-900/30 border border-purple-400 dark:border-purple-600 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {dialogLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" />
                      Thinking...
                    </span>
                  ) : 'Let AI Ask'}
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzing || isSelectingDataset}
                  className="flex-1 py-3 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Analyzing...
                    </span>
                  ) : isSelectingDataset ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Finding dataset...
                    </span>
                  ) : 'Ask'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Prompt dialog modal — identical to desktop */}
        {dialogOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Help us understand your question
              </h3>
              <div className="space-y-4">
                {dialogQuestions.map(q => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {q.question}
                    </label>
                    {q.hint && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{q.hint}</p>
                    )}
                    {q.hints && q.hints.length > 0 ? (
                      <div className="relative">
                        <select
                          value={dialogAnswers[q.id] || ''}
                          onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          className="input-field py-3"
                        >
                          <option value="">Select an option...</option>
                          {q.hints.map((h, i) => (
                            <option key={i} value={h.text}>{h.label ? `${h.label} — ${h.text}` : h.text}</option>
                          ))}
                          <option value="__custom__">Other (type below)</option>
                        </select>
                        {dialogAnswers[q.id] === '__custom__' && (
                          <input
                            type="text"
                            value={dialogCustomAnswers[q.id] || ''}
                            className="input-field py-3 mt-2"
                            placeholder="Type your answer..."
                            onChange={(e) => setDialogCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={dialogAnswers[q.id] || ''}
                        onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        className="input-field py-3"
                        placeholder="Your answer..."
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="flex-1 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDialogSubmit}
                  disabled={isAnalyzing}
                  className="flex-1 py-3 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Submit & Ask'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
