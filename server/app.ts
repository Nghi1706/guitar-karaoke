// Dựng app Hono. Tách khỏi index.ts để test gọi app.request() trực tiếp.

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { adminRoutes } from './admin.ts'
import { authRoutes, loadSession } from './auth.ts'
import { billingRoutes, planOffers } from './billing.ts'
import type { Config } from './config.ts'
import type { DB } from './db.ts'
import { adsRoutes, feedbackRoutes } from './feedback.ts'
import { type AppEnv, type Ctx, type Deps, HttpError, RateLimiter } from './http.ts'
import { seoRoutes } from './seo.ts'
import { usageRoutes } from './usage.ts'

const WEBHOOK_PATH = '/api/billing/payos-webhook'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Chống CSRF: request ghi phải là JSON (form của trang khác không gửi được JSON mà không qua CORS)
// và nếu trình duyệt gửi Origin thì phải cùng nguồn với site.
function checkWriteRequest(c: Ctx) {
  if (!WRITE_METHODS.has(c.req.method) || c.req.path === WEBHOOK_PATH) return
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json'))
    throw new HttpError(400, 'Request phải gửi dạng JSON.')
  const origin = c.req.header('origin')
  if (!origin) return
  const { config } = c.get('deps')
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new HttpError(403, 'Nguồn request không hợp lệ.')
  }
  const host = (config.trustProxy && c.req.header('x-forwarded-host')) || c.req.header('host')
  const sameHost = url.host === host
  const sameSite = url.origin === new URL(config.siteUrl).origin
  const localDev = !config.production && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (!sameHost && !sameSite && !localDev) throw new HttpError(403, 'Nguồn request không hợp lệ.')
}

export interface AppOptions {
  db: DB
  config: Config
  fetch?: typeof fetch
  now?: () => Date
}

export function createApp(opts: AppOptions) {
  const deps: Deps = {
    db: opts.db,
    config: opts.config,
    fetch: opts.fetch ?? fetch,
    now: opts.now ?? (() => new Date()),
    limiter: new RateLimiter(),
  }
  const app = new Hono<AppEnv>()

  app.use('*', secureHeaders({ referrerPolicy: 'strict-origin-when-cross-origin' }))
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    checkWriteRequest(c)
    await next()
  })
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.')
      },
    }),
  )
  app.use('/api/*', loadSession)

  app.route('/api/auth', authRoutes())
  app.get('/api/plans', (c) => c.json({ plans: planOffers(deps.config) }))
  app.route('/api/billing', billingRoutes())
  app.route('/api/feedback', feedbackRoutes())
  app.route('/api/ads', adsRoutes())
  app.route('/api/usage', usageRoutes())
  app.route('/api/admin', adminRoutes())
  app.all('/api/*', () => {
    throw new HttpError(404, 'Không tìm thấy API này.')
  })
  app.route('/', seoRoutes(deps.now()))

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Máy chủ gặp lỗi, bạn thử lại sau ít phút.' }, 500)
  })

  return app
}
