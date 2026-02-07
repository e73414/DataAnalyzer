import { mcpN8nApi, mcpPocketbaseApi } from './api'
import type { Dataset, AIModel, NavLink } from '../types'

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

export const pocketbaseService = {
  // Fetch navigation links from Pocketbase
  async getNavLinks(): Promise<NavLink[]> {
    const response = await mcpPocketbaseApi.post<ListNavLinksResponse>('/mcp/execute', {
      skill: 'pb-list-records',
      params: {
        collection: 'nav_links',
        sort: 'order',
        perPage: 50,
      },
    })
    const items = response.data.items || []
    return items.map((record) => ({
      id: record.id,
      name: record.name,
      path: record.path,
      order: record.order,
      color: record.color,
      separator_before: record.separator_before,
    }))
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
}
