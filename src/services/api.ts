import axios from 'axios'

// Use Vite proxy paths to avoid CORS issues
// In development: /mcp-n8n proxies to http://localhost:3000
// In production: set VITE_MCP_N8N_URL to the actual URL
const MCP_N8N_BASE_URL = import.meta.env.VITE_MCP_N8N_URL || '/mcp-n8n'
const MCP_POCKETBASE_BASE_URL = import.meta.env.VITE_MCP_POCKETBASE_URL || '/mcp-pocketbase'

export const mcpN8nApi = axios.create({
  baseURL: MCP_N8N_BASE_URL,
  timeout: 300000, // 5 minutes for AI processing
  headers: { 'Content-Type': 'application/json' },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
})

export const mcpPocketbaseApi = axios.create({
  baseURL: MCP_POCKETBASE_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Add response interceptor for better error handling
mcpN8nApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Unknown error'
    if (error.response?.status === 408 || error.code === 'ECONNABORTED') {
      throw new Error('Analysis timed out. Please try again.')
    }
    if (error.response?.status === 503) {
      throw new Error('n8n service is currently unavailable. Please try again later.')
    }
    throw new Error(message)
  }
)

mcpPocketbaseApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Unknown error'
    throw new Error(message)
  }
)
