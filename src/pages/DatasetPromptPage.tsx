import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import { mcpN8nApi } from '../services/api'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import Navigation from '../components/Navigation'
import PageTitle from '../components/PageTitle'
import HelpTip from '../components/HelpTip'
import type { AnalysisResult, PromptDialogQuestion } from '../types'

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

export default function DatasetPromptPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, setAIModel } = useSession()
  const { appSettings } = useAppSettings()
  const [selectedDatasetId, setSelectedDatasetId] = useState(
    (location.state as { preSelectedDatasetId?: string } | null)?.preSelectedDatasetId || ''
  )
  const [datasetSearch, setDatasetSearch] = useState('')
  const [showDatasetDropdown, setShowDatasetDropdown] = useState(false)
  const datasetDropdownRef = useRef<HTMLDivElement>(null)
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [prompt, setPrompt] = useState('')
  const [captureProcess, setCaptureProcess] = useState(false)
  const [emailResponse, setEmailResponse] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [datasetScope, setDatasetScope] = useState<'all' | 'mine' | 'company' | 'unit' | 'team'>('all')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSelectingDataset, setIsSelectingDataset] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogQuestions, setDialogQuestions] = useState<PromptDialogQuestion[]>([])
  const [dialogAnswers, setDialogAnswers] = useState<Record<string, string>>({})
  const [openHintDropdown, setOpenHintDropdown] = useState<string | null>(null)
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

  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset-detail', selectedDatasetId],
    queryFn: () => n8nService.getDatasetDetail(selectedDatasetId, session!.email),
    enabled: !!selectedDatasetId && !!session?.email,
  })

  const {
    data: datasetPreview,
    isLoading: isLoadingPreview,
  } = useQuery({
    queryKey: ['dataset-preview', selectedDatasetId],
    queryFn: () => pocketbaseService.getDatasetPreview(selectedDatasetId, session!.email, 20),
    enabled: !!selectedDatasetId && !!session?.email,
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
        returnSteps: captureProcess,
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

  const downloadDatasetCsv = async (datasetId: string, datasetName: string) => {
    if (!session?.email) return
    try {
      const response = await mcpN8nApi.get(`/datasets/${encodeURIComponent(datasetId)}/download-csv`, {
        params: { email: session.email },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data as Blob)
      const a = document.createElement('a')
      const disposition = response.headers['content-disposition'] ?? ''
      const nameMatch = disposition.match(/filename="?([^"]+)"?/)
      a.href = url
      a.download = nameMatch ? nameMatch[1] : `${datasetName}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch {
      toast.error('Failed to download CSV')
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
      setDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate questions')
    } finally {
      setDialogLoading(false)
    }
  }

  const handleDialogSubmit = async () => {
    const answered = dialogQuestions
      .filter(q => dialogAnswers[q.id]?.trim())
      .map(q => `- ${q.question.replace(/\?$/, '')}: ${dialogAnswers[q.id].trim()}`)
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
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <PageTitle fallback="Quick Answer" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a dataset and ask a question to get an AI-powered analysis.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            </div>
          ) : datasetsError || modelsError ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 text-center">
                {datasetsError && `Failed to load datasets: ${datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}`}
                {modelsError && `Failed to load AI models: ${modelsError instanceof Error ? modelsError.message : 'Unknown error'}`}
              </p>
            </div>
          ) : datasets?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">No datasets found for your account.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{session?.email}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Top section: Model + Dataset */}
              <div className="px-6 py-5 space-y-4 border-b border-gray-100 dark:border-gray-800">
                {/* AI Model — hidden when admin has locked the model */}
                {!appSettings?.analyze_model && (
                  <div className="flex items-center gap-3">
                    <label htmlFor="aiModel" className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap w-20 shrink-0 flex items-center gap-1.5">
                      AI Model
                      <HelpTip text="Choose which AI model to use for analysis." />
                    </label>
                    <select
                      id="aiModel"
                      value={selectedModelId}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="input-field flex-1"
                      disabled={isAnalyzing}
                    >
                      {aiModels?.length === 0 ? (
                        <option value="">No models available</option>
                      ) : (
                        aiModels?.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}{model.provider && ` (${model.provider})`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {/* Dataset selector */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap w-20 shrink-0">
                    Dataset
                  </label>
                  <div className="flex-1 flex gap-2 items-center">
                    <div className="relative flex-1" ref={datasetDropdownRef}>
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
                        className="input-field w-full pr-8"
                        disabled={isAnalyzing}
                        autoComplete="off"
                      />
                      {datasetSearch && !isAnalyzing && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setDatasetSearch(''); setSelectedDatasetId(''); setShowDatasetDropdown(true) }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                          tabIndex={-1}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                      {showDatasetDropdown && !isAnalyzing && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                          {isLoadingDatasets ? (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                          ) : filteredDatasets.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No datasets found</div>
                          ) : (
                            filteredDatasets.map(d => (
                              <div
                                key={d.id}
                                onMouseDown={() => {
                                  setSelectedDatasetId(d.id)
                                  setDatasetSearch(d.name)
                                  setShowDatasetDropdown(false)
                                }}
                                className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${selectedDatasetId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-gray-900 dark:text-gray-100">{d.name}{d.row_count != null ? ` (rows: ${d.row_count.toLocaleString()})` : ''}</div>
                                    {d.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.description}</div>}
                                  </div>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.stopPropagation(); downloadDatasetCsv(d.id, d.name) }}
                                    className="flex-shrink-0 text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                                  >
                                    CSV
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        Scope
                        <HelpTip text="Filter datasets by access level: All datasets, only yours, or by organizational unit." />
                      </label>
                      <select
                        value={datasetScope}
                        onChange={(e) => setDatasetScope(e.target.value as typeof datasetScope)}
                        className="input-field text-sm py-1.5 px-2 min-w-fit"
                        disabled={isAnalyzing}
                      >
                        <option value="all">All</option>
                        <option value="mine">My Datasets</option>
                        <option value="company">Company Datasets</option>
                        <option value="unit">Unit Datasets</option>
                        <option value="team">Team Datasets</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dataset Preview */}
              {selectedDatasetId && (
                <div className="border-b border-gray-100 dark:border-gray-800">
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center gap-2 py-4 px-6">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Loading preview...</span>
                    </div>
                  ) : datasetPreview && datasetPreview.columns.length > 0 ? (() => {
                    // Build reverse mapping: db_column -> original_name
                    const columnMapping = (() => {
                      if (!datasetDetail?.column_mapping) return {} as Record<string, string>
                      if (typeof datasetDetail.column_mapping === 'string') {
                        try { return JSON.parse(datasetDetail.column_mapping) as Record<string, string> } catch { return {} as Record<string, string> }
                      }
                      return datasetDetail.column_mapping
                    })()
                    // columnMapping: { "Original Name": "db_col", ... }
                    const dbToOriginal: Record<string, string> = {}
                    Object.entries(columnMapping).forEach(([originalName, dbCol]) => {
                      dbToOriginal[dbCol] = originalName
                    })
                    // Filter to only columns that have a mapping (skip dataset_id, id, etc.)
                    const displayColumns = datasetPreview.columns.filter(col => dbToOriginal[col])

                    return (
                    <div className="overflow-x-auto max-h-44">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                          <tr>
                            {displayColumns.map((col) => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
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
                  )})() : selectedDatasetId && !isLoadingPreview ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">No preview available</p>
                  ) : null}
                </div>
              )}

              {/* Prompt section */}
              <div className="px-6 py-5 space-y-4">
                {/* Sample Questions as chips */}
                {datasetDetail?.sample_questions?.questions && datasetDetail.sample_questions.questions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Sample questions</p>
                    <div className="flex flex-wrap gap-2">
                      {datasetDetail.sample_questions.questions.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setPrompt(q.question)}
                          className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          {q.question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prompt textarea */}
                <div>
                  <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your question
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

                {/* Email subject */}
                {emailResponse && (
                  <div className="flex items-center gap-3">
                    <label htmlFor="emailSubject" className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Subject:
                    </label>
                    <input
                      id="emailSubject"
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      disabled={isAnalyzing}
                      placeholder="(optional)"
                      className="input-field flex-1"
                    />
                  </div>
                )}

                {/* Loading phrase */}
                {isAnalyzing && (
                  <p className="text-sm text-center text-gray-400 dark:text-gray-500 italic">
                    {getCurrentPhrase()} — {elapsedSeconds}s
                  </p>
                )}
              </div>

              {/* Action footer */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={isAnalyzing || isSelectingDataset || !effectiveAnalyzeModel || !prompt.trim()}
                    className="px-6 py-2 bg-purple-900 hover:bg-purple-800 text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        Analyzing...
                      </span>
                    ) : isSelectingDataset ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        Selecting...
                      </span>
                    ) : 'Quick Answer'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLetAiAsk}
                    disabled={isAnalyzing || isSelectingDataset || dialogLoading || !prompt.trim()}
                    className="px-4 py-2 text-sm font-medium text-purple-800 dark:text-purple-200 bg-purple-100 dark:bg-purple-900/30 border border-purple-400 dark:border-purple-600 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {dialogLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></span>
                        Analyzing...
                      </span>
                    ) : 'Let AI Ask'}
                  </button>
                  {!selectedDatasetId && (
                    <button
                      type="button"
                      onClick={handleSelectDataset}
                      disabled={isAnalyzing || isSelectingDataset || dialogLoading || !prompt.trim()}
                      className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {isSelectingDataset ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></span>
                          Selecting...
                        </span>
                      ) : 'Let AI Select Data'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="captureProcess"
                      checked={captureProcess}
                      onChange={(e) => setCaptureProcess(e.target.checked)}
                      disabled={isAnalyzing}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Capture Process</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="emailResponse"
                      checked={emailResponse}
                      onChange={(e) => setEmailResponse(e.target.checked)}
                      disabled={isAnalyzing}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Email response</span>
                  </label>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Let AI Ask Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Refine Your Requirements</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Answer to generate a more targeted analysis. All fields are optional.
                </p>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none p-1">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {dialogQuestions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">{q.question}</label>
                  {q.hints && q.hints.length > 0 && (
                    <div className="relative mb-2">
                      {openHintDropdown === q.id && (
                        <div className="fixed inset-0 z-10" onClick={() => setOpenHintDropdown(null)} />
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenHintDropdown(openHintDropdown === q.id ? null : q.id)}
                        className="w-full text-left px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex justify-between items-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                      >
                        <span>— select a hint —</span>
                        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${openHintDropdown === q.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openHintDropdown === q.id && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                          {q.hints.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { setDialogAnswers(prev => ({ ...prev, [q.id]: h.text })); setOpenHintDropdown(null) }}
                              className="block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 whitespace-normal leading-snug border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              {h.label ? <><span className="font-medium">{h.label}</span><span className="text-gray-400 dark:text-gray-500 ml-1">— {h.text}</span></> : h.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <textarea
                    rows={2}
                    value={dialogAnswers[q.id] || ''}
                    onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your answer…"
                    className="input-field resize-none"
                  />
                  {q.hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 leading-snug">{q.hint}</p>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setDialogOpen(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                Skip — Use Original Prompt
              </button>
              <button type="button" onClick={handleDialogSubmit} className="px-6 py-2 bg-purple-900 hover:bg-purple-800 text-white font-medium rounded-md shadow-sm transition-colors duration-200">
                Quick Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dataset Suggestion Modal */}
      {suggestedDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Suggested Dataset</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">The AI selected the following dataset for your prompt. You can run analysis, select the dataset only, or cancel to choose manually.</p>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2 mb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{suggestedDataset.dataset_name}</p>
                {suggestedDataset.confidence_level != null && (
                  <span className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {suggestedDataset.confidence_level} confidence
                  </span>
                )}
              </div>
              {suggestedDataset.dataset_desc && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{suggestedDataset.dataset_desc}</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSuggestedDataset(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSelectedDatasetId(suggestedDataset.dataset_id)
                  setDatasetSearch(suggestedDataset.dataset_name)
                  setSuggestedDataset(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Select Only
              </button>
              <button
                onClick={() => {
                  const id = suggestedDataset.dataset_id
                  setSelectedDatasetId(id)
                  setSuggestedDataset(null)
                  runAnalysisWithDataset(id)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg transition-colors"
              >
                Quick Answer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
