import { mcpN8nApi } from './api'
import type {
  Dataset, AIModel, NavLink, ConversationHistory, UserProfile,
  ProfileCompany, ProfileBusinessUnit, ProfileTeam, TemplateProfileAssignment, AdminUser
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
    }
  },

  async updatePasswordHash(recordId: string, passwordHash: string): Promise<void> {
    await mcpN8nApi.patch(`/users/${recordId}`, { password_hash: passwordHash })
  },

  async updateUserTemplateId(recordId: string, templateId: string): Promise<void> {
    await mcpN8nApi.patch(`/users/${recordId}`, { template_id: templateId })
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
      name: r.name,
      provider: r.provider ?? undefined,
      description: r.description ?? undefined,
    }))
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
  async getAccessibleDatasets(email: string, profile: string | undefined): Promise<Dataset[]> {
    const response = await mcpN8nApi.get<Record<string, unknown>[]>('/datasets', {
      params: { email, profile }
    })
    return (response.data || []).map((row) => ({
      id: String(row.id ?? row.dataset_id ?? ''),
      name: String(row.dataset_name ?? row.name ?? ''),
      description: row.description != null ? String(row.description) : undefined,
      owner_email: String(row.owner_email ?? ''),
      created: String(row.created_at ?? row.created ?? ''),
      updated: String(row.updated_at ?? row.updated ?? ''),
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
    }))
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
      created: record.created_at,
    }))
  },

  async updateConversation(id: string, data: { response?: string; prompt?: string }): Promise<void> {
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

  async listAllUsers(): Promise<AdminUser[]> {
    const response = await mcpN8nApi.get<AdminUser[]>('/admin/users')
    return response.data || []
  },

  async createUser(data: {
    user_email: string
    password_hash: string
    profile?: string
    user_timezone?: string
    template_id?: string
  }): Promise<AdminUser> {
    const response = await mcpN8nApi.post<AdminUser>('/admin/users', data)
    return response.data
  },

  async updateUser(id: string, data: {
    password_hash?: string
    profile?: string
    user_timezone?: string
    template_id?: string
  }): Promise<void> {
    await mcpN8nApi.patch(`/users/${id}`, data)
  },

  async deleteUser(id: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/users/${id}`)
  },

  // ── Admin: Companies ────────────────────────────────────────────────────────

  async listCompanies(): Promise<ProfileCompany[]> {
    const response = await mcpN8nApi.get<ProfileCompany[]>('/admin/companies')
    return response.data || []
  },

  async createCompany(name: string): Promise<ProfileCompany> {
    const response = await mcpN8nApi.post<ProfileCompany>('/admin/companies', { name })
    return response.data
  },

  async updateCompany(id: string, name: string): Promise<ProfileCompany> {
    const response = await mcpN8nApi.patch<ProfileCompany>(`/admin/companies/${id}`, { name })
    return response.data
  },

  async deleteCompany(id: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/companies/${id}`)
  },

  // ── Admin: Business Units ───────────────────────────────────────────────────

  async listBusinessUnits(company_code: string): Promise<ProfileBusinessUnit[]> {
    const response = await mcpN8nApi.get<ProfileBusinessUnit[]>('/admin/business-units', { params: { company_code } })
    return response.data || []
  },

  async createBusinessUnit(name: string, company_code: string): Promise<ProfileBusinessUnit> {
    const response = await mcpN8nApi.post<ProfileBusinessUnit>('/admin/business-units', { name, company_code })
    return response.data
  },

  async updateBusinessUnit(id: string, name: string): Promise<ProfileBusinessUnit> {
    const response = await mcpN8nApi.patch<ProfileBusinessUnit>(`/admin/business-units/${id}`, { name })
    return response.data
  },

  async deleteBusinessUnit(id: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/business-units/${id}`)
  },

  // ── Admin: Teams ────────────────────────────────────────────────────────────

  async listTeams(company_code: string, bu_code: string): Promise<ProfileTeam[]> {
    const response = await mcpN8nApi.get<ProfileTeam[]>('/admin/teams', { params: { company_code, bu_code } })
    return response.data || []
  },

  async createTeam(name: string, company_code: string, bu_code: string): Promise<ProfileTeam> {
    const response = await mcpN8nApi.post<ProfileTeam>('/admin/teams', { name, company_code, bu_code })
    return response.data
  },

  async updateTeam(id: string, name: string): Promise<ProfileTeam> {
    const response = await mcpN8nApi.patch<ProfileTeam>(`/admin/teams/${id}`, { name })
    return response.data
  },

  async deleteTeam(id: string): Promise<void> {
    await mcpN8nApi.delete(`/admin/teams/${id}`)
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
}
