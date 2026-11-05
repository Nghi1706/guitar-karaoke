// Góp ý / báo lỗi từ người dùng (không cần đăng nhập) và ghi nhận quảng cáo.

import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { FeedbackItem, FeedbackType } from '../shared/api.ts'
import { type AppEnv, HttpError, email, oneOf, optStr, rateLimit, readJson, str } from './http.ts'

export const FEEDBACK_TYPES: readonly FeedbackType[] = ['feedback', 'bug', 'song', 'other']
export const FEEDBACK_STATUSES = ['open', 'in_progress', 'resolved'] as const
const AD_EVENTS = ['shown', 'completed', 'skipped', 'upgrade_click'] as const

export interface FeedbackRow {
  id: string
  type: string
  message: string
  email: string | null
  user_id: string | null
  user_email: string | null
  page: string | null
  status: string
  admin_note: string | null
  created_at: string
}

export function toFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    type: FEEDBACK_TYPES.find((t) => t === row.type) ?? 'other',
    message: row.message,
    email: row.email,
    userId: row.user_id,
    userEmail: row.user_email,
    page: row.page,
    status: FEEDBACK_STATUSES.find((s) => s === row.status) ?? 'open',
    adminNote: row.admin_note,
    createdAt: row.created_at,
  }
}

const MINUTE = 60_000

export function feedbackRoutes() {
  const r = new Hono<AppEnv>()

  r.post('/', async (c) => {
    rateLimit(c, 'feedback', 10, 10 * MINUTE)
    const body = await readJson(c)
    const type = oneOf(body.type, FEEDBACK_TYPES, 'Loại góp ý')
    const message = str(body.message, 'Nội dung', 5, 2000)
    const mail = body.email === undefined || body.email === null || body.email === '' ? null : email(body.email)
    const page = optStr(body.page, 'Trang', 200)
    const { db, now } = c.get('deps')
    db.prepare(
      'INSERT INTO feedback (id, type, message, email, user_id, page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(randomUUID(), type, message, mail, c.get('user')?.id ?? null, page, now().toISOString())
    return c.json({ ok: true }, 201)
  })

  return r
}

export function adsRoutes() {
  const r = new Hono<AppEnv>()

  r.post('/event', async (c) => {
    rateLimit(c, 'ads', 120, 10 * MINUTE)
    const body = await readJson(c)
    const placement = str(body.placement, 'Vị trí quảng cáo', 1, 40)
    if (!/^[\w-]+$/.test(placement)) throw new HttpError(400, 'Vị trí quảng cáo không hợp lệ.')
    const event = oneOf(body.event, AD_EVENTS, 'Sự kiện')
    const { db, now } = c.get('deps')
    db.prepare('INSERT INTO ad_events (placement, event, user_id, created_at) VALUES (?, ?, ?, ?)').run(
      placement,
      event,
      c.get('user')?.id ?? null,
      now().toISOString(),
    )
    return c.json({ ok: true }, 201)
  })

  return r
}
