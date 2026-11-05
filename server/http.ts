// Kiểu dùng chung cho các route, đọc body, kiểm tra dữ liệu và giới hạn tần suất.

import type { Context } from 'hono'
import type { Config } from './config.ts'
import type { DB } from './db.ts'

export interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string
  role: string
  status: string
  premium_until: string | null
  created_at: string
}

export interface Deps {
  db: DB
  config: Config
  fetch: typeof fetch // cho phép test thay bằng fetch giả khi gọi PayOS
  now: () => Date
  limiter: RateLimiter
}

export type AppEnv = { Variables: { user: UserRow | null; deps: Deps } }
export type Ctx = Context<AppEnv>

// Lỗi trả về cho client: message là câu tiếng Việt hiển thị được luôn
export class HttpError extends Error {
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502 | 503
  constructor(status: HttpError['status'], message: string) {
    super(message)
    this.status = status
  }
}

export async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // rơi xuống lỗi bên dưới
  }
  throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ.')
}

// ---------- Kiểm tra dữ liệu ----------

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new HttpError(400, `Thiếu ${field}.`)
  const s = v.trim()
  if (s.length < min) throw new HttpError(400, min <= 1 ? `Thiếu ${field}.` : `${field} cần ít nhất ${min} ký tự.`)
  if (s.length > max) throw new HttpError(400, `${field} dài quá ${max} ký tự.`)
  return s
}

export function optStr(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null
  return str(v, field, 0, max)
}

export function oneOf<T extends string>(v: unknown, values: readonly T[], field: string): T {
  if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T
  throw new HttpError(400, `${field} không hợp lệ.`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function email(v: unknown): string {
  const s = str(v, 'email', 3, 254).toLowerCase()
  if (!EMAIL_RE.test(s)) throw new HttpError(400, 'Email không hợp lệ.')
  return s
}

export function pageParams(c: Ctx) {
  const page = Math.max(1, Math.trunc(Number(c.req.query('page')) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(c.req.query('pageSize')) || 20)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

// ---------- IP & giới hạn tần suất ----------

export function clientIp(c: Ctx): string {
  const { config } = c.get('deps')
  if (config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (fwd) return fwd
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? 'unknown'
}

// Đếm theo cửa sổ cố định, lưu trong bộ nhớ (đủ cho 1 tiến trình server)
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  check(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
    }
    const hit = this.hits.get(key)
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    hit.count++
    return hit.count <= limit
  }
}

export function rateLimit(c: Ctx, bucket: string, limit: number, windowMs: number) {
  const { limiter, now } = c.get('deps')
  if (!limiter.check(`${bucket}:${clientIp(c)}`, limit, windowMs, now().getTime()))
    throw new HttpError(429, 'Bạn thao tác quá nhanh, đợi một lát rồi thử lại.')
}
