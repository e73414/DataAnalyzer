import { mcpN8nApi } from './api'
import type { AnalysisRequest, AnalysisResult, DatasetDetail, DatasetPreview, UpdateSummaryRequest, UpdateSummaryResult, UpdateDatasetRequest, UpdateDatasetResult, UploadDatasetRequest, UploadDatasetResult, DeleteDatasetRequest, DeleteDatasetResult, ReportTemplate, PlanReportRequest, PlanReportResult, ExecutePlanRequest, ExecutePlanResult, CheckReportProgressResult, ReportPlan, PromptDialogRequest, PromptDialogResult, PromptDialogQuestion, RunFormatterRequest } from '../types'

interface N8nWebhookResponse {
  status: 'ok' | 'error'
  code?: number
  data?: {
    result?: string
    processUsed?: string
    metadata?: Record<string, unknown>
  }
  error?: string
}

// Webhook paths for the Data Analyzer workflows (production)
const DATA_ANALYZER_WEBHOOK_PATH = 'webhook/analyze'
const GET_DATASET_DETAIL_WEBHOOK_PATH = 'webhook/get-dataset-detail'
const UPDATE_SUMMARY_WEBHOOK_PATH = 'webhook/update-summary'
const UPDATE_DATASET_WEBHOOK_PATH = 'webhook/update-dataset'
const UPLOAD_DATASET_WEBHOOK_PATH = 'webhook/upload-dataset'
const DELETE_DATASET_WEBHOOK_PATH = 'webhook/delete-dataset'
const SEND_REPORT_WEBHOOK_PATH = 'webhook/send-report'
const LIST_TEMPLATES_WEBHOOK_PATH = 'webhook/list-templates'
const DELETE_TEMPLATE_WEBHOOK_PATH = 'webhook/delete-template'
const UPLOAD_TEMPLATE_WEBHOOK_PATH = 'webhook/upload-template'
const GET_DATASET_PREVIEW_WEBHOOK_PATH = 'webhook/get-dataset-preview'
const PROMPT_DIALOG_WEBHOOK_PATH = 'webhook/prompt-dialog'
const PLAN_REPORT_WEBHOOK_PATH = 'webhook/plan-report'
const EXECUTE_PLAN_WEBHOOK_PATH = 'webhook/execute-plan'
const CHECK_REPORT_PROGRESS_WEBHOOK_PATH = 'webhook/check-report-progress'
const RUN_FORMATTER_WEBHOOK_PATH = 'webhook/run-formatter'

interface SendReportRequest {
  emails: string[]
  content: string
  review?: boolean
  // When reviewed=true, this is the final send after user edits
  reviewed?: boolean
  subject?: string
  templateId?: string
}

interface SendReportResult {
  status: 'ok' | 'error'
  message?: string
  // When review=true, these fields are returned for editing
  subject?: string
  emails?: string[] | string  // Can be array or comma-separated string from n8n
  content?: string
}

export const n8nService = {
  async runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: DATA_ANALYZER_WEBHOOK_PATH,
      },
      input: {
        email: request.email,
        model: request.model,
        datasetId: request.datasetId,
        prompt: request.prompt,
        emailResponse: request.emailResponse ?? false,
        ...(request.emailSubject && { emailSubject: request.emailSubject }),
        ...(request.returnSteps && { returnSteps: true }),
        ...(request.templateId && { templateId: request.templateId }),
      },
    })

    if (response.data.status === 'error' || !response.data.data) {
      throw new Error(response.data.error || 'Analysis failed')
    }

    return {
      status: 'ok',
      result: response.data.data.result || 'No result returned',
      processUsed: response.data.data.processUsed,
      metadata: response.data.data.metadata as AnalysisResult['metadata'],
    }
  },

  async getDatasetDetail(datasetId: string, email: string): Promise<DatasetDetail> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: GET_DATASET_DETAIL_WEBHOOK_PATH,
      },
      input: {
        datasetId,
        email,
      },
    })

    if (response.data.status === 'error' || !response.data.data) {
      throw new Error(response.data.error || 'Failed to fetch dataset details')
    }

    return response.data.data as unknown as DatasetDetail
  },

  async getDatasetView(datasetId: string): Promise<DatasetPreview> {
    const response = await mcpN8nApi.get<DatasetPreview>(`/dataset-view/${encodeURIComponent(datasetId)}`)
    return response.data
  },

  async getDatasetPreview(datasetId: string, email: string, limit: number = 20): Promise<DatasetPreview> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: GET_DATASET_PREVIEW_WEBHOOK_PATH,
      },
      input: {
        datasetId,
        email,
        limit,
      },
    })

    if (response.data.status === 'error' || !response.data.data) {
      throw new Error(response.data.error || 'Failed to fetch dataset preview')
    }

    return response.data.data as unknown as DatasetPreview
  },

  async updateSummary(request: UpdateSummaryRequest): Promise<UpdateSummaryResult> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: UPDATE_SUMMARY_WEBHOOK_PATH,
      },
      input: {
        datasetId: request.datasetId,
        summary: request.summary,
        email: request.email,
        ...(request.datasetDesc != null && { dataset_desc: request.datasetDesc }),
        ...(request.datasetName != null && { dataset_name: request.datasetName }),
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to update summary')
    }

    return {
      status: 'ok',
      message: 'Summary updated successfully',
    }
  },

  async updateDataset(request: UpdateDatasetRequest): Promise<UpdateDatasetResult> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: UPDATE_DATASET_WEBHOOK_PATH,
      },
      input: {
        datasetId: request.datasetId,
        email: request.email,
        csvData: request.csvData,
        fileName: request.fileName,
        ...(request.datasetDesc != null && { dataset_desc: request.datasetDesc }),
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to update dataset')
    }

    return {
      status: 'ok',
      message: 'Dataset updated successfully',
      rowsInserted: (response.data.data as { rowsInserted?: number })?.rowsInserted,
    }
  },

  async uploadDataset(request: UploadDatasetRequest): Promise<UploadDatasetResult> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: UPLOAD_DATASET_WEBHOOK_PATH,
      },
      input: {
        datasetName: request.datasetName,
        description: request.description,
        email: request.email,
        csvData: request.csvData,
        ...(request.datasetDesc && { dataset_desc: request.datasetDesc }),
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to upload dataset')
    }

    const data = response.data.data as { datasetId?: string; datasetName?: string; rowsInserted?: number }
    return {
      status: 'ok',
      datasetId: data?.datasetId,
      datasetName: data?.datasetName,
      rowsInserted: data?.rowsInserted,
      message: 'Dataset uploaded successfully',
    }
  },

  async deleteDataset(request: DeleteDatasetRequest): Promise<DeleteDatasetResult> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: DELETE_DATASET_WEBHOOK_PATH,
      },
      input: {
        datasetId: request.datasetId,
        email: request.email,
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to delete dataset')
    }

    const data = response.data.data as { datasetName?: string; message?: string }
    return {
      status: 'ok',
      datasetName: data?.datasetName,
      message: data?.message || 'Dataset deleted successfully',
    }
  },

  async sendReport(request: SendReportRequest): Promise<SendReportResult> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: SEND_REPORT_WEBHOOK_PATH,
      },
      input: {
        emails: request.emails,
        content: request.content,
        review: request.review ?? false,
        reviewed: request.reviewed ?? false,
        subject: request.subject,
        ...(request.templateId && { templateId: request.templateId }),
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any

    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to send report')
    }

    // If review was requested, extract cleanHtml/subject/emails from the n8n response.
    // MCP adapter wraps as { status, code, data: <n8n_response> }.
    // n8n returns [{ cleanHtml, subject, emails }].
    // data may arrive as a JSON string if content-type wasn't application/json.
    if (request.review) {
      // Unwrap the MCP adapter's data field
      let raw = fullData?.data

      // If data is a JSON string, parse it
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
      }

      // Find the source object containing cleanHtml/subject/emails
      const findSrc = (obj: any): any => {
        if (!obj) return null
        // Direct match: object has cleanHtml or subject
        if (obj.cleanHtml || obj.subject) return obj
        // Nested in output
        if (obj.output?.cleanHtml || obj.output?.subject) return obj.output
        return null
      }

      let src: any = null
      if (Array.isArray(raw)) {
        src = findSrc(raw[0])
      } else if (typeof raw === 'object' && raw !== null) {
        src = findSrc(raw)
        // Check if raw.data contains the actual response (double-wrapped)
        if (!src && raw.data) {
          const inner = typeof raw.data === 'string' ? (() => { try { return JSON.parse(raw.data) } catch { return raw.data } })() : raw.data
          if (Array.isArray(inner)) {
            src = findSrc(inner[0])
          } else {
            src = findSrc(inner)
          }
        }
      }

      const subject = src?.subject as string | undefined
      // Try all possible field names for HTML content
      const content = (src?.cleanHtml ?? src?.cleanhtml ?? src?.html ?? src?.htmlContent ?? src?.body ?? src?.content ?? src?.message) as string | undefined
      const emails = src?.emails as string[] | string | undefined

      return {
        status: 'ok',
        subject,
        emails,
        content,
      }
    }

    return {
      status: 'ok',
      message: 'Report sent successfully',
    }
  },

  async listTemplates(email: string): Promise<ReportTemplate[]> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: LIST_TEMPLATES_WEBHOOK_PATH,
      },
      input: {
        email,
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to fetch templates')
    }

    const data = response.data.data as unknown as ReportTemplate[] | { data: ReportTemplate[]; items?: ReportTemplate[] }
    if (Array.isArray(data)) return data
    return data?.data || data?.items || []
  },

  async deleteTemplate(templateId: string, email: string): Promise<void> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: DELETE_TEMPLATE_WEBHOOK_PATH,
      },
      input: {
        templateId,
        email,
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to delete template')
    }
  },

  async uploadTemplate(data: {
    name: string
    description: string
    owner_email: string
    access: string
    file: string
    fileName: string
  }): Promise<void> {
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: UPLOAD_TEMPLATE_WEBHOOK_PATH,
      },
      input: data,
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to upload template')
    }
  },

  async promptDialog(request: PromptDialogRequest): Promise<PromptDialogResult> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: PROMPT_DIALOG_WEBHOOK_PATH,
      },
      input: {
        prompt: request.prompt,
        email: request.email,
        dataset_ids: request.datasetIds,
        ...(request.model && { model: request.model }),
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any
    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to generate clarifying questions')
    }

    // Extract questions array — same deep-search pattern as planReport
    let raw = fullData?.data
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
    }

    const findQuestions = (val: unknown, depth = 0): PromptDialogQuestion[] | undefined => {
      if (depth > 5 || !val) return undefined
      if (typeof val === 'string') {
        try { return findQuestions(JSON.parse(val), depth + 1) } catch { return undefined }
      }
      if (Array.isArray(val)) {
        // If it's an array of question objects
        if (val.length > 0 && typeof val[0] === 'object' && (val[0] as Record<string, unknown>).question) {
          return val as PromptDialogQuestion[]
        }
        for (const item of val) {
          const found = findQuestions(item, depth + 1)
          if (found) return found
        }
        return undefined
      }
      if (typeof val !== 'object') return undefined
      const obj = val as Record<string, unknown>
      if (Array.isArray(obj.questions)) return obj.questions as PromptDialogQuestion[]
      for (const key of ['output', 'data', 'result']) {
        if (obj[key] != null) {
          const found = findQuestions(obj[key], depth + 1)
          if (found) return found
        }
      }
      return undefined
    }

    const questions = findQuestions(fullData) ?? []
    return { questions }
  },

  async planReport(request: PlanReportRequest): Promise<PlanReportResult> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: PLAN_REPORT_WEBHOOK_PATH,
      },
      input: {
        prompt: request.prompt,
        email: request.email,
        dataset_ids: request.datasetIds,
        ...(request.model && { model: request.model }),
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any
    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to generate report plan')
    }

    // Extract plan JSON — n8n AI Agent returns { output: {...} } or [{ output: {...} }]
    // MCP adapter wraps as { status, code, data: <n8n_response> }
    // data may be a JSON string or object
    let raw = fullData?.data
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
    }

    // Recursively search for a ReportPlan object (has steps array)
    const findPlan = (val: unknown, depth = 0): ReportPlan | undefined => {
      if (depth > 5 || !val) return undefined

      // If it's a string, try parsing as JSON
      if (typeof val === 'string') {
        try { return findPlan(JSON.parse(val), depth + 1) } catch { return undefined }
      }

      // If it's an array, check each element
      if (Array.isArray(val)) {
        for (const item of val) {
          const found = findPlan(item, depth + 1)
          if (found) return found
        }
        return undefined
      }

      if (typeof val !== 'object') return undefined
      const obj = val as Record<string, unknown>

      // If it has steps array, it's the plan itself
      if (Array.isArray(obj.steps)) return obj as unknown as ReportPlan

      // Check known wrapper fields: output, data, result, plan
      for (const key of ['output', 'data', 'result', 'plan']) {
        if (obj[key] != null) {
          const found = findPlan(obj[key], depth + 1)
          if (found) return found
        }
      }

      return undefined
    }

    const planObj = findPlan(fullData)

    if (!planObj) {
      throw new Error('Failed to parse report plan from response')
    }

    return {
      status: 'ok',
      plan: planObj,
    }
  },

  async executePlan(request: ExecutePlanRequest): Promise<ExecutePlanResult> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: EXECUTE_PLAN_WEBHOOK_PATH,
      },
      input: {
        plan: request.plan,
        email: request.email,
        model: request.model,
        ...(request.templateId && { templateId: request.templateId }),
        ...(request.reportId && { report_id: request.reportId }),
        ...(request.stepsOnly && { steps_only: true }),
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any

    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to execute report plan')
    }

    // The workflow now responds immediately with { report_id, total_steps, status: 'started' }
    let raw = fullData?.data
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
    }

    let reportId = ''
    let totalSteps = 0

    const extractFrom = (obj: Record<string, unknown>) => {
      if (obj.report_id && typeof obj.report_id === 'string') reportId = obj.report_id
      if (typeof obj.total_steps === 'number') totalSteps = obj.total_steps
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      extractFrom(raw as Record<string, unknown>)
    } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
      extractFrom(raw[0] as Record<string, unknown>)
    }

    // Fallback: check fullData directly
    if (!reportId && fullData?.report_id) reportId = fullData.report_id
    if (!totalSteps && fullData?.total_steps) totalSteps = fullData.total_steps

    return {
      status: 'ok',
      report_id: reportId || undefined,
      total_steps: totalSteps || undefined,
    }
  },

  async checkReportProgress(reportId: string): Promise<CheckReportProgressResult> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: CHECK_REPORT_PROGRESS_WEBHOOK_PATH,
      },
      input: {
        report_id: reportId,
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any

    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to check report progress')
    }

    let raw = fullData?.data
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
    }

    // Extract progress data from the response
    const extractProgress = (obj: Record<string, unknown>): CheckReportProgressResult | null => {
      if (obj.report_id && Array.isArray(obj.steps)) {
        return {
          report_id: obj.report_id as string,
          steps: obj.steps as CheckReportProgressResult['steps'],
          final_report: (obj.final_report as string) || null,
          status: (obj.status as CheckReportProgressResult['status']) || 'in_progress',
          error_message: (obj.error_message as string) || null,
        }
      }
      return null
    }

    let result: CheckReportProgressResult | null = null

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      result = extractProgress(raw as Record<string, unknown>)
    } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
      result = extractProgress(raw[0] as Record<string, unknown>)
    }

    // Fallback: check fullData directly
    if (!result) {
      result = extractProgress(fullData)
    }

    return result || {
      report_id: reportId,
      steps: [],
      final_report: null,
      status: 'starting',
    }
  },

  async runFormatter(request: RunFormatterRequest): Promise<void> {
    const response = await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: { webhookPath: RUN_FORMATTER_WEBHOOK_PATH },
      input: {
        report_id: request.reportId,
        email: request.email,
        ...(request.model && { model: request.model }),
        ...(request.templateId && { templateId: request.templateId }),
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullData = response.data as any
    if (fullData?.status === 'error') {
      throw new Error(fullData?.error || 'Failed to start formatter')
    }
  },
}
