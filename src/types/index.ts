export interface Session {
  email: string
  aiModel: string
  loginTime: number
}

export interface AIModel {
  id: string
  name: string
  provider?: string
  description?: string
}

export interface Dataset {
  id: string
  name: string
  description?: string
  owner_email: string
  created: string
  updated: string
}

export interface DatasetDetail extends Dataset {
  summary?: string
  column_mapping?: Record<string, string> | string
}

export interface UpdateSummaryRequest {
  datasetId: string
  summary: string
  email: string
}

export interface UpdateSummaryResult {
  status: 'ok' | 'error'
  message?: string
}

export interface UpdateDatasetRequest {
  datasetId: string
  email: string
  csvData: string // Base64 encoded CSV content
  fileName: string
}

export interface UpdateDatasetResult {
  status: 'ok' | 'error'
  message?: string
  rowsInserted?: number
}

export interface AnalysisRequest {
  email: string
  model: string
  datasetId: string
  prompt: string
  emailResponse?: boolean
}

export interface AnalysisResult {
  status: 'ok' | 'error'
  result: string
  processUsed?: string
  metadata?: {
    model?: string
    datasetName?: string
    processingTime?: number
  }
}

export interface McpResponse<T> {
  status: 'ok' | 'error'
  data?: T
  error?: string
  details?: unknown
}

export interface UploadDatasetRequest {
  datasetName: string
  description: string
  email: string
  csvData: string // Base64 encoded CSV content
}

export interface UploadDatasetResult {
  status: 'ok' | 'error'
  datasetId?: string
  datasetName?: string
  rowsInserted?: number
  message?: string
}

export interface DeleteDatasetRequest {
  datasetId: string
  email: string
}

export interface DeleteDatasetResult {
  status: 'ok' | 'error'
  message?: string
  datasetName?: string
}

export interface NavLink {
  id: string
  name: string
  path: string
  order: number
  color?: string // e.g., 'red' for delete
  separator_before?: boolean
}
