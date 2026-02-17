import { mcpN8nApi } from './api'
import type { AnalysisRequest, AnalysisResult, DatasetDetail, UpdateSummaryRequest, UpdateSummaryResult, UpdateDatasetRequest, UpdateDatasetResult, UploadDatasetRequest, UploadDatasetResult, DeleteDatasetRequest, DeleteDatasetResult, ReportTemplate } from '../types'

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
}
