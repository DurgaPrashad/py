import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * `npm run dev` serves the Vercel functions in api/ too, with the variables
 * from .env.local, so payments work locally.
 */
function apiFunctions(): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  return {
    name: 'present-api-functions',
    configureServer(server) {
      for (const [k, v] of Object.entries(loadEnv('development', process.cwd(), ''))) process.env[k] ??= v
      server.middlewares.use(async (req, res, next) => {
        const name = /^\/api\/([\w-]+)(?:[/?]|$)/.exec(req.url ?? '')?.[1]
        if (!name || name.startsWith('_')) return next()
        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, (r: Request) => Promise<Response> | Response>
          const handler = mod[req.method ?? 'GET']
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
          const response = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          if (response.body) for await (const chunk of response.body) res.write(chunk)
          res.end()
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// Tauri expects a fixed dev-server port and serves the built files itself.
export default defineConfig({
  // The website uses real paths (/pricing, /present/…), so assets load from
  // the site root. The desktop app loads relative to its bundle. VITE_BASE
  // overrides it for hosting in a sub-folder (e.g. /presenter/).
  base: process.env.VITE_BASE ?? (process.env.TAURI_ENV_PLATFORM ? './' : '/'),
  plugins: [react(), tailwindcss(), apiFunctions()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
