import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/mcp-n8n': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-n8n/, ''),
        timeout: 300000,  // 5 minutes for AI processing
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Remove content-length to allow streaming
            proxyReq.removeHeader('content-length');
          });
        }
      },
      '/mcp-pocketbase': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-pocketbase/, '')
      }
    }
  }
})
