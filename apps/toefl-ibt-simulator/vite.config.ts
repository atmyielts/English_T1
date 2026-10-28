import { pagesAssetOutput } from '../../scripts/pages-asset-policy.mjs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

// TOEFL 2026 audio lives in content/toefl-2026/audio (generated offline with Piper).
// Serve it at /media/toefl-2026/ in dev and copy it into the Pages build so it ships with CI.
const toefl2026Audio = (): Plugin => {
  const source = path.join(repoRoot, 'content', 'toefl-2026', 'audio')
  const prefix = '/media/toefl-2026/'
  return {
    name: 'toefl-2026-audio',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith(prefix)) return next()
        const file = path.join(source, path.basename(url))
        if (!file.endsWith('.mp3') || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'audio/mpeg')
        fs.createReadStream(file).pipe(res)
      })
    },
    writeBundle(options) {
      if (!fs.existsSync(source)) return
      const target = path.join(options.dir ?? path.join(__dirname, 'dist'), 'media', 'toefl-2026')
      fs.mkdirSync(target, { recursive: true })
      for (const name of fs.readdirSync(source)) {
        if (name.endsWith('.mp3')) fs.copyFileSync(path.join(source, name), path.join(target, name))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), toefl2026Audio()],
  build: {
    rollupOptions: { output: pagesAssetOutput(new URL('./public/_headers', import.meta.url)) },
  },
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
    port: 5177,
    strictPort: true,
  },
})
