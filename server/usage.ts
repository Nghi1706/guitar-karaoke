// Ghi nhận lượt dùng ẩn danh (mở app, hát, soạn, lưu bài) để đếm số người dùng.
// Không nhận lời bài hát hay thông tin cá nhân, chỉ mã ngẫu nhiên của trình duyệt và tên sự kiện.

import { Hono } from 'hono'
import type { UsageEvent } from '../shared/api.ts'
import { type AppEnv, HttpError, oneOf, rateLimit, readJson, str } from './http.ts'

export const USAGE_EVENTS: readonly UsageEvent[] = ['open', 'play', 'finish', 'compose', 'save']

const MINUTE = 60_000

export function usageRoutes() {
  const r = new Hono<AppEnv>()

  r.post('/event', async (c) => {
    rateLimit(c, 'usage', 300, 10 * MINUTE)
    const body = await readJson(c)
    const clientId = str(body.clientId, 'Mã trình duyệt', 8, 64)
    if (!/^[\w-]+$/.test(clientId)) throw new HttpError(400, 'Mã trình duyệt không hợp lệ.')
    const event = oneOf(body.event, USAGE_EVENTS, 'Sự kiện')
    const { db, now } = c.get('deps')
    db.prepare('INSERT INTO usage_events (client_id, event, created_at) VALUES (?, ?, ?)').run(
      clientId,
      event,
      now().toISOString(),
    )
    return c.json({ ok: true }, 201)
  })

  return r
}
