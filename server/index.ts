// Khởi động server: `npm run server` (phát triển) hoặc `npm start` (production, phục vụ luôn bản build trong dist/).

import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context, Hono } from 'hono'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db.ts'
import type { AppEnv } from './http.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
const config = loadConfig()
if (config.production) process.env.NODE_ENV = 'production'

const db = openDb(config.dbPath)
const app = createApp({ db, config })

// Bản build của web: file trong assets/ có hash nên cache lâu, file html luôn hỏi lại server
function mountStatic(app: Hono<AppEnv>, distDir: string) {
  const root = relative(process.cwd(), distDir) || '.'
  app.use(
    '*',
    serveStatic({
      root,
      onFound: (path, c) => {
        if (/[\\/]assets[\\/]/.test(path)) c.header('Cache-Control', 'public, max-age=31536000, immutable')
        else if (path.endsWith('.html')) c.header('Cache-Control', 'no-cache')
        else c.header('Cache-Control', 'public, max-age=86400')
      },
    }),
  )
  const appHtml = join(distDir, 'app', 'index.html')
  const serveApp = (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(readFileSync(appHtml, 'utf8'))
  }
  app.get('/app', serveApp)
  app.get('/app/*', serveApp)
}

if (config.production) {
  const dist = resolve(import.meta.dirname, '..', 'dist')
  if (!existsSync(join(dist, 'app', 'index.html')))
    console.warn('Chưa có bản build web trong dist/. Chạy `npm run build` trước `npm start`.')
  mountStatic(app, dist)
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Server chạy ở http://localhost:${info.port} (${config.production ? 'production' : 'phát triển'})`)
  if (!config.payos)
    console.log(
      config.production
        ? 'Chưa cấu hình PayOS: người dùng chưa nâng cấp được Premium.'
        : 'Chưa cấu hình PayOS: thanh toán chạy chế độ giả lập.',
    )
})

const shutdown = () => {
  server.close()
  db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
