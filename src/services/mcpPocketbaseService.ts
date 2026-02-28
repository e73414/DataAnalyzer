import { mcpN8nApi } from './api'
import type { Dataset, AIModel, NavLink, ConversationHistory, UserProfile } from '../types'

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
}
