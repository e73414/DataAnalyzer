import { mcpN8nApi } from './api'
import type { AnalysisRequest, AnalysisResult, DatasetDetail, UpdateSummaryRequest, UpdateSummaryResult, UpdateDatasetRequest, UpdateDatasetResult, UploadDatasetRequest, UploadDatasetResult, DeleteDatasetRequest, DeleteDatasetResult } from '../types'

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

interface SendReportRequest {
  emails: string[]
  content: string
  review?: boolean
  // When reviewed=true, this is the final send after user edits
  reviewed?: boolean
  subject?: string
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
    const response = await mcpN8nApi.post<N8nWebhookResponse>('/mcp/execute', {
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
      },
    })

    if (response.data.status === 'error') {
      throw new Error(response.data.error || 'Failed to send report')
    }

    // If review was requested, return the editable fields
    if (request.review && response.data.data) {
      const data = response.data.data as { subject?: string; emails?: string[]; content?: string }
      return {
        status: 'ok',
        subject: data.subject,
        emails: data.emails,
        content: data.content,
      }
    }

    return {
      status: 'ok',
      message: 'Report sent successfully',
    }
  },
}
