export const AI_MODELS = [
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2' },
  { id: 'minimax/minimax-m2.1', name: 'MiniMax M2.1' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
] as const

export type AIModelId = (typeof AI_MODELS)[number]['id']
