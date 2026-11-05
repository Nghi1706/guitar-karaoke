// API trang quản trị: thống kê, tài khoản, góp ý, đơn hàng. Chỉ admin gọi được.

import { Hono } from 'hono'
import type { AdminStats, DailyStat, Paged } from '../shared/api.ts'
import { adminOnly, getUserRow, requireAdmin, toUser } from './auth.ts'
import { type OrderRow, expireStaleOrders, toOrder } from './billing.ts'
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, type FeedbackRow, toFeedback } from './feedback.ts'
import { type AppEnv, type Ctx, type UserRow, HttpError, oneOf, optStr, pageParams, readJson, str } from './http.ts'

type SqlParam = string | number | null

const paged = <T>(items: T[], total: number, page: number, pageSize: number): Paged<T> => ({
  items,
  total,
  page,
  pageSize,
})

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

// Đếm theo ngày (giờ địa phương) cho một bảng
function countByDay(c: Ctx, sql: string, params: SqlParam[]): Map<string, number> {
  const rows = c
    .get('deps')
    .db.prepare(sql)
    .all(...params) as { d: string; n: number }[]
  return new Map(rows.map((r) => [r.d, Number(r.n)]))
}

function stats(c: Ctx, days: number): AdminStats {
  const { db, now, config } = c.get('deps')
  const offsetMs = config.statsUtcOffsetHours * 3600_000
  const shift = `${config.statsUtcOffsetHours >= 0 ? '+' : ''}${config.statsUtcOffsetHours} hours`
  const nowIso = now().toISOString()

  // Nửa đêm (giờ địa phương) của ngày đầu khoảng thống kê, đổi về UTC
  const localToday = new Date(now().getTime() + offsetMs)
  localToday.setUTCHours(0, 0, 0, 0)
  const startLocal = new Date(localToday.getTime() - (days - 1) * 86400_000)
  const since = new Date(startLocal.getTime() - offsetMs).toISOString()
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(startLocal.getTime() + i * 86400_000).toISOString().slice(0, 10),
  )

  const one = (sql: string, ...params: SqlParam[]) =>
    Number((db.prepare(sql).get(...params) as { n: number | null }).n ?? 0)

  const adRows = db
    .prepare('SELECT event, COUNT(*) AS n FROM ad_events WHERE created_at >= ? GROUP BY event')
    .all(since) as { event: string; n: number }[]
  const ad = (e: string) => Number(adRows.find((r) => r.event === e)?.n ?? 0)

  const day = (col: string) => `date(${col}, '${shift}')`
  const signups = countByDay(
    c,
    `SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d`,
    [since],
  )
  const revenue = countByDay(
    c,
    `SELECT ${day('paid_at')} AS d, SUM(amount_vnd) AS n FROM orders WHERE status = 'paid' AND paid_at >= ? GROUP BY d`,
    [since],
  )
  const adShown = countByDay(
    c,
    `SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM ad_events WHERE event = 'shown' AND created_at >= ? GROUP BY d`,
    [since],
  )
  const feedback = countByDay(
    c,
    `SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM feedback WHERE created_at >= ? GROUP BY d`,
    [since],
  )

  // Lượt dùng ẩn danh
  const usageRows = db
    .prepare('SELECT event, COUNT(*) AS n FROM usage_events WHERE created_at >= ? GROUP BY event')
    .all(since) as { event: string; n: number }[]
  const usage = (e: string) => Number(usageRows.find((r) => r.event === e)?.n ?? 0)
  // Lần đầu mỗi trình duyệt dùng app, để đếm người mới
  const firstSeen = 'SELECT MIN(created_at) AS first FROM usage_events GROUP BY client_id'
  const usageEvents = (event: string) =>
    countByDay(
      c,
      `SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM usage_events WHERE event = ? AND created_at >= ? GROUP BY d`,
      [event, since],
    )
  const activeUsers = countByDay(
    c,
    `SELECT ${day('created_at')} AS d, COUNT(DISTINCT client_id) AS n FROM usage_events WHERE created_at >= ? GROUP BY d`,
    [since],
  )
  const newUsers = countByDay(
    c,
    `SELECT ${day('first')} AS d, COUNT(*) AS n FROM (${firstSeen}) WHERE first >= ? GROUP BY d`,
    [since],
  )
  const singers = countByDay(
    c,
    `SELECT ${day('created_at')} AS d, COUNT(DISTINCT client_id) AS n FROM usage_events WHERE event = 'play' AND created_at >= ? GROUP BY d`,
    [since],
  )
  const plays = usageEvents('play')
  const finishes = usageEvents('finish')
  const composes = usageEvents('compose')
  const saves = usageEvents('save')

  const daily: DailyStat[] = dates.map((date) => ({
    date,
    signups: signups.get(date) ?? 0,
    revenueVnd: revenue.get(date) ?? 0,
    adShown: adShown.get(date) ?? 0,
    feedback: feedback.get(date) ?? 0,
    activeUsers: activeUsers.get(date) ?? 0,
    newUsers: newUsers.get(date) ?? 0,
    plays: plays.get(date) ?? 0,
    singers: singers.get(date) ?? 0,
    finishes: finishes.get(date) ?? 0,
    composes: composes.get(date) ?? 0,
    saves: saves.get(date) ?? 0,
  }))

  return {
    users: {
      total: one('SELECT COUNT(*) AS n FROM users'),
      premium: one('SELECT COUNT(*) AS n FROM users WHERE premium_until > ?', nowIso),
      banned: one(`SELECT COUNT(*) AS n FROM users WHERE status = 'banned'`),
      newInRange: one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since),
    },
    revenue: {
      totalVnd: one(`SELECT SUM(amount_vnd) AS n FROM orders WHERE status = 'paid'`),
      inRangeVnd: one(`SELECT SUM(amount_vnd) AS n FROM orders WHERE status = 'paid' AND paid_at >= ?`, since),
      paidOrders: one(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND paid_at >= ?`, since),
    },
    feedback: {
      open: one(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'open'`),
      total: one('SELECT COUNT(*) AS n FROM feedback'),
    },
    ads: { shown: ad('shown'), completed: ad('completed'), skipped: ad('skipped'), upgradeClicks: ad('upgrade_click') },
    usage: {
      totalUsers: one('SELECT COUNT(DISTINCT client_id) AS n FROM usage_events'),
      totalSingers: one(`SELECT COUNT(DISTINCT client_id) AS n FROM usage_events WHERE event = 'play'`),
      totalPlays: one(`SELECT COUNT(*) AS n FROM usage_events WHERE event = 'play'`),
      activeUsers: one('SELECT COUNT(DISTINCT client_id) AS n FROM usage_events WHERE created_at >= ?', since),
      newUsers: one(`SELECT COUNT(*) AS n FROM (${firstSeen}) WHERE first >= ?`, since),
      singers: one(
        `SELECT COUNT(DISTINCT client_id) AS n FROM usage_events WHERE event = 'play' AND created_at >= ?`,
        since,
      ),
      plays: usage('play'),
      finishes: usage('finish'),
      composes: usage('compose'),
      saves: usage('save'),
    },
    daily,
  }
}

export function adminRoutes() {
  const r = new Hono<AppEnv>()
  r.use('*', adminOnly)

  r.get('/stats', (c) => {
    const days = Math.min(365, Math.max(1, Math.trunc(Number(c.req.query('days')) || 30)))
    return c.json(stats(c, days))
  })

  // ---------- Tài khoản ----------

  r.get('/users', (c) => {
    const { db, now } = c.get('deps')
    const { page, pageSize, offset } = pageParams(c)
    const where: string[] = []
    const params: SqlParam[] = []
    const q = c.req.query('q')?.trim()
    if (q) {
      where.push(`(email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')`)
      params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`)
    }
    const plan = c.req.query('plan')
    if (plan === 'premium') {
      where.push('premium_until > ?')
      params.push(now().toISOString())
    } else if (plan === 'free') {
      where.push('(premium_until IS NULL OR premium_until <= ?)')
      params.push(now().toISOString())
    }
    const role = c.req.query('role')
    if (role === 'admin' || role === 'user') {
      where.push('role = ?')
      params.push(role)
    }
    const status = c.req.query('status')
    if (status === 'active' || status === 'banned') {
      where.push('status = ?')
      params.push(status)
    }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM users ${cond}`).get(...params) as { n: number }).n
    const rows = db
      .prepare(`SELECT * FROM users ${cond} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as unknown as UserRow[]
    return c.json(
      paged(
        rows.map((u) => toUser(u, now())),
        Number(total),
        page,
        pageSize,
      ),
    )
  })

  r.patch('/users/:id', async (c) => {
    const me = requireAdmin(c)
    const { db, now } = c.get('deps')
    const id = c.req.param('id')
    const target = getUserRow(c, id)
    if (!target) throw new HttpError(404, 'Không tìm thấy tài khoản.')
    const body = await readJson(c)
    const patch: Partial<UserRow> = {}

    if (body.name !== undefined) patch.name = str(body.name, 'tên hiển thị', 1, 60)
    if (body.role !== undefined) patch.role = oneOf(body.role, ['user', 'admin'] as const, 'Quyền')
    if (body.status !== undefined) patch.status = oneOf(body.status, ['active', 'banned'] as const, 'Trạng thái')
    if (body.premiumUntil !== undefined) {
      if (body.premiumUntil === null) patch.premium_until = null
      else {
        const d = typeof body.premiumUntil === 'string' ? new Date(body.premiumUntil) : new Date(NaN)
        if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Ngày hết hạn Premium không hợp lệ.')
        patch.premium_until = d.toISOString()
      }
    }
    if (id === me.id && (patch.role === 'user' || patch.status === 'banned'))
      throw new HttpError(400, 'Bạn không thể tự hạ quyền hoặc tự khoá tài khoản của mình.')

    const cols = Object.keys(patch) as (keyof UserRow)[]
    if (cols.length) {
      db.prepare(`UPDATE users SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...cols.map((k) => patch[k] ?? null),
        id,
      )
    }
    // Khoá tài khoản thì đăng xuất mọi thiết bị
    if (patch.status === 'banned') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    return c.json({ user: toUser(getUserRow(c, id)!, now()) })
  })

  r.delete('/users/:id', (c) => {
    const me = requireAdmin(c)
    const id = c.req.param('id')
    if (id === me.id) throw new HttpError(400, 'Bạn không thể tự xoá tài khoản của mình.')
    const { db } = c.get('deps')
    const res = db.prepare('DELETE FROM users WHERE id = ?').run(id)
    if (!res.changes) throw new HttpError(404, 'Không tìm thấy tài khoản.')
    db.prepare('UPDATE ad_events SET user_id = NULL WHERE user_id = ?').run(id)
    return c.json({ ok: true })
  })

  // ---------- Góp ý ----------

  const FEEDBACK_SELECT = `SELECT f.*, u.email AS user_email FROM feedback f LEFT JOIN users u ON u.id = f.user_id`

  r.get('/feedback', (c) => {
    const { db } = c.get('deps')
    const { page, pageSize, offset } = pageParams(c)
    const where: string[] = []
    const params: SqlParam[] = []
    const status = c.req.query('status')
    if (status && (FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      where.push('f.status = ?')
      params.push(status)
    }
    const type = c.req.query('type')
    if (type && (FEEDBACK_TYPES as readonly string[]).includes(type)) {
      where.push('f.type = ?')
      params.push(type)
    }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM feedback f ${cond}`).get(...params) as { n: number }).n
    const rows = db
      .prepare(`${FEEDBACK_SELECT} ${cond} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as unknown as FeedbackRow[]
    return c.json(paged(rows.map(toFeedback), Number(total), page, pageSize))
  })

  r.patch('/feedback/:id', async (c) => {
    const { db } = c.get('deps')
    const id = c.req.param('id')
    const body = await readJson(c)
    if (!db.prepare('SELECT 1 FROM feedback WHERE id = ?').get(id)) throw new HttpError(404, 'Không tìm thấy góp ý.')
    if (body.status !== undefined)
      db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(
        oneOf(body.status, FEEDBACK_STATUSES, 'Trạng thái'),
        id,
      )
    if (body.adminNote !== undefined)
      db.prepare('UPDATE feedback SET admin_note = ? WHERE id = ?').run(optStr(body.adminNote, 'Ghi chú', 2000), id)
    const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(id) as unknown as FeedbackRow
    return c.json({ item: toFeedback(row) })
  })

  // ---------- Đơn hàng ----------

  r.get('/orders', (c) => {
    const { db, now } = c.get('deps')
    expireStaleOrders(db, now())
    const { page, pageSize, offset } = pageParams(c)
    const status = c.req.query('status')
    const valid = ['pending', 'paid', 'cancelled', 'expired'].includes(status ?? '')
    const cond = valid ? 'WHERE o.status = ?' : ''
    const params: SqlParam[] = valid ? [status!] : []
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders o ${cond}`).get(...params) as { n: number }).n
    const rows = db
      .prepare(
        `SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id
         ${cond} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as unknown as OrderRow[]
    return c.json(paged(rows.map(toOrder), Number(total), page, pageSize))
  })

  return r
}
