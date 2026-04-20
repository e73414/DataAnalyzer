import { mcpAnswersApi } from './api'
import type { McpAnswersQueryRequest, McpAnswersQueryResult } from '../types'

export const mcpAnswersService = {
  async query(params: McpAnswersQueryRequest): Promise<McpAnswersQueryResult> {
    const res = await mcpAnswersApi.post<McpAnswersQueryResult>('/query', params)
    return res.data
  },
}
