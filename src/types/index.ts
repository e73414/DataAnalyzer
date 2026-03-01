export interface Session {
  email: string
  aiModel: string
  loginTime: number
  profile?: string
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
  dataset_desc?: string
}

export interface UpdateSummaryRequest {
  datasetId: string
  summary: string
  email: string
  datasetDesc?: string
  datasetName?: string
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
  datasetDesc?: string
}

export interface UpdateDatasetResult {
  status: 'ok' | 'error'
  message?: string
  rowsInserted?: number
}

export interface UserProfile {
  id: string
  user_email: string
  template_id: string
  user_timezone?: string
  password_hash?: string
  profile?: string
}

export interface ProfileCompany {
  id: string
  name: string
  code: string
  created_at: string
}

export interface ProfileBusinessUnit {
  id: string
  name: string
  code: string
  company_code: string
  created_at: string
}

export interface ProfileTeam {
  id: string
  name: string
  code: string
  company_code: string
  bu_code: string
  created_at: string
}

export interface TemplateProfileAssignment {
  template_id: string
  profile_code: string | null
  updated_at: string
}

export interface AdminUser {
  id: string
  user_email: string
  password_hash: string | null
  template_id: string | null
  user_timezone: string | null
  profile: string | null
  created_at: string
}

export interface AnalysisRequest {
  email: string
  model: string
  datasetId: string
  prompt: string
  emailResponse?: boolean
  emailSubject?: string
  returnSteps?: boolean
  templateId?: string
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

export interface DatasetPreview {
  columns: string[]
  rows: Record<string, unknown>[]
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
  datasetDesc?: string
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

export interface ConversationHistory {
  id: string
  user_email: string
  prompt: string
  response: string
  ai_model: string
  dataset_id: string
  dataset_name: string
  duration_seconds?: number
  report_plan?: string
  report_id?: string
  created: string // ISO date string from Pocketbase
}

export interface ConversationsByDate {
  date: string // YYYY-MM-DD format
  conversations: ConversationHistory[]
}

export interface ReportPlanQueryStrategy {
  filters: Record<string, string | string[]>
  columns: string[]
  logic: string
  join_on: string
}

export interface ReportPlanStep {
  step_number: number
  dataset_id: string
  purpose: string
  query_strategy: ReportPlanQueryStrategy
  dependencies: number[]
  expected_output: string[]
}

export interface ReportPlan {
  plan_id: string
  total_steps: number
  steps: ReportPlanStep[]
}

export interface PlanReportRequest {
  prompt: string
  email: string
  datasetIds: string[]
  model?: string
}

export interface PlanReportResult {
  status: 'ok' | 'error'
  plan?: ReportPlan
  message?: string
}

export interface ExecutePlanRequest {
  plan: string
  email: string
  model: string
  templateId?: string
  reportId?: string    // pre-generated shared report_id for parallel execution
  stepsOnly?: boolean  // skip formatter after steps complete
}

export interface RunFormatterRequest {
  reportId: string
  email: string
  model?: string
  templateId?: string
}

export interface ExecutePlanResult {
  status: 'ok' | 'error'
  report?: string
  report_id?: string
  total_steps?: number
  message?: string
}

export interface ReportStepProgress {
  step_number: number
  purpose: string
  dataset_id: string
  status: 'started' | 'completed' | 'error'
  step_result?: string
}

export interface CheckReportProgressResult {
  report_id: string
  steps: ReportStepProgress[]
  final_report: string | null
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  error_message?: string | null
}

export interface PromptDialogQuestion {
  id: string
  question: string
  hint: string
}

export interface PromptDialogResult {
  questions: PromptDialogQuestion[]
}

export interface PromptDialogRequest {
  prompt: string
  email: string
  datasetIds: string[]
  model?: string
}

export interface ReportTemplate {
  template_id: string
  title: string
  description: string
  html_content: string
  owner_email: string
  is_public: boolean
}
