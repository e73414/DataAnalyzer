import { mcpAnswersApi } from './api'
import type { McpAnswersQueryRequest, McpAnswersQueryResult } from '../types'

const MCP_ANSWERS_BASE_URL = import.meta.env.VITE_MCP_ANSWERS_URL || '/mcp-answers'

export const mcpAnswersService = {
  async query(params: McpAnswersQueryRequest, signal?: AbortSignal): Promise<McpAnswersQueryResult> {
    const res = await mcpAnswersApi.post<McpAnswersQueryResult>('/query', params, { signal })
    return res.data
  },

  async queryStream(
    params: McpAnswersQueryRequest,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<McpAnswersQueryResult> {
    const response = await fetch(`${MCP_ANSWERS_BASE_URL}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(err.error || response.statusText)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let result: McpAnswersQueryResult | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        let event: Record<string, unknown>
        try { event = JSON.parse(line.slice(6)) } catch { continue }

        if (event.type === 'token') {
          onToken(event.content as string)
        } else if (event.type === 'done') {
          const { type: _t, ...rest } = event
          result = rest as unknown as McpAnswersQueryResult
        } else if (event.type === 'error') {
          throw new Error(event.message as string)
        }
      }
    }

    if (!result) throw new Error('Stream ended without result')
    return result
  },
}
