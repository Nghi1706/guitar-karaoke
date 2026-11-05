// Đăng ký, đăng nhập, phiên làm việc (cookie gk_session) và phân quyền.

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { User } from '../shared/api.ts'
import { type AppEnv, type Ctx, type UserRow, HttpError, email, rateLimit, readJson, str } from './http.ts'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>

export const COOKIE = 'gk_session'
const SESSION_DAYS = 30
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

// ---------- Mật khẩu ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const opts = { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem }
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, opts)
  return timingSafeEqual(actual, expected)
}

// ---------- Người dùng ----------

export function toUser(row: UserRow, now: Date): User {
  const premium = !!row.premium_until && new Date(row.premium_until) > now
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'user',
    status: row.status === 'banned' ? 'banned' : 'active',
    plan: premium ? 'premium' : 'free',
    premiumUntil: row.premium_until,
    createdAt: row.created_at,
  }
}

export function getUserRow(c: Ctx, id: string): UserRow | undefined {
  return c.get('deps').db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

// ---------- Phiên đăng nhập ----------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function startSession(c: Ctx, userId: string) {
  const { db, config, now } = c.get('deps')
  const token = randomBytes(32).toString('base64url')
  const expires = now().getTime() + SESSION_DAYS * 86400_000
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    expires,
    now().toISOString(),
  )
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.production,
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
}

// Gắn user đang đăng nhập (hoặc null) vào context cho mọi request /api
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE)
  let user: UserRow | null = null
  if (token) {
    const { db, now } = c.get('deps')
    user =
      (db
        .prepare(
          `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
        )
        .get(sha256(token), now().getTime()) as UserRow | undefined) ?? null
  }
  c.set('user', user)
  await next()
})

export function requireUser(c: Ctx): UserRow {
  const user = c.get('user')
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập để làm việc này.')
  return user
}

export function requireAdmin(c: Ctx): UserRow {
  const user = requireUser(c)
  if (user.role !== 'admin') throw new HttpError(403, 'Bạn không có quyền vào trang quản trị.')
  return user
}

export const adminOnly = createMiddleware<AppEnv>(async (c, next) => {
  requireAdmin(c)
  await next()
})

// Email nằm trong ADMIN_EMAILS thì tự lên admin
function promoteIfConfigured(c: Ctx, row: UserRow): UserRow {
  const { db, config } = c.get('deps')
  if (row.role !== 'admin' && config.adminEmails.includes(row.email.toLowerCase())) {
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(row.id)
    return { ...row, role: 'admin' }
  }
  return row
}

// ---------- Route ----------

const MINUTE = 60_000

export function authRoutes() {
  const r = new Hono<AppEnv>()

  r.post('/register', async (c) => {
    rateLimit(c, 'register', 10, 60 * MINUTE)
    const body = await readJson(c)
    const mail = email(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8) throw new HttpError(400, 'Mật khẩu cần ít nhất 8 ký tự.')
    if (password.length > 200) throw new HttpError(400, 'Mật khẩu dài quá 200 ký tự.')
    const name = str(body.name, 'tên hiển thị', 1, 60)

    const { db, now } = c.get('deps')
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail))
      throw new HttpError(409, 'Email này đã có tài khoản. Hãy đăng nhập.')
    const row: UserRow = {
      id: randomUUID(),
      email: mail,
      name,
      password_hash: await hashPassword(password),
      role: 'user',
      status: 'active',
      premium_until: null,
      created_at: now().toISOString(),
    }
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(row.id, row.email, row.name, row.password_hash, row.role, row.status, row.created_at)
    const user = promoteIfConfigured(c, row)
    startSession(c, user.id)
    return c.json({ user: toUser(user, now()) }, 201)
  })

  r.post('/login', async (c) => {
    rateLimit(c, 'login', 20, 10 * MINUTE)
    const body = await readJson(c)
    const mail = email(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    const { db, now } = c.get('deps')
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(mail) as UserRow | undefined
    // Email không tồn tại vẫn băm một lần để thời gian phản hồi giống nhau, khó dò email
    const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false)
    if (!row || !ok) throw new HttpError(401, 'Email hoặc mật khẩu không đúng.')
    if (row.status === 'banned') throw new HttpError(403, 'Tài khoản này đã bị khoá. Liên hệ quản trị viên.')
    const user = promoteIfConfigured(c, row)
    startSession(c, user.id)
    return c.json({ user: toUser(user, now()) })
  })

  r.post('/logout', (c) => {
    const token = getCookie(c, COOKIE)
    if (token) c.get('deps').db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
    deleteCookie(c, COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  r.get('/me', (c) => {
    const user = c.get('user')
    return c.json({ user: user ? toUser(user, c.get('deps').now()) : null })
  })

  r.patch('/me', async (c) => {
    const user = requireUser(c)
    const name = str((await readJson(c)).name, 'tên hiển thị', 1, 60)
    const { db, now } = c.get('deps')
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id)
    return c.json({ user: toUser({ ...user, name }, now()) })
  })

  r.post('/password', async (c) => {
    rateLimit(c, 'login', 20, 10 * MINUTE)
    const user = requireUser(c)
    const body = await readJson(c)
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const next = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (!(await verifyPassword(current, user.password_hash))) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.')
    if (next.length < 8) throw new HttpError(400, 'Mật khẩu mới cần ít nhất 8 ký tự.')
    if (next.length > 200) throw new HttpError(400, 'Mật khẩu mới dài quá 200 ký tự.')
    const { db } = c.get('deps')
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id)
    // Đăng xuất các thiết bị khác, giữ phiên hiện tại
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
      user.id,
      sha256(getCookie(c, COOKIE) ?? ''),
    )
    return c.json({ ok: true })
  })

  return r
}
