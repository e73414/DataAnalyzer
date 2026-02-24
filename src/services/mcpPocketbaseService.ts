import { mcpN8nApi, mcpPocketbaseApi } from './api'
import type { Dataset, AIModel, NavLink, ConversationHistory, UserProfile } from '../types'

interface ListDatasetsResponse {
  status: 'ok' | 'error'
  data?: {
    status: 'ok'
    items: Dataset[]
  }
  items?: Dataset[]
}

interface PocketbaseAIModelRecord {
  id: string
  model_id: string
  name: string
  provider?: string
  description?: string
}

interface ListPocketbaseRecordsResponse {
  status: 'ok' | 'error'
  items?: PocketbaseAIModelRecord[]
  totalItems?: number
}

interface PocketbaseNavLinkRecord {
  id: string
  name: string
  path: string
  order: number
  color?: string
  separator_before?: boolean
}

interface ListNavLinksResponse {
  status: 'ok' | 'error'
  items?: PocketbaseNavLinkRecord[]
  totalItems?: number
}

interface PocketbaseConversationRecord {
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
  created: string
  created_at: string
}

interface ListConversationsResponse {
  status: 'ok' | 'error'
  items?: PocketbaseConversationRecord[]
  totalItems?: number
}

interface CreateRecordResponse {
  status: 'ok' | 'error'
  record?: PocketbaseConversationRecord
}

interface DeleteRecordResponse {
  status: 'ok' | 'error'
  message?: string
}

interface UpdateRecordResponse {
  status: 'ok' | 'error'
  record?: PocketbaseUserProfileRecord
}

interface PocketbaseUserProfileRecord {
  id: string
  user_email: string
  template_id: string
  user_timezone?: string
  password_hash?: string
}

interface ListUserProfileResponse {
  status: 'ok' | 'error'
  items?: PocketbaseUserProfileRecord[]
  totalItems?: number
}

export const pocketbaseService = {
  // Fetch user profile by email to get template_id
  async getUserProfile(email: string): Promise<UserProfile | undefined> {
    const response = await mcpPocketbaseApi.post<ListUserProfileResponse>('/mcp/execute', {
      skill: 'pb-list-records',
      params: {
        collection: 'data_analyzer_user_profile',
        filter: `user_email="${email}"`,
        perPage: 1,
      },
    })
    const items = response.data.items || []
    if (items.length === 0) return undefined
    const record = items[0]
    return {
      id: record.id,
      user_email: record.user_email,
      template_id: record.template_id,
      user_timezone: record.user_timezone,
      password_hash: record.password_hash,
    }
  },

  // Update the password_hash for a user profile
  async updatePasswordHash(recordId: string, passwordHash: string): Promise<void> {
    const response = await mcpPocketbaseApi.post<UpdateRecordResponse>('/mcp/execute', {
      skill: 'pb-update-record',
      params: {
        collection: 'data_analyzer_user_profile',
        id: recordId,
        data: {
          password_hash: passwordHash,
        },
      },
    })
    if (response.data.status === 'error') {
      throw new Error('Failed to update password')
    }
  },

  // Update the template_id for a user profile
  async updateUserTemplateId(recordId: string, templateId: string): Promise<void> {
    const response = await mcpPocketbaseApi.post<UpdateRecordResponse>('/mcp/execute', {
      skill: 'pb-update-record',
      params: {
        collection: 'data_analyzer_user_profile',
        id: recordId,
        data: {
          template_id: templateId,
        },
      },
    })
    if (response.data.status === 'error') {
      throw new Error('Failed to update template')
    }
  },

  // Fetch navigation links from Pocketbase
  async getNavLinks(): Promise<NavLink[]> {
    const response = await mcpPocketbaseApi.post<ListNavLinksResponse>('/mcp/execute', {
      skill: 'pb-list-records',
      params: {
        collection: 'nav_links',
        sort: '+order',
        perPage: 50,
      },
    })
    const items = response.data.items || []
    // Map and sort client-side as fallback
    const navLinks = items.map((record) => ({
      id: record.id,
      name: record.name,
      path: record.path,
      order: record.order,
      color: record.color,
      separator_before: record.separator_before,
    }))
    // Sort by order ascending
    return navLinks.sort((a, b) => a.order - b.order)
  },

  // Fetch AI models directly from Pocketbase
  async getAIModels(): Promise<AIModel[]> {
    const response = await mcpPocketbaseApi.post<ListPocketbaseRecordsResponse>('/mcp/execute', {
      skill: 'pb-list-records',
      params: {
        collection: 'ai_models_v2',
        perPage: 100,
      },
    })
    // Map Pocketbase records to AIModel interface
    const items = response.data.items || []
    return items.map((record) => ({
      id: record.model_id,
      name: record.name,
      provider: record.provider,
      description: record.description,
    }))
  },

  // Fetch datasets from PostgreSQL via n8n webhook
  async getDatasetsByEmail(email: string): Promise<Dataset[]> {
    const response = await mcpN8nApi.post<ListDatasetsResponse>('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: 'webhook/list-datasets',
      },
      input: {
        email,
      },
    })
    // Handle nested response structure from n8n
    const data = response.data.data || response.data
    return data.items || []
  },

  // Save analysis result to PostgreSQL via n8n webhook
  async saveAnalysisResult(data: {
    datasetId: string
    conversation: Array<{ prompt: string; output: string; processUsed?: string }>
    email: string
    aiModel: string
  }): Promise<void> {
    await mcpN8nApi.post('/mcp/execute', {
      skill: 'n8n-webhook',
      params: {
        webhookPath: 'webhook/save-analysis',
      },
      input: {
        datasetId: data.datasetId,
        conversation: data.conversation,
        email: data.email,
        aiModel: data.aiModel,
      },
    })
  },

  // Save a single conversation to Pocketbase
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
    // Always store UTC — timezone conversion happens at display time
    const now = new Date().toISOString()
    const response = await mcpPocketbaseApi.post<CreateRecordResponse>('/mcp/execute', {
      skill: 'pb-create-record',
      params: {
        collection: 'conversation_history',
        data: {
          user_email: data.email,
          prompt: data.prompt,
          response: data.response,
          ai_model: data.aiModel,
          dataset_id: data.datasetId,
          dataset_name: data.datasetName,
          ...(data.durationSeconds != null && { duration_seconds: data.durationSeconds }),
          ...(data.reportPlan != null && { report_plan: data.reportPlan }),
          ...(data.reportId != null && { report_id: data.reportId }),
          created_at: now,
        },
      },
    })
    const record = response.data.record
    if (!record) throw new Error('Failed to save conversation')
    return {
      id: record.id,
      user_email: record.user_email,
      prompt: record.prompt,
      response: record.response,
      ai_model: record.ai_model,
      dataset_id: record.dataset_id,
      dataset_name: record.dataset_name,
      duration_seconds: record.duration_seconds,
      report_plan: record.report_plan,
      report_id: record.report_id,
      created: record.created_at || record.created || now,
    }
  },

  // Fetch conversation history for a user
  async getConversationHistory(email: string): Promise<ConversationHistory[]> {
    const response = await mcpPocketbaseApi.post<ListConversationsResponse>('/mcp/execute', {
      skill: 'pb-list-records',
      params: {
        collection: 'conversation_history',
        filter: `user_email="${email}"`,
        sort: '-created_at,-created',
        perPage: 500,
      },
    })
    const items = response.data.items || []
    return items.map((record) => ({
      id: record.id,
      user_email: record.user_email,
      prompt: record.prompt,
      response: record.response,
      ai_model: record.ai_model,
      dataset_id: record.dataset_id,
      dataset_name: record.dataset_name,
      duration_seconds: record.duration_seconds,
      report_plan: record.report_plan,
      report_id: record.report_id,
      created: record.created_at || record.created || new Date().toISOString(),
    }))
  },

  // Update a conversation record (e.g. edited report HTML)
  async updateConversation(id: string, data: { response?: string; prompt?: string }): Promise<void> {
    const response = await mcpPocketbaseApi.post<UpdateRecordResponse>('/mcp/execute', {
      skill: 'pb-update-record',
      params: {
        collection: 'conversation_history',
        id,
        data,
      },
    })
    if (response.data.status === 'error') {
      throw new Error('Failed to update conversation')
    }
  },

  // Delete a conversation by ID
  async deleteConversation(id: string): Promise<void> {
    await mcpPocketbaseApi.post<DeleteRecordResponse>('/mcp/execute', {
      skill: 'pb-delete-record',
      params: {
        collection: 'conversation_history',
        id,
      },
    })
  },

  // Get unique dataset names from conversation history
  async getHistoryDatasets(email: string): Promise<string[]> {
    const conversations = await this.getConversationHistory(email)
    const uniqueDatasets = [...new Set(conversations.map((c) => c.dataset_name))]
    return uniqueDatasets.sort()
  },
}
