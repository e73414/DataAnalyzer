import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../../context/SessionContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import { n8nService } from '../../services/mcpN8nService'
import { mcpN8nApi } from '../../services/api'
import { useAccessibleDatasets } from '../../hooks/useAccessibleDatasets'
import Navigation from '../../components/Navigation'
import type { ReportPlan, ReportPlanStep, CheckReportProgressResult, Dataset } from '../../types'

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
  scheduleConversationId?: string
}

const CHUNK_THRESHOLD_OPTIONS = [5_000, 10_000, 15_000, 20_000, 50_000, 100_000, 200_000] as const
const CHUNK_THRESHOLD = Math.min(...CHUNK_THRESHOLD_OPTIONS) // fixed trigger threshold (lowest option)

const COMMON_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
]

// Wraps a query so each chunk pages through the RESULTS of the full query (not source rows).
// Using LIMIT/OFFSET on the full-query result ensures the WHERE clause filters before the
// offset is applied, preventing empty chunks when qualifying rows are clustered in a specific
// source-row range.
function wrapSqlWithOffset(sql: string, chunkSize: number, offset: number): string {
  // Unescape JSON-escaped quotes that AI models sometimes emit (\" → ") so Postgres gets valid SQL
  const unescaped = sql.replace(/\\"/g, '"')
  const flat = unescaped.replace(/\s+/g, ' ').trim()
  // SQL that already starts with a WITH clause can't be nested in another CTE —
  // return unchanged and let the logic field guide the AI.
  if (/^\s*with\s+/i.test(flat)) return unescaped
  // Wrap the full query and page its results so OFFSET skips real filtered/aggregated rows.
  return `WITH _chunk AS (\n  ${flat}\n)\nSELECT * FROM _chunk ORDER BY 1 LIMIT ${chunkSize} OFFSET ${offset}`
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
  const rowCountMap = new Map(datasets.map(d => [d.id, d.row_count ?? 0]))
  const mergeStepFor = new Map<number, number>() // old step_number → representative new step_number
  const newSteps: ReportPlanStep[] = []
  let next = 1

  for (const step of plan.steps) {
    const rowCount  = rowCountMap.get(step.dataset_id ?? '') ?? 0
    const chunkSize = maxChunkRows
    const effectiveDeps = inferDepsFromSql(step)
    const remappedDeps = effectiveDeps
      .map(d => mergeStepFor.get(d))
      .filter((n): n is number => n !== undefined)

    // Don't chunk aggregated queries — GROUP BY collapses the result set so
    // chunking adds merge complexity for no gain and the merge SQL is fragile.
    const isAggregated = /\bgroup\s+by\b/i.test(step.query_strategy?.sql ?? '')

    if (rowCount <= threshold || isAggregated) {
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
            logic: `CHUNK ${i + 1} OF ${numChunks} (result rows ${offset + 1}–${offset + chunkSize}):
The provided SQL wraps the FULL query in a CTE and returns result rows ${offset + 1}–${offset + chunkSize}.
This means all WHERE filtering and aggregation run first; OFFSET then selects a non-overlapping slice of the final result.
Each chunk contains distinct result rows — the same row will NOT appear in another chunk.
If you need to regenerate the SQL, use this pattern — do NOT deviate:

  WITH _chunk AS (
    <full original query here, including WHERE and GROUP BY>
  )
  SELECT * FROM _chunk ORDER BY 1 LIMIT ${chunkSize} OFFSET ${offset}

Do NOT add LIMIT, OFFSET, or WHERE outside the inner query. Return the rows exactly as produced.
Return raw counts and sums (not percentages or averages) so the merge step can aggregate correctly.
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

export default function MobilePlanReportPage() {
  const { session, setAIModel } = useSession()
  const { appSettings } = useAppSettings()
  const queryClient = useQueryClient()
  const location = useLocation()
  const loadedState = location.state as LoadedPlanState | null
  const [prompt, setPrompt] = useState(loadedState?.prompt || '')
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set())
  const [selectedPlanModelId, setSelectedPlanModelId] = useState(session?.aiModel || '')
  const [selectedExecuteModelId, setSelectedExecuteModelId] = useState(session?.aiModel || '')
  const [plan, setPlan] = useState<ReportPlan | null>(null)
  const [report, setReport] = useState('')
  const [reportId, setReportId] = useState(loadedState?.reportId || '')
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<CheckReportProgressResult | null>(null)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(loadedState?.savedRecordId || null)
  const [isEditingReport, setIsEditingReport] = useState(false)
  const [datasetSearch, setDatasetSearch] = useState('')
  const [detailLevel, setDetailLevel] = useState('None')
  const [reportDetail, setReportDetail] = useState('Simple Report')
  const [chunkThreshold, setChunkThreshold] = useState(10_000)
  const runAfterPlan = true
  const [reportSchedules, setReportSchedules] = useState<import('../../types').ReportSchedule[]>([])
  const [_isLoadingSchedules, setIsLoadingSchedules] = useState(false)
  const [scheduleConversationId, setScheduleConversationId] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState<{
    scheduleType: 'daily' | 'weekly' | 'monthly' | 'custom'
    time: string
    dayOfWeek?: number
    dayOfMonth?: number
    customCron?: string
    timezone: string
    replanOnRun: boolean
  }>({
    scheduleType: 'daily',
    time: '09:00',
    timezone: 'America/Los_Angeles',
    replanOnRun: false,
  })
  const editorContentRef = useRef('')
  const planStartTime = useRef<number>(0)
  const executeStartTime = useRef<number>(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollProgressRef = useRef<((rptId: string) => Promise<void>) | null>(null)
  const executionCancelledRef = useRef(false)
  const expandedPlanRef = useRef<ReportPlan | null>(null)
  const completionHandledRef = useRef(false)
  const presentFormattedReportRef = useRef(true)

  const {
    datasets: datasets = [],
    isLoading: _isLoadingDatasets,
    error: _datasetsError,
  } = useAccessibleDatasets()

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
    if (loadedState.scheduleConversationId) setScheduleConversationId(loadedState.scheduleConversationId)

    // Mark as already saved (since it came from history)
    setReportSaved(true)

    // Restore step results so CSV download buttons appear for saved reports
    if (loadedState.reportId) {
      mcpN8nApi.get(`/reports/${encodeURIComponent(loadedState.reportId)}/steps`)
        .then(r => {
          const rows = Array.isArray(r.data) ? r.data : []
          if (rows.length > 0) {
            setExecutionProgress({
              report_id: loadedState.reportId!,
              steps: rows.map((row: { step_number: number; purpose: string; status: string; step_result?: string }) => ({
                step_number: row.step_number,
                purpose: row.purpose ?? '',
                dataset_id: '',
                status: (row.status ?? 'completed') as 'started' | 'completed' | 'error',
                step_result: row.step_result ?? undefined,
              })),
              final_report: null,
              status: 'completed',
            })
          }
        })
        .catch(() => { /* non-fatal — buttons just won't appear */ })
    }

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

  // Load report schedules when savedRecordId or scheduleConversationId is set
  useEffect(() => {
    const targetId = scheduleConversationId || savedRecordId
    if (!targetId) {
      setReportSchedules([])
      return
    }
    setIsLoadingSchedules(true)
    pocketbaseService.getReportSchedules()
      .then(schedules => {
        // Filter to schedules for this conversation
        setReportSchedules(schedules.filter(s => s.conversation_id === targetId))
      })
      .catch(err => {
        console.error('Failed to load schedules:', err)
        toast.error('Failed to load schedules')
      })
      .finally(() => setIsLoadingSchedules(false))
  }, [savedRecordId, scheduleConversationId])

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

  // Get current report content (from editor if editing, otherwise from state)
  const getCurrentReportContent = useCallback((): string => {
    if (isEditingReport && editorContentRef.current) {
      return editorContentRef.current
    }
    return report
  }, [isEditingReport, report])

  // Stop polling and handle completion
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])


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
      editorContentRef.current = ''
      toast.success('Report generated successfully')
    } else {
      // Don't clear existing report state — formatter returned empty output
      toast.error('Report completed but the formatter returned empty content. Check the run-formatter workflow in n8n.')
    }
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
        // Persist tmp tables to saved_ prefix before saving the record
        if (reportId) {
          await mcpN8nApi.post(`/reports/${encodeURIComponent(reportId)}/persist`, {})
        }
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
        queryClient.invalidateQueries({ queryKey: ['conversation-history', session.email] })
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

  // Schedule management handlers
  const handleSaveSchedule = async () => {
    if (!savedRecordId) {
      toast.error('Please save the report first')
      return
    }

    let cronExpression = scheduleForm.customCron || ''
    if (scheduleForm.scheduleType === 'daily') {
      const [hour, minute] = scheduleForm.time.split(':').map(Number)
      cronExpression = `${minute} ${hour} * * *`
    } else if (scheduleForm.scheduleType === 'weekly') {
      const [hour, minute] = scheduleForm.time.split(':').map(Number)
      const dayOfWeek = scheduleForm.dayOfWeek ?? 1
      cronExpression = `${minute} ${hour} * * ${dayOfWeek}`
    } else if (scheduleForm.scheduleType === 'monthly') {
      const [hour, minute] = scheduleForm.time.split(':').map(Number)
      const dayOfMonth = scheduleForm.dayOfMonth ?? 1
      cronExpression = `${minute} ${hour} ${dayOfMonth} * *`
    }

    if (!cronExpression.trim()) {
      toast.error('Invalid schedule')
      return
    }

    try {
      const datasetIds = Array.from(selectedDatasetIds).join(',') || 'all'
      const datasetNames = (datasets ?? []).filter(d => selectedDatasetIds.has(d.id)).map(d => d.name).join(', ') || 'All Datasets'

      await pocketbaseService.createReportSchedule({
        conversation_id: savedRecordId,
        schedule: cronExpression,
        timezone: scheduleForm.timezone,
        plan_model: effectivePlanModel,
        execute_model: effectiveExecuteModel,
        dataset_ids: datasetIds,
        dataset_name: datasetNames,
        detail_level: detailLevel,
        report_detail: reportDetail,
        template_id: userProfile?.template_id,
        replan_on_run: scheduleForm.replanOnRun,
      })

      toast.success('Schedule created')
      setScheduleFormOpen(false)
      setScheduleForm({ scheduleType: 'daily', time: '09:00', timezone: 'America/Los_Angeles', replanOnRun: false })

      // Refresh schedules
      const updated = await pocketbaseService.getReportSchedules()
      setReportSchedules(updated.filter(s => s.conversation_id === savedRecordId))
    } catch (err) {
      toast.error(`Failed to create schedule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm('Delete this schedule?')) return

    try {
      await pocketbaseService.deleteReportSchedule(scheduleId)
      toast.success('Schedule deleted')

      // Refresh schedules
      const updated = await pocketbaseService.getReportSchedules()
      setReportSchedules(updated.filter(s => s.conversation_id === savedRecordId))
    } catch (err) {
      toast.error(`Failed to delete schedule: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

      if (progress.status === 'completed') {
        stallCountRef.current = 0
        setExecutionProgress(progress)
        handleExecutionComplete(progress)
      } else if (progress.status === 'error') {
        if (formatterTriggeredRef.current) {
          // DB may still hold a stale error from the previous run while the re-triggered
          // formatter executes on n8n. Keep polling until it completes or times out (~60s).
          stallCountRef.current++
          if (stallCountRef.current >= 12) {
            stopPolling()
            setIsExecuting(false)
            formatterTriggeredRef.current = false
            setExecutionProgress(progress)
            toast.error(progress.error_message || 'Formatter failed to complete')
          }
          // Do not overwrite the locally-cleared in_progress state with stale API error
        } else {
          stallCountRef.current = 0
          if (progress.steps.length > 0) setExecutionProgress(progress)
          stopPolling()
          setIsExecuting(false)
          toast.error(progress.error_message || 'Execution failed — one or more steps encountered an error')
        }
      } else {
        // in_progress — only update when we have real step data
        if (progress.steps.length > 0) setExecutionProgress(progress)
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
      const newPlan = result.plan || null
      setPlan(newPlan)
      setReport('')
      setReportId('')
      setReportSaved(false)
      setSavedRecordId(null)
      setIsEditingReport(false)
      editorContentRef.current = ''
      setExecutionProgress(null)
      if (runAfterPlan && newPlan) {
        toast.success('Plan generated — starting execution...')
        setTimeout(() => handleExecutePlan(newPlan), 100)
      } else {
        toast.success('Report plan generated')
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to generate plan')
    },
  })

  const handleExecutePlan = useCallback(async (planOverride?: ReportPlan) => {
    const activePlan = planOverride ?? plan
    if (!activePlan || !session?.email) return

    executionCancelledRef.current = false
    const sharedReportId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    const expandedPlan = expandPlanForLargeDatasets(activePlan, datasets, CHUNK_THRESHOLD, chunkThreshold)
    expandedPlanRef.current = expandedPlan
    const batches = groupStepsByBatch(expandedPlan.steps)
    const hasParallelism = batches.some(b => b.length > 1)

    setReportId(sharedReportId)
    setIsExecuting(true)
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
      formatterTriggeredRef.current = true
      await n8nService.runFormatter({
        reportId: sharedReportId,
        email: session.email,
        model: appSettings?.report_model || effectiveExecuteModel,
        templateId: userProfile?.template_id,
        detailLevel,
        reportDetail,
        prompt,
        produceReport: presentFormattedReportRef.current ? 'Yes' : 'No',
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
  }, [plan, session, effectivePlanModel, effectiveExecuteModel, userProfile, detailLevel, reportDetail, chunkThreshold, datasets, waitForBatchCompletion, stopPolling, prompt, appSettings])

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

  const handleExecute = () => {
    if (!plan) {
      toast.error('No plan to execute')
      return
    }
    handleExecutePlan()
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950">
      <Navigation />

      <main className="px-4 py-4 space-y-4">

        {/* ── Input form ── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">

            {/* Prompt */}
            <div>
              <label className="label">Report Description</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="input-field resize-none"
                style={{ minHeight: '96px' }}
                placeholder="Describe what the report should cover, key metrics, comparisons..."
                disabled={isWorking}
              />
            </div>

            {/* Dataset list with search */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">
                  Datasets — optional ({selectedDatasetIds.size} selected)
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
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
                className="input-field py-3 mb-2"
                disabled={isWorking}
              />
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-600 max-h-48 overflow-y-auto">
                {[...(datasets ?? [])]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .filter(d => d.name.toLowerCase().includes(datasetSearch.toLowerCase()))
                  .map(dataset => (
                    <label
                      key={dataset.id}
                      className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        selectedDatasetIds.has(dataset.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDatasetIds.has(dataset.id)}
                        onChange={() => toggleDataset(dataset.id)}
                        disabled={isWorking}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {dataset.name}
                          {dataset.row_count != null && (
                            <span className="text-gray-400 dark:text-gray-500 font-normal">
                              {' '}({dataset.row_count.toLocaleString()} rows)
                            </span>
                          )}
                        </p>
                        {dataset.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{dataset.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
              </div>
            </div>

            {/* Plan model */}
            {!appSettings?.plan_model && (
              <div>
                <label className="label">Plan Model</label>
                <select
                  value={selectedPlanModelId}
                  onChange={(e) => handlePlanModelChange(e.target.value)}
                  className="input-field py-3"
                  disabled={isWorking}
                >
                  {aiModels?.length === 0 ? (
                    <option value="">No models</option>
                  ) : aiModels?.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Plan button */}
            <button
              type="submit"
              disabled={isWorking || !prompt.trim()}
              className="btn-primary w-full py-3"
            >
              {planMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Generating Plan...
                </span>
              ) : 'Plan Report'}
            </button>
          </div>
        </form>

        {/* ── Report Plan ── */}
        {plan && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Report Plan</h2>
            <div className="space-y-2">
              {plan.steps.map(step => {
                const progress = executionProgress?.steps?.find(s => s.step_number === step.step_number)
                const statusColor =
                  progress?.status === 'completed' ? 'bg-green-500' :
                  progress?.status === 'error' ? 'bg-red-500' :
                  progress?.status === 'started' ? 'bg-blue-500' :
                  'bg-gray-300 dark:bg-gray-600'
                return (
                  <div
                    key={step.step_number}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Step {step.step_number}: {step.purpose}
                      </p>
                      {step.dataset_id && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {datasets?.find(d => d.id === step.dataset_id)?.name ?? step.dataset_id}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Execute model + button */}
            {!appSettings?.execute_model && (
              <div>
                <label className="label">Execute Model</label>
                <select
                  value={selectedExecuteModelId}
                  onChange={(e) => handleExecuteModelChange(e.target.value)}
                  className="input-field py-3"
                  disabled={isExecuting}
                >
                  {aiModels?.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={handleExecute}
              disabled={isWorking}
              className="w-full py-3 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExecuting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
                  Executing...
                </span>
              ) : 'Execute Report'}
            </button>
          </div>
        )}

        {/* ── Report Output ── */}
        {report && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Report</h2>
              {reportSaved ? (
                <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveReport}
                  disabled={isSavingReport}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
                >
                  {isSavingReport ? 'Saving...' : 'Save Report'}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <iframe
                srcDoc={report}
                className="w-full rounded border border-gray-200 dark:border-gray-700"
                style={{ minHeight: '400px', height: 'auto' }}
                title="Report"
              />
            </div>
          </div>
        )}

        {/* ── Schedule section (collapsible) ── */}
        {(savedRecordId || scheduleConversationId) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setScheduleOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                📅 Schedule this report
                {reportSchedules.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({reportSchedules.length} active)
                  </span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {scheduleOpen && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                {/* Existing schedules */}
                {reportSchedules.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {reportSchedules.map(schedule => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{schedule.schedule}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{schedule.timezone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add schedule form */}
                {!scheduleFormOpen ? (
                  <button
                    type="button"
                    onClick={() => setScheduleFormOpen(true)}
                    className="w-full py-2.5 text-sm text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 border-dashed rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    + Add Schedule
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Frequency</label>
                      <select
                        value={scheduleForm.scheduleType}
                        onChange={(e) => setScheduleForm(f => ({ ...f, scheduleType: e.target.value as typeof f.scheduleType }))}
                        className="input-field py-3"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="custom">Custom Cron</option>
                      </select>
                    </div>
                    {scheduleForm.scheduleType !== 'custom' && (
                      <div>
                        <label className="label">Time</label>
                        <input
                          type="time"
                          value={scheduleForm.time}
                          onChange={(e) => setScheduleForm(f => ({ ...f, time: e.target.value }))}
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'weekly' && (
                      <div>
                        <label className="label">Day of Week</label>
                        <select
                          value={scheduleForm.dayOfWeek ?? 1}
                          onChange={(e) => setScheduleForm(f => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                          className="input-field py-3"
                        >
                          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'monthly' && (
                      <div>
                        <label className="label">Day of Month</label>
                        <input
                          type="number"
                          min={1} max={28}
                          value={scheduleForm.dayOfMonth ?? 1}
                          onChange={(e) => setScheduleForm(f => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    {scheduleForm.scheduleType === 'custom' && (
                      <div>
                        <label className="label">Cron Expression</label>
                        <input
                          type="text"
                          value={scheduleForm.customCron ?? ''}
                          onChange={(e) => setScheduleForm(f => ({ ...f, customCron: e.target.value }))}
                          placeholder="0 9 * * 1"
                          className="input-field py-3"
                        />
                      </div>
                    )}
                    <div>
                      <label className="label">Timezone</label>
                      <select
                        value={scheduleForm.timezone}
                        onChange={(e) => setScheduleForm(f => ({ ...f, timezone: e.target.value }))}
                        className="input-field py-3"
                      >
                        {COMMON_TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="replanOnRun"
                        checked={scheduleForm.replanOnRun}
                        onChange={(e) => setScheduleForm(f => ({ ...f, replanOnRun: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="replanOnRun" className="text-sm text-gray-700 dark:text-gray-300">
                        Re-plan on each run
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleFormOpen(false)}
                        className="flex-1 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSchedule}
                        className="flex-1 py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-800 rounded-lg transition-colors"
                      >
                        Save Schedule
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
