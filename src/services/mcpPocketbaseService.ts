import { mcpN8nApi } from './api'
import type {
  Dataset, AIModel, NavLink, ConversationHistory, UserProfile,
  ProfileCompany, ProfileBusinessUnit, ProfileTeam, TemplateProfileAssignment, AdminUser, AppSettings,
  SavedQuestion, IngestionConfig, IngestionSchedule, IngestionFile, GoogleTokenStatus, MicrosoftTokenStatus, DriveFile
} from '../types'

// ── Types for Postgres REST responses ─────────────────────────────────────────

interface ListDatasetsResponse {
  status: 'ok' | 'error'
  data?: { status: 'ok'; items: Dataset[] }
  items?: Dataset[]
}

interface PgUser {
  id: string
  user_email: string
  password_hash: string | null
  template_id: string | null
  user_timezone: string | null
  profile: string | null
  profiles: string[]
}

interface PgConversation {
  id: string
  user_email: string
  prompt: string
  response: string
  ai_model: string
  dataset_id: string
  dataset_name: string
  duration_seconds: number | null
  report_plan: string | null
  report_id: string | null
  detail_level: string | null
  report_detail: string | null
  created_at: string
}

interface PgNavLink {
  id: string
  name: string
  path: string
  order: number
  color: string | null
  separator_before: boolean
}

interface PgAiModel {
  id: string
  model_id: string
  name: string
  provider: string | null
  description: string | null
  display_order: number
}

// ── Service ───────────────────────────────────────────────────────────────────

export const pocketbaseService = {
  async getUserProfile(email: string): Promise<UserProfile | undefined> {
    const response = await mcpN8nApi.get<PgUser | null>('/users', { params: { email } })
    const record = response.data
    if (!record) return undefined
    return {
      id: record.id,
      user_email: record.user_email,
      template_id: record.template_id ?? '',
      user_timezone: record.user_timezone ?? undefined,
      password_hash: record.password_hash ?? undefined,
      profile: record.profile ?? undefined,
      profiles: record.profiles ?? [],
    }
  },

  async updatePasswordHash(recordId: string, passwordHash: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.patch(`/users/${recordId}`, { password_hash: passwordHash, actor_email: actorEmail })
  },

  async updateUserTemplateId(recordId: string, templateId: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.patch(`/users/${recordId}`, { template_id: templateId, actor_email: actorEmail })
  },

  async getNavLinks(): Promise<NavLink[]> {
    const response = await mcpN8nApi.get<PgNavLink[]>('/nav-links')
    return (response.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      order: r.order,
      color: r.color ?? undefined,
      separator_before: r.separator_before,
    }))
  },

  async getAIModels(): Promise<AIModel[]> {
    const response = await mcpN8nApi.get<PgAiModel[]>('/ai-models')
    return (response.data || []).map((r) => ({
      id: r.model_id,
      db_id: r.id,
      name: r.name,
      provider: r.provider ?? undefined,
      description: r.description ?? undefined,
      display_order: r.display_order ?? 0,
    }))
  },

  async createNavLink(data: { name: string; path: string; order?: number; color?: string; separator_before?: boolean }, actorEmail: string): Promise<NavLink> {
    const response = await mcpN8nApi.post<NavLink>('/nav-links', { ...data, actor_email: actorEmail })
    return response.data
  },

  async updateNavLink(id: string, data: Partial<{ name: string; path: string; order: number; color: string | null; separator_before: boolean }>, actorEmail: string): Promise<NavLink> {
    const response = await mcpN8nApi.patch<NavLink>(`/nav-links/${encodeURIComponent(id)}`, { ...data, actor_email: actorEmail })
    return response.data
  },

  async deleteNavLink(id: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/nav-links/${encodeURIComponent(id)}`, { data: { actor_email: actorEmail } })
  },

  async createAIModel(data: { model_id: string; name: string; provider?: string; description?: string; display_order?: number }, actorEmail: string): Promise<AIModel> {
    const response = await mcpN8nApi.post<PgAiModel>('/ai-models', { ...data, actor_email: actorEmail })
    return { id: response.data.model_id, db_id: response.data.id, name: response.data.name, provider: response.data.provider ?? undefined, description: response.data.description ?? undefined, display_order: response.data.display_order ?? 0 }
  },

  async updateAIModel(dbId: string, data: Partial<{ model_id: string; name: string; provider: string | null; description: string | null; display_order: number }>, actorEmail: string): Promise<AIModel> {
    const response = await mcpN8nApi.patch<PgAiModel>(`/ai-models/${encodeURIComponent(dbId)}`, { ...data, actor_email: actorEmail })
    return { id: response.data.model_id, db_id: response.data.id, name: response.data.name, provider: response.data.provider ?? undefined, description: response.data.description ?? undefined, display_order: response.data.display_order ?? 0 }
  },

  async deleteAIModel(dbId: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/ai-models/${encodeURIComponent(dbId)}`, { data: { actor_email: actorEmail } })
  },

  // Fetch datasets from PostgreSQL via n8n webhook (unchanged)
  async getDatasetsByEmail(email: string): Promise<Dataset[]> {
    const response = await mcpN8nApi.post<ListDatasetsResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: { webhookPath: 'webhook/list-datasets' },
      input: { email },
    })
    const data = response.data.data || response.data
    return data.items || []
  },

  // Fetch datasets accessible to a specific user (server-side profile/email filtering).
  // Profile is resolved server-side — do NOT pass profile params.
  async getAccessibleDatasets(email: string): Promise<Dataset[]> {
    const response = await mcpN8nApi.get<Record<string, unknown>[]>('/datasets', {
      params: { email }
    })
    return (response.data || []).map((row) => ({
      id: String(row.id ?? row.dataset_id ?? ''),
      name: String(row.dataset_name ?? row.name ?? ''),
      description: row.description != null ? String(row.description) : undefined,
      owner_email: String(row.owner_email ?? ''),
      created: String(row.created_at ?? row.created ?? ''),
      updated: String(row.updated_at ?? row.updated ?? ''),
      profile_code: row.profile_code != null ? String(row.profile_code) : null,
      row_count: row.row_count != null ? Number(row.row_count) : undefined,
      column_count: Array.isArray(row.dataset_headers) ? (row.dataset_headers as unknown[]).length : undefined,
    }))
  },

  // Fetch ALL datasets directly from postgres (all owners).
  // Used by admin Dataset Access Manager. Column names mapped flexibly.
  async getAllDatasets(): Promise<Dataset[]> {
    const response = await mcpN8nApi.get<Record<string, unknown>[]>('/datasets/all')
    return (response.data || []).map((row) => ({
      id: String(row.id ?? row.dataset_id ?? ''),
      name: String(row.name ?? row.dataset_name ?? ''),
      description: row.description != null ? String(row.description) : undefined,
      owner_email: String(row.owner_email ?? ''),
      created: String(row.created ?? row.created_at ?? ''),
      updated: String(row.updated ?? row.updated_at ?? ''),
      row_count: row.row_count != null ? Number(row.row_count) : undefined,
      column_count: Array.isArray(row.dataset_headers) ? (row.dataset_headers as unknown[]).length : undefined,
    }))
  },

  async getSampleQuestions(datasetId: string): Promise<{ id: string; question: string }[]> {
    const response = await mcpN8nApi.get<{
      sample_questions?: { questions: { id: string; question: string }[] } | null
    }>(`/datasets/${encodeURIComponent(datasetId)}`)
    return response.data.sample_questions?.questions ?? []
  },

  async updateSampleQuestions(
    datasetId: string,
    questions: { id: string; question: string }[]
  ): Promise<void> {
    await mcpN8nApi.patch(`/datasets/${datasetId}/sample-questions`, {
      sample_questions: { questions },
    })
  },

  // Save analysis result to PostgreSQL via n8n webhook (unchanged)
  async saveAnalysisResult(data: {
    datasetId: string
    conversation: Array<{ prompt: string; output: string; processUsed?: string }>
    email: string
    aiModel: string
  }): Promise<void> {
    await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: { webhookPath: 'webhook/save-analysis' },
      input: {
        datasetId: data.datasetId,
        conversation: data.conversation,
        email: data.email,
        aiModel: data.aiModel,
      },
    })
  },

  async saveConversation(data: {
    email: string
    prompt: string
    response: string
    aiModel: string
    datasetId: string
    datasetName: string
    durationSeconds?: number
    reportPlan?: string
    reportId?: string
    detailLevel?: string
    reportDetail?: string
  }): Promise<ConversationHistory> {
    const now = new Date().toISOString()
    const response = await mcpN8nApi.post<PgConversation>('/conversations', {
      user_email: data.email,
      prompt: data.prompt,
      response: data.response,
      ai_model: data.aiModel,
      dataset_id: data.datasetId,
      dataset_name: data.datasetName,
      duration_seconds: data.durationSeconds ?? null,
      report_plan: data.reportPlan ?? null,
      report_id: data.reportId ?? null,
      detail_level: data.detailLevel ?? null,
      report_detail: data.reportDetail ?? null,
      created_at: now,
    })
    const record = response.data
    return {
      id: record.id,
      user_email: record.user_email,
      prompt: record.prompt,
      response: record.response,
      ai_model: record.ai_model,
      dataset_id: record.dataset_id,
      dataset_name: record.dataset_name,
      duration_seconds: record.duration_seconds ?? undefined,
      report_plan: record.report_plan ?? undefined,
      report_id: record.report_id ?? undefined,
      detail_level: record.detail_level ?? undefined,
      report_detail: record.report_detail ?? undefined,
      created: record.created_at,
    }
  },

  async getConversationHistory(email: string): Promise<ConversationHistory[]> {
    const response = await mcpN8nApi.get<PgConversation[]>('/conversations', { params: { email } })
    return (response.data || []).map((record) => ({
      id: record.id,
      user_email: record.user_email,
      prompt: record.prompt,
      response: record.response,
      ai_model: record.ai_model,
      dataset_id: record.dataset_id,
      dataset_name: record.dataset_name,
      duration_seconds: record.duration_seconds ?? undefined,
      report_plan: record.report_plan ?? undefined,
      report_id: record.report_id ?? undefined,
      detail_level: record.detail_level ?? undefined,
      report_detail: record.report_detail ?? undefined,
      created: record.created_at,
    }))
  },

  async updateConversation(id: string, data: { response?: string; prompt?: string; report_plan?: string }): Promise<void> {
    await mcpN8nApi.patch(`/conversations/${id}`, data)
  },

  async deleteConversation(id: string): Promise<void> {
    await mcpN8nApi.delete(`/conversations/${id}`)
  },

  async getHistoryDatasets(email: string): Promise<string[]> {
    const conversations = await this.getConversationHistory(email)
    const uniqueDatasets = [...new Set(conversations.map((c) => c.dataset_name))]
    return uniqueDatasets.sort()
  },

  // ── Admin: Users ────────────────────────────────────────────────────────────

  async listAllUsers(actorEmail: string): Promise<AdminUser[]> {
    const response = await mcpN8nApi.get<AdminUser[]>('/admin/users', { params: { actor_email: actorEmail } })
    return response.data || []
  },

  async createUser(data: {
    user_email: string
    password_hash: string
    profile?: string
    profiles?: string[]
    user_timezone?: string
    template_id?: string
  }, actorEmail: string): Promise<AdminUser> {
    const response = await mcpN8nApi.post<AdminUser>('/admin/users', { ...data, actor_email: actorEmail })
    return response.data
  },

  async updateUser(id: string, data: {
    user_email?: string
    password_hash?: string
    profile?: string
    profiles?: string[]
    user_timezone?: string
    template_id?: string
  }, actorEmail: string): Promise<void> {
    await mcpN8nApi.patch(`/users/${id}`, { ...data, actor_email: actorEmail })
  },

  async deleteUser(id: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/users/${id}`, { data: { actor_email: actorEmail } })
  },

  // ── Admin: Companies ────────────────────────────────────────────────────────

  async listCompanies(): Promise<ProfileCompany[]> {
    const response = await mcpN8nApi.get<ProfileCompany[]>('/admin/companies')
    return response.data || []
  },

  async createCompany(name: string, actorEmail: string): Promise<ProfileCompany> {
    const response = await mcpN8nApi.post<ProfileCompany>('/admin/companies', { name, actor_email: actorEmail })
    return response.data
  },

  async updateCompany(id: string, name: string, actorEmail: string): Promise<ProfileCompany> {
    const response = await mcpN8nApi.patch<ProfileCompany>(`/admin/companies/${id}`, { name, actor_email: actorEmail })
    return response.data
  },

  async deleteCompany(id: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/companies/${id}`, { data: { actor_email: actorEmail } })
  },

  // ── Admin: Business Units ───────────────────────────────────────────────────

  async listBusinessUnits(company_code: string): Promise<ProfileBusinessUnit[]> {
    const response = await mcpN8nApi.get<ProfileBusinessUnit[]>('/admin/business-units', { params: { company_code } })
    return response.data || []
  },

  async createBusinessUnit(name: string, company_code: string, actorEmail: string): Promise<ProfileBusinessUnit> {
    const response = await mcpN8nApi.post<ProfileBusinessUnit>('/admin/business-units', { name, company_code, actor_email: actorEmail })
    return response.data
  },

  async updateBusinessUnit(id: string, name: string, actorEmail: string): Promise<ProfileBusinessUnit> {
    const response = await mcpN8nApi.patch<ProfileBusinessUnit>(`/admin/business-units/${id}`, { name, actor_email: actorEmail })
    return response.data
  },

  async deleteBusinessUnit(id: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/business-units/${id}`, { data: { actor_email: actorEmail } })
  },

  // ── Admin: Teams ────────────────────────────────────────────────────────────

  async listTeams(company_code: string, bu_code: string): Promise<ProfileTeam[]> {
    const response = await mcpN8nApi.get<ProfileTeam[]>('/admin/teams', { params: { company_code, bu_code } })
    return response.data || []
  },

  async createTeam(name: string, company_code: string, bu_code: string, actorEmail: string): Promise<ProfileTeam> {
    const response = await mcpN8nApi.post<ProfileTeam>('/admin/teams', { name, company_code, bu_code, actor_email: actorEmail })
    return response.data
  },

  async updateTeam(id: string, name: string, actorEmail: string): Promise<ProfileTeam> {
    const response = await mcpN8nApi.patch<ProfileTeam>(`/admin/teams/${id}`, { name, actor_email: actorEmail })
    return response.data
  },

  async deleteTeam(id: string, actorEmail: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/teams/${id}`, { data: { actor_email: actorEmail } })
  },

  // ── Admin: Template Profiles ────────────────────────────────────────────────

  async listTemplateProfiles(): Promise<TemplateProfileAssignment[]> {
    const response = await mcpN8nApi.get<TemplateProfileAssignment[]>('/admin/template-profiles')
    return response.data || []
  },

  async setTemplateProfile(template_id: string, profile_code: string | null): Promise<TemplateProfileAssignment> {
    const response = await mcpN8nApi.put<TemplateProfileAssignment>(
      `/admin/template-profiles/${encodeURIComponent(template_id)}`,
      { profile_code }
    )
    return response.data
  },

  async updateDatasetOwner(datasetId: string, ownerEmail: string): Promise<void> {
    await mcpN8nApi.patch(`/datasets/${encodeURIComponent(datasetId)}`, { owner_email: ownerEmail })
  },

  // ── App Settings ─────────────────────────────────────────────────────────────

  async getAppSettings(): Promise<AppSettings> {
    const response = await mcpN8nApi.get<Record<string, string | null>>('/app-settings')
    const d = response.data ?? {}
    return {
      analyze_model:            d.analyze_model            ?? null,
      plan_model:               d.plan_model               ?? null,
      execute_model:            d.execute_model            ?? null,
      upload_model:             d.upload_model             ?? null,
      report_model:             d.report_model             ?? null,
      chunk_threshold:          d.chunk_threshold          ?? null,
      detail_level:             d.detail_level             ?? null,
      report_detail:            d.report_detail            ?? null,
      show_ingestion_schedule:  d.show_ingestion_schedule  ?? null,
    }
  },

  async updateAppSetting(key: string, value: string | null): Promise<void> {
    await mcpN8nApi.put(`/app-settings/${encodeURIComponent(key)}`, { value })
  },

  // ── Saved Questions ──────────────────────────────────────────────────────────

  async createSavedQuestion(data: Omit<SavedQuestion, 'id' | 'created_at' | 'updated_at'>): Promise<SavedQuestion> {
    const response = await mcpN8nApi.post<SavedQuestion>('/saved-questions', data)
    return response.data
  },

  async browseSavedQuestions(email: string): Promise<import('../types').BrowsableQuestion[]> {
    const response = await mcpN8nApi.get<import('../types').BrowsableQuestion[]>('/saved-questions/browse', {
      params: { email }
    })
    return response.data || []
  },

  async getSavedQuestions(email: string, all?: boolean): Promise<SavedQuestion[]> {
    const response = await mcpN8nApi.get<SavedQuestion[]>('/saved-questions', {
      params: { email, ...(all ? { all: 'true' } : {}) }
    })
    return response.data || []
  },

  async getSavedQuestion(id: string): Promise<SavedQuestion> {
    const response = await mcpN8nApi.get<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}`)
    return response.data
  },

  async updateSavedQuestion(id: string, data: { prompt?: string; editable?: boolean; audience?: string[] }): Promise<SavedQuestion> {
    const response = await mcpN8nApi.patch<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}`, data)
    return response.data
  },

  async deleteSavedQuestion(id: string): Promise<void> {
    await mcpN8nApi.delete(`/saved-questions/${encodeURIComponent(id)}`)
  },

  async searchUsers(q: string): Promise<string[]> {
    const response = await mcpN8nApi.get<string[]>('/users/search', { params: { q } })
    return response.data || []
  },

  // ── Ingestion Pipeline ──────────────────────────────────────────────────────

  async saveIngestionConfig(payload: Omit<IngestionConfig, 'created_at' | 'updated_at'>): Promise<void> {
    await mcpN8nApi.post('/ingestion/config', payload)
  },

  async getIngestionConfig(datasetId: string): Promise<IngestionConfig | null> {
    const response = await mcpN8nApi.get<IngestionConfig | null>(`/ingestion/config/${encodeURIComponent(datasetId)}`)
    return response.data
  },

  async getIngestionSchedule(datasetId: string): Promise<IngestionSchedule | null> {
    const response = await mcpN8nApi.get<IngestionSchedule | null>(`/ingestion/schedule/${encodeURIComponent(datasetId)}`)
    return response.data
  },

  async saveIngestionSchedule(
    payload: { dataset_id: string; owner_email: string; folder_id: string; schedule?: string | null; enabled?: boolean }
  ): Promise<IngestionSchedule> {
    const response = await mcpN8nApi.post<IngestionSchedule>('/ingestion/schedule', payload)
    return response.data
  },

  async updateIngestionSchedule(
    datasetId: string,
    payload: { folder_id?: string; schedule?: string | null; enabled?: boolean }
  ): Promise<IngestionSchedule> {
    const response = await mcpN8nApi.patch<IngestionSchedule>(`/ingestion/schedule/${encodeURIComponent(datasetId)}`, payload)
    return response.data
  },

  async deleteIngestionSchedule(datasetId: string): Promise<void> {
    await mcpN8nApi.delete(`/ingestion/schedule/${encodeURIComponent(datasetId)}`)
  },

  async runIngestionNow(datasetId: string, email: string): Promise<{ status: string; message?: string }> {
    const response = await mcpN8nApi.post(`/ingestion/run/${encodeURIComponent(datasetId)}`, { email })
    return response.data
  },

  async getIngestionFiles(datasetId: string): Promise<IngestionFile[]> {
    const response = await mcpN8nApi.get<IngestionFile[]>(`/ingestion/files/${encodeURIComponent(datasetId)}`)
    return response.data || []
  },

  async getGoogleAuthUrl(email: string): Promise<string> {
    const response = await mcpN8nApi.get<{ url: string }>('/google/auth-url', { params: { email } })
    return response.data.url
  },

  async getGoogleTokenStatus(email: string): Promise<GoogleTokenStatus> {
    const response = await mcpN8nApi.get<GoogleTokenStatus>('/google/token-status', { params: { email } })
    return response.data
  },

  async disconnectGoogle(email: string): Promise<void> {
    await mcpN8nApi.delete('/google/disconnect', { params: { email } })
  },

  async listDriveFiles(email: string, folderId: string): Promise<DriveFile[]> {
    const response = await mcpN8nApi.get<DriveFile[]>('/google/drive/files', {
      params: { email, folder_id: folderId },
    })
    return response.data || []
  },

  // ── Microsoft OneDrive OAuth ──────────────────────────────────────────────

  async getMicrosoftAuthUrl(email: string): Promise<string> {
    const response = await mcpN8nApi.get<{ url: string }>('/microsoft/auth-url', { params: { email } })
    return response.data.url
  },

  async getMicrosoftTokenStatus(email: string): Promise<MicrosoftTokenStatus> {
    const response = await mcpN8nApi.get<MicrosoftTokenStatus>('/microsoft/token-status', { params: { email } })
    return response.data
  },

  async disconnectMicrosoft(email: string): Promise<void> {
    await mcpN8nApi.delete('/microsoft/disconnect', { params: { email } })
  },

  async listOneDriveFiles(email: string, folderId: string): Promise<DriveFile[]> {
    const response = await mcpN8nApi.get<DriveFile[]>('/microsoft/onedrive/files', {
      params: { email, folder_id: folderId },
    })
    return response.data || []
  },
}
