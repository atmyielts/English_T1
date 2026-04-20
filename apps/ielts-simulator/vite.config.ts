import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, __dirname, ''),
    ...process.env,
  }
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !String(env[key] ?? '').trim())

  if (missing.length > 0) {
    throw new Error(
      `Missing required IELTS simulator env: ${missing.join(', ')}. Set them before running Vite so production builds do not publish a broken bundle.`,
    )
  }

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
      alias: {
        react: path.resolve(repoRoot, 'node_modules/react'),
        'react-dom': path.resolve(repoRoot, 'node_modules/react-dom'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
