/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MCP_N8N_URL: string
  readonly VITE_MCP_POCKETBASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
