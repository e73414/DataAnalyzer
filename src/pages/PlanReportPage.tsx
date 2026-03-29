import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../context/SessionContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'
import { n8nService } from '../services/mcpN8nService'
import { mcpN8nApi } from '../services/api'
import { useAccessibleDatasets } from '../hooks/useAccessibleDatasets'
import Navigation from '../components/Navigation'
import ReportHtml from '../components/ReportHtml'
import type { ReportPlan, ReportPlanStep, CheckReportProgressResult, PromptDialogQuestion, DatasetPreview, DatasetDetail, Dataset } from '../types'

interface LoadedPlanState {
  prompt: string
  reportPlan: string
  report: string
  reportId?: string
  datasetId: string
  datasetName: string
  aiModel: string
  savedRecordId: string
  detailLevel?: string
  reportDetail?: string
}

const CHUNK_THRESHOLD_OPTIONS = [5_000, 10_000, 15_000, 20_000] as const
const CHUNK_THRESHOLD = Math.min(...CHUNK_THRESHOLD_OPTIONS) // fixed trigger threshold (lowest option)
const BASELINE_COLUMNS = 10  // column count at which maxChunkRows applies 1:1
const MIN_CHUNK_ROWS = 500

// Computes the effective chunk row count for a dataset.
// maxChunkRows = user-selected limit for a baseline-column dataset;
// wider datasets get proportionally fewer rows to keep AI context load roughly constant.
function calcChunkSize(columnCount: number | undefined, maxChunkRows: number): number {
  const cols = columnCount && columnCount > 0 ? columnCount : BASELINE_COLUMNS
  const target = maxChunkRows * BASELINE_COLUMNS
  return Math.min(maxChunkRows, Math.max(MIN_CHUNK_ROWS, Math.floor(target / cols)))
}

// Wraps a direct dataset SQL query in a CTE that pages through source rows using LIMIT/OFFSET.
// Finds the first top-level FROM clause (skipping subqueries) and replaces it with chunk_src.
function wrapSqlWithOffset(sql: string, chunkSize: number, offset: number): string {
  const flat = sql.replace(/\s+/g, ' ').trim()
  const fromRe = /\bFROM\s+("?[a-zA-Z0-9_\-.()]+"?)/gi
  let m: RegExpExecArray | null
  let tableName: string | null = null
  while ((m = fromRe.exec(flat)) !== null) {
    const before = flat.slice(0, m.index)
    const opens = (before.match(/\(/g) ?? []).length
    const closes = (before.match(/\)/g) ?? []).length
    if (opens === closes) { tableName = m[1]; break }
  }
  if (!tableName) return sql
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const modified = flat.replace(new RegExp(`\\bFROM\\s+${escaped}`, 'i'), 'FROM chunk_src')
  return `WITH chunk_src AS (\n  SELECT * FROM ${tableName} ORDER BY 1 LIMIT ${chunkSize} OFFSET ${offset}\n)\n${modified}`
}

// Infers implicit dependencies from SQL when the plan's dependencies array is empty.
// Looks for step1, step2, ... stepN references in sql or logic fields.
function inferDepsFromSql(step: ReportPlanStep): number[] {
  if (step.dependencies && step.dependencies.length > 0) return step.dependencies
  const sql = (step.query_strategy?.sql ?? '') + (step.query_strategy?.logic ?? '')
  const found: number[] = []
  for (let i = 1; i <= 20; i++) {
    if (sql.toLowerCase().indexOf('step' + i) !== -1 && !found.includes(i)) found.push(i)
  }
  return found.length > 0 ? found : (step.dependencies ?? [])
}

// Expands plan steps for datasets exceeding CHUNK_THRESHOLD rows.
// Each oversized step is replaced with N parallel chunk steps + 1 merge step.
// All step numbers and dependencies are renumbered consistently.
function expandPlanForLargeDatasets(plan: ReportPlan, datasets: Dataset[], threshold = CHUNK_THRESHOLD, maxChunkRows = CHUNK_THRESHOLD): ReportPlan {
  const rowCountMap    = new Map(datasets.map(d => [d.id, d.row_count    ?? 0]))
  const columnCountMap = new Map(datasets.map(d => [d.id, d.column_count]))
  const mergeStepFor = new Map<number, number>() // old step_number → representative new step_number
  const newSteps: ReportPlanStep[] = []
  let next = 1

  for (const step of plan.steps) {
    const rowCount    = rowCountMap.get(step.dataset_id ?? '')    ?? 0
    const columnCount = columnCountMap.get(step.dataset_id ?? '')
    const chunkSize   = calcChunkSize(columnCount, maxChunkRows)
    const effectiveDeps = inferDepsFromSql(step)
    const remappedDeps = effectiveDeps
      .map(d => mergeStepFor.get(d))
      .filter((n): n is number => n !== undefined)

    if (rowCount <= threshold) {
      const newNum = next++
      mergeStepFor.set(step.step_number, newNum)
      newSteps.push({ ...step, step_number: newNum, dependencies: remappedDeps })
    } else {
      const numChunks = Math.ceil(rowCount / chunkSize)
      const chunkNums: number[] = []

      const originalSql = step.query_strategy?.sql ?? ''
      for (let i = 0; i < numChunks; i++) {
        const chunkNum = next++
        chunkNums.push(chunkNum)
        const offset = i * chunkSize
        // Generate CTE-wrapped SQL with OFFSET so each chunk queries a distinct row window.
        // wrapSqlWithOffset may return the original sql unchanged if it can't parse the FROM clause;
        // in that case the logic field provides instructions for the AI fallback path.
        const chunkSql = originalSql ? wrapSqlWithOffset(originalSql, chunkSize, offset) : ''
        newSteps.push({
          ...step,
          step_number: chunkNum,
          dependencies: remappedDeps,
          purpose: `${step.purpose} (chunk ${i + 1} of ${numChunks})`,
          query_strategy: {
            ...step.query_strategy,
            sql: chunkSql || undefined,
            logic: `PAGINATED CHUNK ${i + 1} OF ${numChunks} (source rows ${offset + 1}–${offset + chunkSize}):
CRITICAL — LIMIT/OFFSET must scope the SOURCE ROWS before any filtering or aggregation, not the output rows. Use this CTE pattern — do not deviate:

  WITH chunk_src AS (
    SELECT * FROM <dataset_view> ORDER BY 1 LIMIT ${chunkSize} OFFSET ${offset}
  )
  SELECT ... FROM chunk_src WHERE ... GROUP BY ...

Replace <dataset_view> with the actual view name. Do NOT add LIMIT or OFFSET anywhere outside the CTE. This ensures this chunk only processes rows ${offset + 1}–${offset + chunkSize} of the source data.
Return raw counts and sums (not percentages or averages) so the merge step can aggregate correctly across all chunks.
${step.query_strategy?.logic ?? ''}`,
          },
        })
      }

      const mergeNum = next++
      mergeStepFor.set(step.step_number, mergeNum)
      newSteps.push({
        ...step,
        step_number: mergeNum,
        dataset_id: null,  // force dep path so AI aggregates from chunk tables instead of re-querying source
        dependencies: chunkNums,
        purpose: `Merge: ${step.purpose}`,
        query_strategy: {
          ...step.query_strategy,
          sql: undefined,  // no raw SQL — AI generates merge SQL from chunk schemas + logic below
          logic: `MERGE ONLY — DO NOT run any new database query against the source data.
The dataset was split into ${numChunks} non-overlapping chunks (steps ${chunkNums.join(', ')}), each covering a distinct OFFSET window with no row appearing in more than one chunk.
Your job is to consolidate the already-returned chunk results into one final answer for: ${step.purpose}

DUPLICATE SCAN DETECTION (check this first, before any summing):
Compare the per-group values across all chunks. If every chunk returns the same or nearly identical values for every group (within 2%), it means the chunk SQL did not apply the OFFSET correctly and each chunk scanned the full dataset.
In that case: use ONLY the values from chunk 1 (step ${chunkNums[0]}) as the final result — do NOT sum across chunks.
If chunks have clearly different per-group values, proceed with the aggregation rules below.

Aggregation rules (when chunks have different values):
- COUNTS / TOTALS: add the values from each chunk (e.g. chunk1_count + chunk2_count + ...).
- SUMS: add the sums from each chunk.
- AVERAGES / MEANS: compute as (sum of all chunk sums) / (sum of all chunk counts) — never average the per-chunk averages.
- PERCENTAGES / RATES: recompute from the merged totals — never average per-chunk percentages.
- GROUP-BY results: union the rows from all chunks; if the same group key appears in multiple chunks, SUM their counts/totals and recompute derived metrics.
- TOP-N / RANKINGS: re-rank after merging all group totals.`,
        },
      })
    }
  }

  // Rewrite step{N} references in SQL/logic text so downstream steps reference
  // the correct new step numbers after expansion. Sort by descending old step
  // number to prevent "step1" matching inside "step10" during replacement.
  const sortedMappings = [...mergeStepFor.entries()]
    .filter(([oldNum, newNum]) => oldNum !== newNum)
    .sort((a, b) => b[0] - a[0])

  if (sortedMappings.length > 0) {
    for (const step of newSteps) {
      const qs = step.query_strategy
      if (!qs) continue
      let sql = qs.sql ?? ''
      let logic = qs.logic ?? ''
      for (const [oldNum, newNum] of sortedMappings) {
        const re = new RegExp('\\bstep' + oldNum + '\\b', 'gi')
        sql = sql.replace(re, 'step' + newNum)
        logic = logic.replace(re, 'step' + newNum)
      }
      if (sql !== (qs.sql ?? '') || logic !== (qs.logic ?? '')) {
        step.query_strategy = { ...qs, sql: sql || undefined, logic: logic || undefined }
      }
    }
  }

  return { ...plan, total_steps: newSteps.length, steps: newSteps }
}

// Topological sort: groups steps into parallel batches by dependency level.
// Steps in the same batch have no inter-dependencies and can run concurrently.
function groupStepsByBatch(steps: ReportPlanStep[]): ReportPlanStep[][] {
  const batches: ReportPlanStep[][] = []
  const completed = new Set<number>()
  let remaining = [...steps]
  while (remaining.length > 0) {
    const batch = remaining.filter(s =>
      inferDepsFromSql(s).every(dep => completed.has(dep))
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

// Like groupStepsByBatch, but pre-seeds completed with steps that already finished
// so a failed step whose dependencies already ran doesn't get blocked.
function groupRetryStepsByBatch(failedSteps: ReportPlanStep[], alreadyCompleted: Set<number>): ReportPlanStep[][] {
  const batches: ReportPlanStep[][] = []
  const completed = new Set<number>(alreadyCompleted)
  let remaining = [...failedSteps]
  while (remaining.length > 0) {
    const batch = remaining.filter(s =>
      inferDepsFromSql(s).every(dep => completed.has(dep))
    )
    if (batch.length === 0) {
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
  const { appSettings } = useAppSettings()
  const location = useLocation()
  const loadedState = location.state as LoadedPlanState | null
  const [prompt, setPrompt] = useState(loadedState?.prompt || '')
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set())
  const [selectedPlanModelId, setSelectedPlanModelId] = useState(session?.aiModel || '')
  const [selectedExecuteModelId, setSelectedExecuteModelId] = useState(session?.aiModel || '')
  const [plan, setPlan] = useState<ReportPlan | null>(null)
  const [report, setReport] = useState('')
  const [reportId, setReportId] = useState(loadedState?.reportId || '')
  const [showJson, setShowJson] = useState(false)
  const [showRawReport, setShowRawReport] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [formatterTriggered, setFormatterTriggered] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<CheckReportProgressResult | null>(null)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(loadedState?.savedRecordId || null)
  const [dirtySteps, setDirtySteps] = useState<Set<number>>(new Set())
  const [savingSteps, setSavingSteps] = useState<Set<number>>(new Set())
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<string | null>(null)
  const [validationOpen, setValidationOpen] = useState(true)
const [isEditingReport, setIsEditingReport] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogQuestions, setDialogQuestions] = useState<PromptDialogQuestion[]>([])
  const [dialogAnswers, setDialogAnswers] = useState<Record<string, string>>({})
  const [openHintDropdown, setOpenHintDropdown] = useState<string | null>(null)
  const [datasetSearch, setDatasetSearch] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)
  const [detailLevel, setDetailLevel] = useState('None')
  const [reportDetail, setReportDetail] = useState('Simple Report')
  const [chunkThreshold, setChunkThreshold] = useState(10_000)
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
  const expandedPlanRef = useRef<ReportPlan | null>(null)
  const completionHandledRef = useRef(false)

  const {
    datasets: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useAccessibleDatasets()

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
    if (aiModels && aiModels.length > 0) {
      const defaultModel = aiModels[0].id
      if (!selectedPlanModelId) { setSelectedPlanModelId(defaultModel); setAIModel(defaultModel) }
      if (!selectedExecuteModelId) setSelectedExecuteModelId(defaultModel)
    }
  }, [aiModels, selectedPlanModelId, selectedExecuteModelId, setAIModel])

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

    // Select the datasets (stored as comma-separated IDs, or 'all')
    if (loadedState.datasetId && loadedState.datasetId !== 'all') {
      const ids = loadedState.datasetId.split(',').map(id => id.trim()).filter(Boolean)
      setSelectedDatasetIds(new Set(ids))
    }

    // Set the AI model
    if (loadedState.aiModel) {
      setSelectedPlanModelId(loadedState.aiModel)
      setSelectedExecuteModelId(loadedState.aiModel)
      setAIModel(loadedState.aiModel)
    }

    // Restore execution settings
    if (loadedState.detailLevel) setDetailLevel(loadedState.detailLevel)
    if (loadedState.reportDetail) setReportDetail(loadedState.reportDetail)

    // Mark as already saved (since it came from history)
    setReportSaved(true)

    // Clear the location state so refreshing doesn't re-load
    window.history.replaceState({}, '')

    toast.success('Plan and report loaded from history')
  }, [loadedState, setAIModel])

  // Sync admin-controlled defaults from app settings
  useEffect(() => {
    if (!appSettings) return
    if (appSettings.chunk_threshold) setChunkThreshold(Number(appSettings.chunk_threshold))
    if (appSettings.detail_level) setDetailLevel(appSettings.detail_level)
    if (appSettings.report_detail) setReportDetail(appSettings.report_detail)
  }, [appSettings])

  const effectivePlanModel = appSettings?.plan_model || selectedPlanModelId
  const effectiveExecuteModel = appSettings?.execute_model || selectedExecuteModelId

  const handlePlanModelChange = (modelId: string) => {
    setSelectedPlanModelId(modelId)
    setAIModel(modelId)
  }

  const handleExecuteModelChange = (modelId: string) => {
    setSelectedExecuteModelId(modelId)
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
  const downloadListCsv = async (stepNumber: number) => {
    if (!reportId) return
    try {
      const response = await mcpN8nApi.get(`/reports/${reportId}/steps/${stepNumber}/csv`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      const a = document.createElement('a')
      const disposition = response.headers['content-disposition'] ?? ''
      const nameMatch = disposition.match(/filename="?([^"]+)"?/)
      a.href = url
      a.download = nameMatch ? nameMatch[1] : `step_${stepNumber}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download CSV')
    }
  }

  const markDirty = (stepIndex: number) =>
    setDirtySteps((prev) => new Set(prev).add(stepIndex))

  const handleUpdateStep = async (stepIndex: number) => {
    if (!plan) return
    setSavingSteps((prev) => new Set(prev).add(stepIndex))
    try {
      if (savedRecordId) {
        await pocketbaseService.updateConversation(savedRecordId, {
          report_plan: JSON.stringify(plan),
        })
      }
      setDirtySteps((prev) => { const s = new Set(prev); s.delete(stepIndex); return s })
      toast.success('Step updated')
    } catch {
      toast.error('Failed to save step')
    } finally {
      setSavingSteps((prev) => { const s = new Set(prev); s.delete(stepIndex); return s })
    }
  }

  const updateStep = (stepIndex: number, field: keyof ReportPlanStep, value: unknown) => {
    markDirty(stepIndex)
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      steps[stepIndex] = { ...steps[stepIndex], [field]: value }
      return { ...prev, steps }
    })
  }

  const updateFilter = (stepIndex: number, filterKey: string, value: string | string[]) => {
    markDirty(stepIndex)
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
    markDirty(stepIndex)
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      const { [filterKey]: _, ...rest } = (qs.filters ?? {})
      qs.filters = rest
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const addFilter = (stepIndex: number) => {
    markDirty(stepIndex)
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      // Find a unique key name
      let keyName = 'new_filter'
      let counter = 1
      while (keyName in (qs.filters ?? {})) {
        keyName = `new_filter_${counter++}`
      }
      qs.filters = { ...(qs.filters ?? {}), [keyName]: '' }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const renameFilterKey = (stepIndex: number, oldKey: string, newKey: string) => {
    if (!newKey.trim() || oldKey === newKey) return
    markDirty(stepIndex)
    setPlan((prev) => {
      if (!prev) return prev
      const steps = [...prev.steps]
      const qs = { ...steps[stepIndex].query_strategy }
      const value = (qs.filters ?? {})[oldKey]
      const { [oldKey]: _, ...rest } = (qs.filters ?? {})
      qs.filters = { ...rest, [newKey.trim()]: value }
      steps[stepIndex] = { ...steps[stepIndex], query_strategy: qs }
      return { ...prev, steps }
    })
  }

  const updateQueryField = (stepIndex: number, field: 'columns' | 'logic' | 'join_on' | 'sql', value: string[] | string) => {
    markDirty(stepIndex)
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

  const [wasStopped, setWasStopped] = useState(false)

  const handleStopExecution = useCallback(() => {
    executionCancelledRef.current = true
    stopPolling()
    setIsExecuting(false)
    setWasStopped(true)
    // Mark any in-progress steps as error so they stop spinning visually
    setExecutionProgress(prev => prev ? {
      ...prev,
      steps: prev.steps.map(s =>
        s.status === 'started' ? { ...s, status: 'error' as const, step_result: 'Stopped by user' } : s
      ),
    } : null)
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
    if (completionHandledRef.current) return
    completionHandledRef.current = true
    stopPolling()
    setIsExecuting(false)
    const finalReport = extractReportHtml(progress.final_report)
    if (finalReport) {
      setReport(finalReport)
      setReportSaved(false)
      setSavedRecordId(null)
      setIsEditingReport(false)
      setValidationResult(null)
      editorContentRef.current = ''
      toast.success('Report generated successfully')
      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } else {
      // Don't clear existing report state — formatter returned empty output
      toast.error('Report completed but the formatter returned empty content. Check the run-formatter workflow in n8n.')
    }
  }, [stopPolling])

const handleValidateReport = async () => {
    if (!report || !reportId) return
    setIsValidating(true)
    setValidationResult(null)
    setValidationOpen(true)
    try {
      const result = await n8nService.validateReport({
        reportId,
        reportHtml: report,
        email: session!.email,
        model: appSettings?.upload_model || undefined,
      })
      setValidationResult(result.validationResult ?? 'No result returned')
    } catch (err) {
      setValidationResult(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

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
          prompt: `[Execute Plan] ${prompt}`,
          response: content,
          aiModel: effectiveExecuteModel,
          datasetId: Array.from(selectedDatasetIds).join(',') || 'all',
          datasetName: selectedNames || 'All Datasets',
          durationSeconds: Math.round((Date.now() - executeStartTime.current) / 1000),
          reportPlan: planJson,
          reportId,
          detailLevel,
          reportDetail,
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
  // Ref mirror of formatterTriggered so pollProgress callback can read it without stale closure
  const formatterTriggeredRef = useRef(false)

  // Poll for progress — stored in ref to avoid stale closures in setInterval
  const pollProgress = useCallback(async (rptId: string) => {
    try {
      const progress = await n8nService.checkReportProgress(rptId)
      // Only update UI when we have real step data — never overwrite pre-populated steps with empty
      if (progress.steps.length > 0 || progress.status === 'completed' || progress.status === 'error') {
        setExecutionProgress(progress)
      }

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
        // Skip stall check while formatter is running — it can take several minutes
        const allStepsDone = progress.steps.length > 0 && progress.steps.every(
          s => s.status === 'completed' || s.status === 'error'
        )
        if (allStepsDone && !formatterTriggeredRef.current) {
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
      let emptyPolls = 0
      const MAX_EMPTY_POLLS = 12 // ~1 minute of empty responses before giving up
      while (true) {
        if (executionCancelledRef.current) throw new Error('Execution cancelled')
        await new Promise(res => setTimeout(res, 5000))
        if (executionCancelledRef.current) throw new Error('Execution cancelled')
        const progress = await n8nService.checkReportProgress(reportId)
        if (progress.steps.length > 0) {
          emptyPolls = 0
          setExecutionProgress(progress)
        } else {
          emptyPolls++
          if (emptyPolls >= MAX_EMPTY_POLLS) {
            throw new Error('Execution timed out: no step results received after 1 minute')
          }
        }
        // Wait for all batch steps to settle (completed OR error) before deciding outcome —
        // this ensures n8n has finished all parallel steps before we throw or return.
        const allSettled = stepNumbers.every(num => {
          const s = progress.steps.find(s => s.step_number === num)
          return s?.status === 'completed' || s?.status === 'error'
        })
        if (allSettled) {
          const hasError = stepNumbers.some(
            num => progress.steps.find(s => s.step_number === num)?.status === 'error'
          )
          if (hasError) throw new Error('One or more steps failed during execution')
          return
        }
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
        model: effectivePlanModel,
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
    setWasStopped(false)
    const sharedReportId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    const expandedPlan = expandPlanForLargeDatasets(plan, datasets, CHUNK_THRESHOLD, chunkThreshold)
    expandedPlanRef.current = expandedPlan
    const batches = groupStepsByBatch(expandedPlan.steps)
    const hasParallelism = batches.some(b => b.length > 1)

    setReportId(sharedReportId)
    setIsExecuting(true)
    setFormatterTriggered(false)
    formatterTriggeredRef.current = false
    completionHandledRef.current = false
    setReport('')
    setReportSaved(false)
    setSavedRecordId(null)
    setIsEditingReport(false)
    editorContentRef.current = ''
    // Pre-populate only the first batch (no-dependency steps) so the UI shows them immediately.
    // Dependent steps will appear naturally once n8n writes them to the DB.
    const firstBatch = batches[0] ?? []
    setExecutionProgress({
      report_id: sharedReportId,
      steps: firstBatch.map(s => ({
        step_number: s.step_number,
        purpose: s.purpose,
        dataset_id: s.dataset_id ?? '',
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
              plan: JSON.stringify({ ...expandedPlan, steps: [step] }),
              email: session.email,
              model: effectiveExecuteModel,
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
      setFormatterTriggered(true)
      formatterTriggeredRef.current = true
      await n8nService.runFormatter({
        reportId: sharedReportId,
        email: session.email,
        model: appSettings?.report_model || effectiveExecuteModel,
        templateId: userProfile?.template_id,
        detailLevel,
        reportDetail,
        prompt,
      })

      // Poll for final report using existing mechanism
      pollingRef.current = setInterval(() => pollProgressRef.current?.(sharedReportId), 5000)
      setTimeout(() => pollProgressRef.current?.(sharedReportId), 2000)

    } catch (err) {
      if (executionCancelledRef.current) return
      stopPolling()
      setIsExecuting(false)
      const msg = err instanceof Error ? err.message : 'Failed to execute plan'
      // Preserve the progress display so the user can see which steps failed
      setExecutionProgress(prev => prev ? { ...prev, status: 'error', error_message: msg } : null)
      toast.error(msg)
    }
  }, [plan, session, effectivePlanModel, effectiveExecuteModel, userProfile, detailLevel, reportDetail, chunkThreshold, datasets, waitForBatchCompletion, stopPolling])

  const handleResumeExecution = useCallback(async () => {
    const expandedPlan = expandedPlanRef.current
    if (!expandedPlan || !session?.email || !reportId || !executionProgress) return

    const completedNums = new Set(
      executionProgress.steps.filter(s => s.status === 'completed').map(s => s.step_number)
    )
    // Use expanded plan steps so chunk/merge steps are included correctly
    const incompleteSteps = expandedPlan.steps.filter(s => !completedNums.has(s.step_number))
    if (incompleteSteps.length === 0) return

    const batches = groupRetryStepsByBatch(incompleteSteps, completedNums)
    const incompleteNums = incompleteSteps.map(s => s.step_number)

    executionCancelledRef.current = false
    setIsExecuting(true)
    setWasStopped(false)
    setFormatterTriggered(false)
    formatterTriggeredRef.current = false
    completionHandledRef.current = false
    setExecutionProgress(prev => prev ? {
      ...prev,
      status: 'in_progress',
      error_message: null,
      steps: prev.steps.map(s =>
        incompleteNums.includes(s.step_number) ? { ...s, status: 'started' as const } : s
      ),
    } : null)
    toast.success(`Resuming ${incompleteSteps.length} remaining step${incompleteSteps.length > 1 ? 's' : ''}...`)

    try {
      for (const batch of batches) {
        if (executionCancelledRef.current) return
        await Promise.all(
          batch.map(step =>
            n8nService.executePlan({
              plan: JSON.stringify({ ...expandedPlan, steps: [step] }),
              email: session.email,
              model: effectiveExecuteModel,
              templateId: userProfile?.template_id,
              reportId,
              stepsOnly: true,
            })
          )
        )
        await waitForBatchCompletion(reportId, batch.map(s => s.step_number))
      }

      if (executionCancelledRef.current) return

      setFormatterTriggered(true)
      formatterTriggeredRef.current = true
      await n8nService.runFormatter({
        reportId,
        email: session.email,
        model: appSettings?.report_model || effectiveExecuteModel,
        templateId: userProfile?.template_id,
        detailLevel,
        reportDetail,
        prompt,
      })

      pollingRef.current = setInterval(() => pollProgressRef.current?.(reportId), 5000)
      setTimeout(() => pollProgressRef.current?.(reportId), 2000)

    } catch (err) {
      if (executionCancelledRef.current) return
      stopPolling()
      setIsExecuting(false)
      const msg = err instanceof Error ? err.message : 'Resume failed'
      setExecutionProgress(prev => prev ? { ...prev, status: 'error', error_message: msg } : null)
      toast.error(msg)
    }
  }, [session, effectiveExecuteModel, userProfile, reportId, executionProgress, detailLevel, reportDetail, waitForBatchCompletion, stopPolling])

  const handleRetryFailed = useCallback(async () => {
    if (!plan || !session?.email || !reportId || !executionProgress) return

    const failedStepNumbers = executionProgress.steps
      .filter(s => s.status === 'error')
      .map(s => s.step_number)
    const failedSteps = failedStepNumbers
      .map(n => plan.steps.find(ps => ps.step_number === n))
      .filter(Boolean) as ReportPlanStep[]
    if (failedSteps.length === 0) return

    const alreadyCompleted = new Set(
      executionProgress.steps.filter(s => s.status === 'completed').map(s => s.step_number)
    )
    const batches = groupRetryStepsByBatch(failedSteps, alreadyCompleted)

    executionCancelledRef.current = false
    setIsExecuting(true)
    setFormatterTriggered(false)
    formatterTriggeredRef.current = false
    completionHandledRef.current = false
    setExecutionProgress(prev => prev ? {
      ...prev,
      status: 'in_progress',
      error_message: null,
      steps: prev.steps.map(s =>
        failedStepNumbers.includes(s.step_number) ? { ...s, status: 'started' as const } : s
      ),
    } : null)
    toast.success(`Retrying ${failedSteps.length} failed step${failedSteps.length > 1 ? 's' : ''}...`)

    try {
      for (const batch of batches) {
        if (executionCancelledRef.current) return
        await Promise.all(
          batch.map(step =>
            n8nService.executePlan({
              plan: JSON.stringify({ ...plan, steps: [step] }),
              email: session.email,
              model: effectiveExecuteModel,
              templateId: userProfile?.template_id,
              reportId,
              stepsOnly: true,
            })
          )
        )
        await waitForBatchCompletion(reportId, batch.map(s => s.step_number))
      }

      if (executionCancelledRef.current) return

      setFormatterTriggered(true)
      formatterTriggeredRef.current = true
      await n8nService.runFormatter({
        reportId,
        email: session.email,
        model: appSettings?.report_model || effectiveExecuteModel,
        templateId: userProfile?.template_id,
        detailLevel,
        reportDetail,
        prompt,
      })

      pollingRef.current = setInterval(() => pollProgressRef.current?.(reportId), 5000)
      setTimeout(() => pollProgressRef.current?.(reportId), 2000)

    } catch (err) {
      if (executionCancelledRef.current) return
      stopPolling()
      setIsExecuting(false)
      const msg = err instanceof Error ? err.message : 'Retry failed'
      setExecutionProgress(prev => prev ? { ...prev, status: 'error', error_message: msg } : null)
      toast.error(msg)
    }
  }, [plan, session, effectiveExecuteModel, userProfile, reportId, executionProgress, detailLevel, reportDetail, waitForBatchCompletion, stopPolling])

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
        model: effectivePlanModel,
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
                <input
                  type="text"
                  value={datasetSearch}
                  onChange={(e) => setDatasetSearch(e.target.value)}
                  placeholder="Search datasets..."
                  className="input-field mb-2"
                  disabled={isWorking}
                />
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-600 max-h-64 overflow-y-auto">
                  {[...(datasets ?? [])].sort((a, b) => a.name.localeCompare(b.name)).filter(d => d.name.toLowerCase().includes(datasetSearch.toLowerCase())).map((dataset) => (
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
                            {dataset.name}{dataset.row_count != null ? ` (rows: ${dataset.row_count.toLocaleString()})` : ''}
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
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

                {!appSettings?.plan_model && (
                  <select
                    value={selectedPlanModelId}
                    onChange={(e) => handlePlanModelChange(e.target.value)}
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
                )}

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
                        <select
                          value={step.step_type ?? 'query'}
                          onChange={(e) => updateStep(idx, 'step_type', e.target.value as 'query' | 'aggregate' | 'list')}
                          disabled={isWorking}
                          className="flex-shrink-0 text-xs font-semibold rounded px-2 py-0.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="query">query</option>
                          <option value="aggregate">aggregate</option>
                          <option value="list">list</option>
                        </select>
                        <input
                          type="text"
                          value={step.purpose}
                          onChange={(e) => updateStep(idx, 'purpose', e.target.value)}
                          className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-white border-none outline-none focus:ring-0 p-0"
                          disabled={isWorking}
                        />
                        {dirtySteps.has(idx) && !isWorking && (
                          <button
                            onClick={() => handleUpdateStep(idx)}
                            disabled={savingSteps.has(idx)}
                            className="flex-shrink-0 text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                          >
                            {savingSteps.has(idx) ? 'Saving…' : 'Update'}
                          </button>
                        )}
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* Dataset + Dependencies row */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400 font-medium text-xs w-16 flex-shrink-0">Dataset:</span>
                            <span className="text-blue-600 dark:text-blue-400 text-xs">{step.dataset_id ? getDatasetName(step.dataset_id) : '—'}</span>
                            {step.dataset_id && (
                              <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">({step.dataset_id})</span>
                            )}
                          </div>
                          {step.dependencies.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 dark:text-gray-400 font-medium text-xs w-16 flex-shrink-0">Depends:</span>
                              <div className="flex gap-1">
                                {step.dependencies.map(dep => (
                                  <span key={dep} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                                    Step {dep}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400 font-medium text-xs w-16 flex-shrink-0">Output:</span>
                            <div className="flex gap-1 flex-wrap">
                              {step.expected_output.map((out, oi) => (
                                <span key={oi} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-mono">
                                  {out}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Query Strategy */}
                        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Query Strategy</p>

                          {/* SQL (list/query steps with generated SQL) */}
                          {(step.step_type === 'list' || step.query_strategy.sql) && (
                            <div>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">SQL:</p>
                              <textarea
                                value={step.query_strategy.sql ?? ''}
                                onChange={(e) => updateQueryField(idx, 'sql', e.target.value)}
                                rows={5}
                                className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 resize-y"
                                disabled={isWorking}
                                placeholder="SELECT ..."
                              />
                            </div>
                          )}

                          {/* Logic */}
                          {(step.query_strategy.logic !== undefined || step.step_type !== 'list') && (
                            <div>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Logic:</p>
                              <textarea
                                value={step.query_strategy.logic ?? ''}
                                onChange={(e) => updateQueryField(idx, 'logic', e.target.value)}
                                rows={3}
                                className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 resize-y"
                                disabled={isWorking}
                                placeholder="Describe logic..."
                              />
                            </div>
                          )}

                          {/* Filters */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-gray-400 dark:text-gray-500">Filters:</p>
                              {!isWorking && (
                                <button
                                  onClick={() => addFilter(idx)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                                >+ Add</button>
                              )}
                            </div>
                            {Object.keys(step.query_strategy.filters ?? {}).length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {Object.entries(step.query_strategy.filters ?? {}).map(([key, val]) => {
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
                                        >&#10005;</button>
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
                              value={(step.query_strategy.columns ?? []).join(', ')}
                              onChange={(e) => updateQueryField(idx, 'columns', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                              disabled={isWorking}
                              placeholder="col1, col2, col3"
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
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 pt-2">
                {/* Selector row */}
                <div className="flex flex-wrap items-end gap-4">
                  {!appSettings?.plan_model && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Plan AI Model</label>
                      <select
                        value={selectedPlanModelId}
                        onChange={(e) => handlePlanModelChange(e.target.value)}
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
                    </div>
                  )}
                  {!appSettings?.execute_model && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Execute AI Model</label>
                      <select
                        value={selectedExecuteModelId}
                        onChange={(e) => handleExecuteModelChange(e.target.value)}
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
                    </div>
                  )}

                  {!appSettings?.chunk_threshold && plan.steps.some(s => (datasets.find(d => d.id === s.dataset_id)?.row_count ?? 0) > CHUNK_THRESHOLD) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rows Per Chunk</label>
                      <select
                        value={chunkThreshold}
                        onChange={(e) => setChunkThreshold(Number(e.target.value))}
                        className="input-field w-auto"
                        disabled={isWorking}
                      >
                        {CHUNK_THRESHOLD_OPTIONS.map(v => (
                          <option key={v} value={v}>{v.toLocaleString()} rows</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!appSettings?.report_detail && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Detail Level:</label>
                      <select
                        value={reportDetail}
                        onChange={(e) => setReportDetail(e.target.value)}
                        className="input-field w-auto"
                        disabled={isWorking}
                      >
                        <option value="Simple Report">Simple Report</option>
                        <option value="Detailed Report">Detailed Report</option>
                      </select>
                    </div>
                  )}

                  {!appSettings?.detail_level && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Show Steps:</label>
                      <select
                        value={detailLevel}
                        onChange={(e) => setDetailLevel(e.target.value)}
                        className="input-field w-auto"
                        disabled={isWorking}
                      >
                        <option value="Highly Detailed">Highly Detailed</option>
                        <option value="Some Detail">Some Detail</option>
                        <option value="Just Overview">Just Overview</option>
                        <option value="None">None</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={isWorking || !plan || !effectiveExecuteModel}
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
            </div>
          )}

          {/* Execution Progress */}
          {(isExecuting || wasStopped || executionProgress?.status === 'error') && executionProgress && (
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

              {/* Resume after stop — shown at top level so it's always visible */}
              {wasStopped && !isExecuting && (() => {
                const remaining = executionProgress.steps.filter(s => s.status !== 'completed').length
                return remaining > 0 ? (
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      type="button"
                      onClick={handleResumeExecution}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                    >
                      Resume Execution ({remaining} remaining)
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Completed steps will be reused
                    </span>
                  </div>
                ) : null
              })()}

              {executionProgress.steps.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></span>
                  <p className="text-sm text-blue-700 dark:text-blue-300">Initializing execution...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const planStepMap = new Map(plan?.steps.map(s => [s.step_number, s]) ?? [])
                    return executionProgress.steps.map((step) => {
                      const planStep = planStepMap.get(step.step_number)
                      const sql = planStep?.query_strategy?.sql
                      const pseudoSql = planStep?.query_strategy?.pseudo_sql
                      const stepSql = sql || pseudoSql
                      return (
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
                          {/* SQL — shown expanded while running, collapsed after */}
                          {stepSql && step.status === 'started' && (
                            <div className="ml-12 mt-1 px-3 py-2 rounded bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">{sql ? 'SQL' : 'Pseudo SQL'}</p>
                              <pre className="text-xs text-blue-800 dark:text-blue-200 whitespace-pre-wrap break-all font-mono">{stepSql}</pre>
                            </div>
                          )}
                          {stepSql && (step.status === 'completed' || step.status === 'error') && (
                            <details className="ml-12 mt-1">
                              <summary className="cursor-pointer text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-1">
                                {sql ? 'View SQL' : 'View pseudo SQL'}
                              </summary>
                              <pre className="mt-1 px-3 py-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all font-mono">{stepSql}</pre>
                            </details>
                          )}
                          {step.step_result && step.status !== 'started' && (() => {
                            const hasCsv = step.step_result!.includes('<!--LIST_TABLE-->')
                            const displayResult = hasCsv
                              ? step.step_result!.replace('<!--LIST_TABLE-->', '').trim()
                              : step.step_result!
                            return (
                              <>
                                <div className={`ml-12 mt-1 px-3 py-1.5 rounded text-xs leading-snug ${
                                  step.status === 'error'
                                    ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                                    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                                }`}>
                                  {displayResult.length > 200 ? displayResult.slice(0, 200) + '…' : displayResult}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )
                    })
                  })()}

                  {/* Consolidation indicator — only after formatter has been triggered */}
                  {formatterTriggered && !executionProgress.final_report && executionProgress.status !== 'error' && (
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

                  {/* Retry failed steps */}
                  {!isExecuting && executionProgress.steps.some(s => s.status === 'error') && plan && reportId && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleRetryFailed}
                        className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                      >
                        Retry Failed Steps ({executionProgress.steps.filter(s => s.status === 'error').length})
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Completed steps will be reused
                      </span>
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
                  {executionProgress?.steps
                    .filter(s => s.status === 'completed' && s.step_result?.includes('<!--LIST_TABLE-->'))
                    .map(s => (
                      <button
                        key={s.step_number}
                        type="button"
                        onClick={() => downloadListCsv(s.step_number)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Full Data
                      </button>
                    ))
                  }
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
                    className={`px-2 py-1 text-xs font-medium rounded-lg shadow-sm transition-colors ${
                      reportSaved
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white disabled:cursor-not-allowed'
                    }`}
                  >
                    {isSavingReport ? (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block animate-spin rounded-full h-2.5 w-2.5 border-2 border-white border-t-transparent"></span>
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
                  <button
                    type="button"
                    onClick={handleValidateReport}
                    disabled={isValidating || isExecuting}
                    className="px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {isValidating ? (
                      <>
                        <span className="inline-block animate-spin rounded-full h-2.5 w-2.5 border-2 border-white border-t-transparent" />
                        Validating...
                      </>
                    ) : (
                      'Validate Report'
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
                <ReportHtml
                  html={report}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-6 overflow-auto max-h-[80vh] report-html"
                  onHtmlChange={(newHtml) => { setReport(newHtml); setReportSaved(false) }}
                />
              )}

              {/* Validation Result */}
              {(validationResult !== null || isValidating) && (
                <div className="mt-6 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex justify-between items-center px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-sm font-medium text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                    onClick={() => setValidationOpen(v => !v)}
                  >
                    <span>Validation Result</span>
                    <svg className={`w-4 h-4 transition-transform duration-200 ${validationOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {validationOpen && (
                    <div className="px-4 py-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono bg-white dark:bg-gray-900">
                      {isValidating
                        ? <span className="text-gray-400 dark:text-gray-500">Running validation...</span>
                        : validationResult}
                    </div>
                  )}
                </div>
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
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                    {q.question}
                  </label>
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
                              onClick={() => {
                                setDialogAnswers(prev => ({ ...prev, [q.id]: h.text }))
                                setOpenHintDropdown(null)
                              }}
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
                  {q.hint && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 leading-snug">{q.hint}</p>
                  )}
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
