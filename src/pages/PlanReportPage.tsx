import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import Navigation from '../components/Navigation'
import type { ReportPlan, ReportPlanStep, CheckReportProgressResult, PromptDialogQuestion, DatasetPreview, DatasetDetail } from '../types'

interface LoadedPlanState {
  prompt: string
  reportPlan: string
  report: string
  reportId?: string
  datasetId: string
  datasetName: string
  aiModel: string
  savedRecordId: string
}

// Topological sort: groups steps into parallel batches by dependency level.
// Steps in the same batch have no inter-dependencies and can run concurrently.
function groupStepsByBatch(steps: ReportPlanStep[]): ReportPlanStep[][] {
  const batches: ReportPlanStep[][] = []
  const completed = new Set<number>()
  let remaining = [...steps]
  while (remaining.length > 0) {
    const batch = remaining.filter(s =>
      (s.dependencies ?? []).every(dep => completed.has(dep))
    )
    if (batch.length === 0) {
      // Cycle or unresolvable deps — fall back to running all remaining one at a time
      batches.push(...remaining.map(s => [s]))
      break
    }
    batches.push(batch)
    batch.forEach(s => completed.add(s.step_number))
    remaining = remaining.filter(s => !completed.has(s.step_number))
  }
  return batches
}

export default function PlanReportPage() {
  const { session, setAIModel } = useSession()
  const location = useLocation()
  const loadedState = location.state as LoadedPlanState | null
  const [prompt, setPrompt] = useState(loadedState?.prompt || '')
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set())
  const [selectedModelId, setSelectedModelId] = useState(session?.aiModel || '')
  const [plan, setPlan] = useState<ReportPlan | null>(null)
  const [report, setReport] = useState('')
  const [reportId, setReportId] = useState(loadedState?.reportId || '')
  const [showJson, setShowJson] = useState(false)
  const [showRawReport, setShowRawReport] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<CheckReportProgressResult | null>(null)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(loadedState?.savedRecordId || null)
  const [isEditingReport, setIsEditingReport] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogQuestions, setDialogQuestions] = useState<PromptDialogQuestion[]>([])
  const [dialogAnswers, setDialogAnswers] = useState<Record<string, string>>({})
  const [dialogLoading, setDialogLoading] = useState(false)
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(null)
  const [previewAnchorRect, setPreviewAnchorRect] = useState<DOMRect | null>(null)
  const editorRef = useRef<HTMLIFrameElement>(null)
  const editorContentRef = useRef('')
  const planRef = useRef<HTMLDivElement>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const planStartTime = useRef<number>(0)
  const executeStartTime = useRef<number>(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollProgressRef = useRef<((rptId: string) => Promise<void>) | null>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const executionCancelledRef = useRef(false)

  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useQuery({
    queryKey: ['datasets', session?.email],
    queryFn: () => pocketbaseService.getDatasetsByEmail(session!.email),
    enabled: !!session?.email,
  })

  const { data: aiModels } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => pocketbaseService.getAIModels(),
  })

  const { data: previewData, isLoading: isLoadingPreview } = useQuery<DatasetPreview>({
    queryKey: ['dataset-preview', previewDatasetId],
    queryFn: () => n8nService.getDatasetPreview(previewDatasetId!, session!.email, 10),
    enabled: !!previewDatasetId && !!session?.email,
    staleTime: 5 * 60 * 1000,
  })

  const { data: previewDetail } = useQuery<DatasetDetail>({
    queryKey: ['dataset-detail-preview', previewDatasetId],
    queryFn: () => n8nService.getDatasetDetail(previewDatasetId!, session!.email),
    enabled: !!previewDatasetId && !!session?.email,
    staleTime: 5 * 60 * 1000,
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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Load state from History page navigation
  const loadedRef = useRef(false)
  useEffect(() => {
    if (loadedRef.current || !loadedState) return
    loadedRef.current = true

    // Parse and set the plan
    if (loadedState.reportPlan) {
      try {
        let raw = loadedState.reportPlan
        // Handle double-stringified JSON
        if (typeof raw === 'string' && raw.startsWith('"')) {
          try { raw = JSON.parse(raw) as string } catch { /* use as-is */ }
        }
        const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ReportPlan
        if (parsed && Array.isArray(parsed.steps)) {
          setPlan(parsed)
        } else {
          console.warn('Loaded report_plan has no steps array:', parsed)
          toast.error('Report plan format not recognized')
        }
      } catch (err) {
        console.error('Failed to parse report plan:', err, loadedState.reportPlan)
        toast.error('Failed to parse saved report plan')
      }
    }

    // Set the report (run through extractReportHtml later, but it may not be defined yet)
    if (loadedState.report) {
      const raw = loadedState.report.trim()
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw)
          setReport(parsed.content || raw)
        } catch {
          setReport(raw)
        }
      } else {
        setReport(raw)
      }
    }

    // Select the dataset
    if (loadedState.datasetId) {
      setSelectedDatasetIds(new Set([loadedState.datasetId]))
    }

    // Set the AI model
    if (loadedState.aiModel) {
      setSelectedModelId(loadedState.aiModel)
      setAIModel(loadedState.aiModel)
    }

    // Mark as already saved (since it came from history)
    setReportSaved(true)

    // Clear the location state so refreshing doesn't re-load
    window.history.replaceState({}, '')

    toast.success('Plan and report loaded from history')
  }, [loadedState, setAIModel])

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId)
    setAIModel(modelId)
  }

  // Write content into iframe and enable editing via designMode
  // Uses programmatic doc.write instead of srcDoc to avoid designMode conflicts
  const initEditor = useCallback((htmlContent: string) => {
    const iframe = editorRef.current
    if (!iframe?.contentWindow) return
    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(htmlContent)
    doc.close()
    doc.designMode = 'on'
    doc.body.addEventListener('input', () => {
      editorContentRef.current = doc.body.innerHTML
      setReportSaved(false)
    })
  }, [])

  // Get current report content (from editor if editing, otherwise from state)
  const getCurrentReportContent = useCallback((): string => {
    if (isEditingReport && editorContentRef.current) {
      return editorContentRef.current
    }
    return report
  }, [isEditingReport, report])

  // Toggle edit mode
  const handleToggleEdit = useCallback(() => {
    if (isEditingReport) {
      // Leaving edit mode — apply edits back to report state
      const edited = editorContentRef.current
      if (edited) {
        setReport(edited)
        setReportSaved(false)
      }
      setIsEditingReport(false)
    } else {
      // Entering edit mode — show iframe then write content into it
      editorContentRef.current = report
      setIsEditingReport(true)
      setIframeKey(k => k + 1)
      // Wait for iframe to mount, then write content
      setTimeout(() => initEditor(report), 50)
    }
  }, [isEditingReport, report, initEditor])

  // --- Plan mutation helpers ---
  const updateStep = (stepIndex: number, field: keyof ReportPlanStep, value: unknown) => {
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      steps[stepIndex] = { ...steps[stepIndex], [field]: value }
      return { ...prev, steps }
    })
  }

  const updateFilter = (stepIndex: number, filterKey: string, value: string | string[]) => {
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      qs.filters = { ...qs.filters, [filterKey]: value }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const deleteFilter = (stepIndex: number, filterKey: string) => {
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      const { [filterKey]: _, ...rest } = qs.filters
      qs.filters = rest
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const addFilter = (stepIndex: number) => {
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      // Find a unique key name
      let keyName = 'new_filter'
      let counter = 1
      while (keyName in qs.filters) {
        keyName = `new_filter_${counter++}`
      }
      qs.filters = { ...qs.filters, [keyName]: '' }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const renameFilterKey = (stepIndex: number, oldKey: string, newKey: string) => {
    if (!newKey.trim() || oldKey === newKey) return
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      const value = qs.filters[oldKey]
      const { [oldKey]: _, ...rest } = qs.filters
      qs.filters = { ...rest, [newKey.trim()]: value }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const updateQueryField = (stepIndex: number, field: 'columns' | 'logic' | 'join_on', value: string[] | string) => {
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy, [field]: value }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  // Toggle JSON view
  const handleToggleJson = () => {
    if (!showJson && plan) {
      setJsonText(JSON.stringify(plan, null, 2))
      setJsonError('')
    } else if (showJson && jsonText) {
      try {
        const parsed = JSON.parse(jsonText)
        if (!parsed.steps || !Array.isArray(parsed.steps)) {
          setJsonError('JSON must contain a "steps" array')
          return
        }
        setPlan(parsed as ReportPlan)
        setJsonError('')
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
        return
      }
    }
    setShowJson(!showJson)
  }

  // Stop polling and handle completion
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const handleStopExecution = useCallback(() => {
    executionCancelledRef.current = true
    stopPolling()
    setIsExecuting(false)
    toast('Execution stopped', { icon: '\u23F9' })
  }, [stopPolling])

  // Extract HTML content from final_report — may be raw HTML, JSON { subject, content }, or other
  const extractReportHtml = (raw: string | null): string => {
    if (!raw) return ''
    const trimmed = raw.trim()
    // Try parsing as JSON to extract .content field (Formatter outputs { subject, content })
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.content) return parsed.content
        // If parsed but no content field and it's just {}, return empty
        if (Object.keys(parsed).length === 0) return ''
        // Has other fields but no content — stringify for display
        return raw
      } catch {
        // Not valid JSON — treat as raw HTML
      }
    }
    return raw
  }

  const handleExecutionComplete = useCallback((progress: CheckReportProgressResult) => {
    stopPolling()
    setIsExecuting(false)
    const finalReport = extractReportHtml(progress.final_report)
    setReport(finalReport)
    setReportSaved(false)
    setSavedRecordId(null)
    setIsEditingReport(false)
    editorContentRef.current = ''
    if (finalReport) {
      toast.success('Report generated successfully')
    } else {
      toast.error('Report completed but content was empty — the formatter may have returned invalid output')
    }
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [stopPolling])

  const handleSaveReport = async () => {
    if (!session?.email) {
      toast.error('No active session')
      return
    }
    const content = getCurrentReportContent()
    if (!content) {
      toast.error('No report to save')
      return
    }
    // Sync editor content to report state
    if (isEditingReport && editorContentRef.current) {
      setReport(editorContentRef.current)
    }
    setIsSavingReport(true)
    try {
      if (savedRecordId) {
        // Update existing record
        await pocketbaseService.updateConversation(savedRecordId, { response: content })
        toast.success('Report updated')
      } else {
        // Create new record
        const planJson = plan ? JSON.stringify(plan) : ''
        const selectedNames = (datasets ?? []).filter(d => selectedDatasetIds.has(d.id)).map(d => d.name).join(', ')
        const saved = await pocketbaseService.saveConversation({
          email: session.email,
          prompt: `[Execute Plan] ${plan?.plan_id || 'unknown'}`,
          response: content,
          aiModel: selectedModelId,
          datasetId: Array.from(selectedDatasetIds).join(',') || 'all',
          datasetName: selectedNames || 'All Datasets',
          durationSeconds: Math.round((Date.now() - executeStartTime.current) / 1000),
          reportPlan: planJson,
          reportId,
        })
        setSavedRecordId(saved.id)
        toast.success('Report saved to history')
      }
      setReportSaved(true)
    } catch (err) {
      console.error('Failed to save report:', err)
      toast.error(`Failed to save report: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSavingReport(false)
    }
  }

  // Track how many consecutive polls returned all-steps-done but no terminal state
  const stallCountRef = useRef(0)

  // Poll for progress — stored in ref to avoid stale closures in setInterval
  const pollProgress = useCallback(async (rptId: string) => {
    try {
      const progress = await n8nService.checkReportProgress(rptId)
      setExecutionProgress(progress)

      if (progress.status === 'completed') {
        stallCountRef.current = 0
        handleExecutionComplete(progress)
      } else if (progress.status === 'error') {
        stallCountRef.current = 0
        stopPolling()
        setIsExecuting(false)
        toast.error(progress.error_message || 'Execution failed — one or more steps encountered an error')
      } else {
        // Check for stalled execution: all steps finished but no terminal state
        const allStepsDone = progress.steps.length > 0 && progress.steps.every(
          s => s.status === 'completed' || s.status === 'error'
        )
        if (allStepsDone) {
          stallCountRef.current++
          // If stalled for ~2 minutes (24 polls x 5s), treat as error
          if (stallCountRef.current >= 24) {
            stopPolling()
            setIsExecuting(false)
            const hasErrors = progress.steps.some(s => s.status === 'error')
            toast.error(hasErrors
              ? 'Execution timed out — steps completed with errors but report consolidation failed'
              : 'Execution timed out — all steps completed but the final report was never generated')
            setExecutionProgress({
              ...progress,
              status: 'error',
              error_message: hasErrors
                ? 'Steps completed with errors. The report formatter failed to produce a final report.'
                : 'All steps completed but the final report was never generated. The formatter may have crashed.',
            })
          }
        } else {
          stallCountRef.current = 0
        }
      }
    } catch (err) {
      console.error('Polling error:', err)
      // Don't stop polling on transient errors
    }
  }, [handleExecutionComplete, stopPolling])

  // Keep ref updated so setInterval always calls the latest version
  pollProgressRef.current = pollProgress

  // Poll until all steps in stepNumbers reach completed/error, updating progress UI along the way
  const waitForBatchCompletion = useCallback(
    async (reportId: string, stepNumbers: number[]): Promise<void> => {
      while (true) {
        if (executionCancelledRef.current) throw new Error('Execution cancelled')
        await new Promise(res => setTimeout(res, 5000))
        if (executionCancelledRef.current) throw new Error('Execution cancelled')
        const progress = await n8nService.checkReportProgress(reportId)
        setExecutionProgress(progress)
        const hasError = stepNumbers.some(
          num => progress.steps.find(s => s.step_number === num)?.status === 'error'
        )
        if (hasError) throw new Error('One or more steps failed during execution')
        const allDone = stepNumbers.every(
          num => progress.steps.find(s => s.step_number === num)?.status === 'completed'
        )
        if (allDone) return
      }
    },
    [] // executionCancelledRef is a ref — no dep needed
  )

  const planMutation = useMutation({
    mutationFn: (promptOverride?: string) =>
      n8nService.planReport({
        prompt: promptOverride ?? prompt,
        email: session!.email,
        datasetIds: Array.from(selectedDatasetIds),
        model: selectedModelId,
      }),
    onSuccess: (result) => {
      setPlan(result.plan || null)
      setReport('')
      setReportId('')
      setReportSaved(false)
      setSavedRecordId(null)
      setIsEditingReport(false)
      editorContentRef.current = ''
      setShowJson(false)
      setExecutionProgress(null)
      toast.success('Report plan generated')
      setTimeout(() => {
        planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)

    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to generate plan')
    },
  })

  const handleExecutePlan = useCallback(async () => {
    if (!plan || !session?.email) return

    executionCancelledRef.current = false
    const sharedReportId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    const batches = groupStepsByBatch(plan.steps)
    const hasParallelism = batches.some(b => b.length > 1)

    setReportId(sharedReportId)
    setIsExecuting(true)
    setReport('')
    setReportSaved(false)
    setSavedRecordId(null)
    setIsEditingReport(false)
    editorContentRef.current = ''
    // Pre-populate steps from the plan so the UI shows them immediately (no "Initializing..." delay)
    setExecutionProgress({
      report_id: sharedReportId,
      steps: plan.steps.map(s => ({
        step_number: s.step_number,
        purpose: s.purpose,
        dataset_id: s.dataset_id,
        status: 'started' as const,
      })),
      final_report: null,
      status: 'in_progress',
    })
    executeStartTime.current = Date.now()
    toast.success(hasParallelism ? 'Execution started (parallel steps)...' : 'Execution started...')
    setTimeout(() => {
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    try {
      for (const batch of batches) {
        if (executionCancelledRef.current) return

        // Fire all steps in this batch in parallel — each as a separate n8n execution
        await Promise.all(
          batch.map(step =>
            n8nService.executePlan({
              plan: JSON.stringify({ ...plan, steps: [step] }),
              email: session.email,
              model: selectedModelId,
              templateId: userProfile?.template_id,
              reportId: sharedReportId,
              stepsOnly: true,
            })
          )
        )

        // Poll until all steps in this batch reach completed/error
        await waitForBatchCompletion(sharedReportId, batch.map(s => s.step_number))
      }

      if (executionCancelledRef.current) return

      // All batches done — trigger the formatter
      await n8nService.runFormatter({
        reportId: sharedReportId,
        email: session.email,
        model: selectedModelId,
        templateId: userProfile?.template_id,
      })

      // Poll for final report using existing mechanism
      pollingRef.current = setInterval(() => pollProgressRef.current?.(sharedReportId), 5000)
      setTimeout(() => pollProgressRef.current?.(sharedReportId), 2000)

    } catch (err) {
      if (executionCancelledRef.current) return
      stopPolling()
      setIsExecuting(false)
      toast.error(err instanceof Error ? err.message : 'Failed to execute plan')
    }
  }, [plan, session, selectedModelId, userProfile, waitForBatchCompletion, stopPolling])

  const isWorking = planMutation.isPending || isExecuting

  const toggleDataset = (id: string) => {
    setSelectedDatasetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (!datasets) return
    if (selectedDatasetIds.size === datasets.length) {
      setSelectedDatasetIds(new Set())
    } else {
      setSelectedDatasetIds(new Set(datasets.map((d) => d.id)))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) {
      toast.error('Please enter report requirements')
      return
    }
    planStartTime.current = Date.now()
    planMutation.mutate(undefined)
  }

  const handleGuidedSetup = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter report requirements first')
      return
    }
    setDialogLoading(true)
    try {
      const result = await n8nService.promptDialog({
        prompt,
        email: session!.email,
        datasetIds: Array.from(selectedDatasetIds),
        model: selectedModelId,
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

  const handleDialogSubmit = () => {
    const answered = dialogQuestions
      .filter(q => dialogAnswers[q.id]?.trim())
      .map(q => `- ${q.question.replace(/\?$/, '')}: ${dialogAnswers[q.id].trim()}`)
      .join('\n')
    const enhanced = answered
      ? `${prompt.trim()}\n\nAdditional context:\n${answered}`
      : prompt
    setPrompt(enhanced)
    setDialogOpen(false)
    planStartTime.current = Date.now()
    planMutation.mutate(enhanced)
  }

  const handleExecute = () => {
    if (!plan) {
      toast.error('No plan to execute')
      return
    }
    handleExecutePlan()
  }

  const getDatasetName = (datasetId: string): string => {
    const ds = datasets?.find(d => d.id === datasetId)
    return ds ? ds.name : datasetId
  }

  const renderFilterValue = (value: string | string[]): string => {
    if (Array.isArray(value)) return value.join(', ')
    return value
  }

  // Get step status icon
  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="text-green-500 font-bold">&#10003;</span>
      case 'started':
        return <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></span>
      case 'error':
        return <span className="text-red-500 font-bold">&#10007;</span>
      default:
        return <span className="text-gray-400">&#9675;</span>
    }
  }

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'started': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'error': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default: return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Plan Report
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Describe your report requirements and select the datasets to include. AI will generate a report plan for you to review.
          </p>

          {isLoadingDatasets ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading datasets...</p>
            </div>
          ) : datasetsError ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400">
                Failed to load datasets: {datasetsError instanceof Error ? datasetsError.message : 'Unknown error'}
              </p>
            </div>
          ) : datasets?.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">No datasets found for your email address.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="prompt" className="label">
                  Report Requirements
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="input-field resize-y"
                  placeholder="Describe what the report should cover, the analysis needed, key metrics, comparisons..."
                  disabled={isWorking}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Select Datasets — optional ({selectedDatasetIds.size} selected)
                  </label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    disabled={isWorking}
                  >
                    {selectedDatasetIds.size === datasets?.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-600 max-h-64 overflow-y-auto">
                  {datasets?.map((dataset) => (
                    <div
                      key={dataset.id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        selectedDatasetIds.has(dataset.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDatasetIds.has(dataset.id)}
                          onChange={() => toggleDataset(dataset.id)}
                          disabled={isWorking}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {dataset.name}
                          </p>
                          {dataset.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {dataset.description}
                            </p>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex-shrink-0"
                        onMouseEnter={(e) => {
                          if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current)
                          setPreviewDatasetId(dataset.id)
                          setPreviewAnchorRect(e.currentTarget.getBoundingClientRect())
                        }}
                        onMouseLeave={() => {
                          previewTimeoutRef.current = setTimeout(() => {
                            setPreviewDatasetId(null)
                            setPreviewAnchorRect(null)
                          }, 150)
                        }}
                      >
                        Preview
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={isWorking || !prompt.trim()}
                  className="btn-primary"
                >
                  {planMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      Generating Plan...
                    </span>
                  ) : (
                    'Generate Plan'
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGuidedSetup}
                  disabled={isWorking || dialogLoading || !prompt.trim()}
                  className="btn-secondary"
                >
                  {dialogLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent dark:border-gray-400"></span>
                      Analyzing...
                    </span>
                  ) : (
                    'Guided Setup'
                  )}
                </button>

                <select
                  value={selectedModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="input-field w-auto"
                  disabled={isWorking}
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

                {planMutation.isPending && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This may take a moment...
                  </p>
                )}
              </div>
            </form>
          )}

          {/* Structured Plan Display */}
          {plan && (
            <div ref={planRef} className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="label mb-0">Report Plan</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {plan.plan_id} — {plan.total_steps} step{plan.total_steps !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleJson}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  disabled={isWorking}
                >
                  {showJson ? 'Close JSON' : 'View JSON'}
                </button>
              </div>

              {showJson ? (
                <div>
                  <textarea
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value)
                      setJsonError('')
                    }}
                    rows={20}
                    className="input-field resize-y font-mono text-sm"
                    disabled={isWorking}
                  />
                  {jsonError && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{jsonError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {plan.steps.map((step, idx) => (
                    <div
                      key={step.step_number}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                    >
                      {/* Step header */}
                      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                          {step.step_number}
                        </span>
                        <input
                          type="text"
                          value={step.purpose}
                          onChange={(e) => updateStep(idx, 'purpose', e.target.value)}
                          className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-white border-none outline-none focus:ring-0 p-0"
                          disabled={isWorking}
                        />
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* Dataset */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500 dark:text-gray-400 font-medium w-20 flex-shrink-0">Dataset:</span>
                          <span className="text-blue-600 dark:text-blue-400">{getDatasetName(step.dataset_id)}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">({step.dataset_id})</span>
                        </div>

                        {/* Dependencies */}
                        {step.dependencies.length > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500 dark:text-gray-400 font-medium w-20 flex-shrink-0">Depends:</span>
                            <div className="flex gap-1">
                              {step.dependencies.map(dep => (
                                <span key={dep} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                                  Step {dep}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Query Strategy */}
                        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Query Strategy</p>

                          {/* Filters */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-gray-400 dark:text-gray-500">Filters:</p>
                              {!isWorking && (
                                <button
                                  onClick={() => addFilter(idx)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                                  title="Add filter"
                                >
                                  + Add
                                </button>
                              )}
                            </div>
                            {Object.keys(step.query_strategy.filters).length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {Object.entries(step.query_strategy.filters).map(([key, val]) => {
                                  const displayVal = renderFilterValue(val)
                                  return (
                                    <div key={key} className="flex items-center gap-1 text-xs">
                                      <input
                                        type="text"
                                        defaultValue={key}
                                        onBlur={(e) => renameFilterKey(idx, key, e.target.value)}
                                        className="w-24 flex-shrink-0 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-xs font-mono text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-blue-500"
                                        disabled={isWorking}
                                      />
                                      <span className="text-gray-400">:</span>
                                      <input
                                        type="text"
                                        value={displayVal}
                                        onChange={(e) => {
                                          const newVal = Array.isArray(val)
                                            ? e.target.value.split(',').map(s => s.trim())
                                            : e.target.value
                                          updateFilter(idx, key, newVal)
                                        }}
                                        className="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 text-xs text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                                        disabled={isWorking}
                                      />
                                      {!isWorking && (
                                        <button
                                          onClick={() => deleteFilter(idx, key)}
                                          className="flex-shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 p-0.5"
                                          title={`Remove filter "${key}"`}
                                        >
                                          &#10005;
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-300 dark:text-gray-600 italic">No filters</p>
                            )}
                          </div>

                          {/* Columns */}
                          <div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Columns:</p>
                            <input
                              type="text"
                              value={step.query_strategy.columns.join(', ')}
                              onChange={(e) => updateQueryField(idx, 'columns', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                              disabled={isWorking}
                            />
                          </div>

                          {/* Logic */}
                          <div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Logic:</p>
                            <input
                              type="text"
                              value={step.query_strategy.logic}
                              onChange={(e) => updateQueryField(idx, 'logic', e.target.value)}
                              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                              disabled={isWorking}
                            />
                          </div>

                          {/* Join on */}
                          <div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Join on:</p>
                            <input
                              type="text"
                              value={step.query_strategy.join_on || ''}
                              onChange={(e) => updateQueryField(idx, 'join_on', e.target.value)}
                              placeholder="e.g. dataset_id or column_name"
                              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                              disabled={isWorking}
                            />
                          </div>
                        </div>

                        {/* Expected output */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500 dark:text-gray-400 font-medium text-xs">Output:</span>
                          <div className="flex gap-1 flex-wrap">
                            {step.expected_output.map((out, oi) => (
                              <span key={oi} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-mono">
                                {out}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4">
                <select
                  value={selectedModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="input-field w-auto"
                  disabled={isWorking}
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

                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={isWorking || !plan || !selectedModelId}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg shadow-sm transition-colors disabled:cursor-not-allowed"
                >
                  Execute Plan
                </button>

                {isExecuting && (
                  <button
                    type="button"
                    onClick={handleStopExecution}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                  >
                    Stop Execution
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Execution Progress */}
          {(isExecuting || executionProgress?.status === 'error') && executionProgress && (
            <div ref={progressRef} className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="label mb-0">Execution Progress</h3>
                {reportId && (
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">
                    {reportId}
                  </span>
                )}
                {isExecuting && (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></span>
                )}
                {executionProgress?.status === 'error' && !isExecuting && (
                  <span className="text-red-500 font-bold text-lg">&#10007;</span>
                )}
                {isExecuting && executionProgress.steps.some(s => s.status === 'error') && (
                  <button
                    type="button"
                    onClick={handleStopExecution}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <span>&#9632;</span> Stop Monitoring
                  </button>
                )}
              </div>

              {executionProgress.steps.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></span>
                  <p className="text-sm text-blue-700 dark:text-blue-300">Initializing execution...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {executionProgress.steps.map((step) => (
                    <div key={step.step_number}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3 border rounded-lg transition-colors ${getStepStatusColor(step.status)}`}
                      >
                        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                          {getStepStatusIcon(step.status)}
                        </div>
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center justify-center">
                          {step.step_number}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                          {step.purpose || `Step ${step.step_number}`}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          step.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : step.status === 'started'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : step.status === 'error'
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {step.status}
                        </span>
                      </div>
                      {step.status === 'error' && step.step_result && (
                        <div className="ml-12 mt-1 px-3 py-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                          {step.step_result}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Consolidation indicator */}
                  {executionProgress.steps.every(s => s.status === 'completed') && !executionProgress.final_report && executionProgress.status !== 'error' && (
                    <div className="flex items-center gap-3 px-4 py-3 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800">
                      <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent"></span>
                      <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                        All steps complete — consolidating final report...
                      </span>
                    </div>
                  )}

                  {/* Error banner */}
                  {executionProgress.status === 'error' && executionProgress.error_message && (
                    <div className="flex items-start gap-3 px-4 py-3 border rounded-lg bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800">
                      <span className="text-red-500 font-bold text-lg flex-shrink-0 mt-0.5">&#10007;</span>
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">Execution Failed</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{executionProgress.error_message}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isExecuting && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  Polling every 5 seconds. Elapsed: {Math.round((Date.now() - executeStartTime.current) / 1000)}s
                </p>
              )}
            </div>
          )}

          {report && (
            <div ref={reportRef} className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="label mb-0">Generated Report</h3>
                  {reportId && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">
                      {reportId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowRawReport(!showRawReport); if (isEditingReport) handleToggleEdit() }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    {showRawReport ? 'View Report' : 'View Source'}
                  </button>
                  {!showRawReport && (
                    <button
                      type="button"
                      onClick={handleToggleEdit}
                      className={`text-sm font-medium ${
                        isEditingReport
                          ? 'text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300'
                          : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                      }`}
                    >
                      {isEditingReport ? 'Done Editing' : 'Edit Report'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveReport}
                    disabled={isSavingReport || reportSaved}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg shadow-sm transition-colors ${
                      reportSaved
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white disabled:cursor-not-allowed'
                    }`}
                  >
                    {isSavingReport ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>
                        Saving...
                      </span>
                    ) : reportSaved ? (
                      <span className="flex items-center gap-1">
                        <span>&#10003;</span> Saved
                      </span>
                    ) : savedRecordId ? (
                      'Update Report'
                    ) : (
                      'Save Report'
                    )}
                  </button>
                </div>
              </div>

              {showRawReport ? (
                <textarea
                  value={report}
                  onChange={(e) => { setReport(e.target.value); setReportSaved(false) }}
                  rows={20}
                  className="input-field resize-y font-mono text-sm"
                />
              ) : isEditingReport ? (
                <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
                  <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300 font-medium">
                    Editing — click in the report to make changes
                  </div>
                  <iframe
                    key={iframeKey}
                    ref={editorRef}
                    title="Edit Report"
                    className="w-full bg-white"
                    style={{ minHeight: '60vh' }}
                  />
                </div>
              ) : (
                <div
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-6 overflow-auto max-h-[80vh] report-html"
                  dangerouslySetInnerHTML={{ __html: report }}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Guided Setup Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Refine Your Requirements</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Answer to generate a more targeted plan. All fields are optional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none p-1"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {dialogQuestions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                    {q.question}
                  </label>
                  <input
                    type="text"
                    value={dialogAnswers[q.id] || ''}
                    onChange={(e) => setDialogAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder={q.hint}
                    className="input-field"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => { setDialogOpen(false); planMutation.mutate(undefined) }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Skip — Use Original Prompt
              </button>
              <button
                type="button"
                onClick={handleDialogSubmit}
                className="btn-primary"
              >
                Generate Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dataset Preview Popup */}
      {previewDatasetId && previewAnchorRect && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden"
          style={{
            left: Math.min(previewAnchorRect.right + 8, window.innerWidth - 508),
            top: Math.min(previewAnchorRect.top, window.innerHeight - 308),
            width: 500,
            maxHeight: 300,
          }}
          onMouseEnter={() => {
            if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current)
          }}
          onMouseLeave={() => {
            previewTimeoutRef.current = setTimeout(() => {
              setPreviewDatasetId(null)
              setPreviewAnchorRect(null)
            }, 150)
          }}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300">
            {datasets?.find(d => d.id === previewDatasetId)?.name} — first 10 rows
          </div>
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-6">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Loading preview...</span>
            </div>
          ) : previewData && previewData.columns.length > 0 ? (
            (() => {
              const mapping = (() => {
                if (!previewDetail?.column_mapping) return {} as Record<string, string>
                const m = typeof previewDetail.column_mapping === 'string'
                  ? JSON.parse(previewDetail.column_mapping) as Record<string, string>
                  : previewDetail.column_mapping as Record<string, string>
                const r: Record<string, string> = {}
                Object.entries(m).forEach(([orig, db]) => { r[db] = orig })
                return r
              })()
              const displayCols = previewData.columns.filter(c => mapping[c])
              return (
                <div className="overflow-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        {displayCols.map(col => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 whitespace-nowrap">
                            {mapping[col]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {previewData.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          {displayCols.map(col => (
                            <td key={col} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap max-w-[150px] truncate">
                              {row[col] != null ? String(row[col]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">No preview available</p>
          )}
        </div>
      )}
    </div>
  )
}
