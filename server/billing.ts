// Gói Premium và thanh toán qua PayOS (chuyển khoản VietQR).
// Tài liệu PayOS: https://payos.vn/docs/api/
// Chưa có khoá PayOS thì chạy chế độ giả lập (devMode) để thử luồng nâng cấp trên máy.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { CheckoutResult, Order, PlanOffer } from '../shared/api.ts'
import { requireUser, toUser, getUserRow } from './auth.ts'
import type { Config } from './config.ts'
import { type DB, tx } from './db.ts'
import { type AppEnv, type Deps, HttpError, oneOf, readJson } from './http.ts'

const PENDING_TTL_MS = 30 * 60_000 // đơn chưa trả sau 30 phút coi như hết hạn

export interface OrderRow {
  order_code: number
  user_id: string | null
  plan_id: string
  amount_vnd: number
  days: number
  status: string
  checkout_url: string | null
  created_at: string
  paid_at: string | null
  user_email?: string | null
}

export function planOffers(config: Config): PlanOffer[] {
  return [
    { id: 'month', name: 'Premium 1 tháng', priceVnd: config.prices.month, days: 30 },
    { id: 'year', name: 'Premium 1 năm', priceVnd: config.prices.year, days: 365 },
  ]
}

export function toOrder(row: OrderRow): Order {
  const order: Order = {
    orderCode: row.order_code,
    userId: row.user_id ?? '',
    planId: row.plan_id === 'year' ? 'year' : 'month',
    amountVnd: row.amount_vnd,
    status: (['pending', 'paid', 'cancelled', 'expired'] as const).find((s) => s === row.status) ?? 'pending',
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }
  if (row.user_email !== undefined) order.userEmail = row.user_email ?? undefined
  return order
}

export function expireStaleOrders(db: DB, now: Date) {
  db.prepare(`UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?`).run(
    new Date(now.getTime() - PENDING_TTL_MS).toISOString(),
  )
}

// Đánh dấu đã trả và cộng ngày Premium. Gọi lại nhiều lần vẫn chỉ cộng một lần.
export function markPaid(db: DB, orderCode: number, now: Date): boolean {
  return tx(db, () => {
    const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode) as OrderRow | undefined
    if (!order || order.status === 'paid') return false
    db.prepare(`UPDATE orders SET status = 'paid', paid_at = ? WHERE order_code = ?`).run(now.toISOString(), orderCode)
    if (order.user_id) {
      const user = db.prepare('SELECT premium_until FROM users WHERE id = ?').get(order.user_id) as
        { premium_until: string | null } | undefined
      if (user) {
        const current = user.premium_until ? new Date(user.premium_until).getTime() : 0
        const until = new Date(Math.max(now.getTime(), current) + order.days * 86400_000)
        db.prepare('UPDATE users SET premium_until = ? WHERE id = ?').run(until.toISOString(), order.user_id)
      }
    }
    return true
  })
}

// ---------- PayOS ----------

const hmac = (key: string, data: string) => createHmac('sha256', key).update(data).digest('hex')

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]]),
  )
}

// Chuỗi ký của PayOS: các khoá xếp theo alphabet, nối key=value bằng &
export function payosDataString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((k) => {
      let v = data[k]
      if (v === null || v === undefined || v === 'null' || v === 'undefined') v = ''
      else if (Array.isArray(v))
        v = JSON.stringify(v.map((x) => (x && typeof x === 'object' ? sortObject(x as Record<string, unknown>) : x)))
      else if (typeof v === 'object') v = JSON.stringify(sortObject(v as Record<string, unknown>))
      return `${k}=${String(v)}`
    })
    .join('&')
}

export function payosSign(checksumKey: string, data: Record<string, unknown>): string {
  return hmac(checksumKey, payosDataString(data))
}

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

function returnUrls(config: Config, orderCode: number) {
  const returnUrl = `${config.siteUrl}/app/#/upgrade?order=${orderCode}`
  return { returnUrl, cancelUrl: `${returnUrl}&cancel=1` }
}

async function payosCreateLink(deps: Deps, order: OrderRow, plan: PlanOffer): Promise<string> {
  const payos = deps.config.payos!
  const { returnUrl, cancelUrl } = returnUrls(deps.config, order.order_code)
  // Tài khoản ngân hàng không liên kết qua PayOS chỉ nhận nội dung ≤ 9 ký tự
  const description = `GK${plan.id === 'year' ? 'NAM' : 'THANG'}`
  const fields = { amount: order.amount_vnd, cancelUrl, description, orderCode: order.order_code, returnUrl }
  const res = await deps.fetch(`${payos.baseUrl}/v2/payment-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': payos.clientId, 'x-api-key': payos.apiKey },
    body: JSON.stringify({
      ...fields,
      items: [{ name: plan.name, quantity: 1, price: order.amount_vnd }],
      expiredAt: Math.floor((Date.parse(order.created_at) + PENDING_TTL_MS) / 1000),
      signature: payosSign(payos.checksumKey, fields),
    }),
  })
  const json = (await res.json().catch(() => null)) as { code?: string; desc?: string; data?: { checkoutUrl?: string } }
  if (!json || json.code !== '00' || !json.data?.checkoutUrl)
    throw new Error(`PayOS từ chối tạo link: ${json?.code} ${json?.desc}`)
  return json.data.checkoutUrl
}

async function payosStatus(deps: Deps, orderCode: number): Promise<{ status: string; amount: number } | null> {
  const payos = deps.config.payos!
  const res = await deps.fetch(`${payos.baseUrl}/v2/payment-requests/${orderCode}`, {
    headers: { 'x-client-id': payos.clientId, 'x-api-key': payos.apiKey },
  })
  const json = (await res.json().catch(() => null)) as { code?: string; data?: { status?: string; amount?: number } }
  if (!json || json.code !== '00' || !json.data?.status) return null
  return { status: json.data.status, amount: Number(json.data.amount) }
}

// Mã đơn: số nguyên duy nhất, nằm trong giới hạn số an toàn của JS và PayOS
function newOrderCode(db: DB, now: Date): number {
  for (;;) {
    const code = (now.getTime() % 1e12) * 10 + Math.floor(Math.random() * 10)
    if (!db.prepare('SELECT 1 FROM orders WHERE order_code = ?').get(code)) return code
    now = new Date(now.getTime() + 1)
  }
}

// ---------- Route ----------

export function billingRoutes() {
  const r = new Hono<AppEnv>()

  const getOwnOrder = (deps: Deps, userId: string, isAdmin: boolean, raw: string) => {
    const code = Number(raw)
    if (!Number.isSafeInteger(code)) throw new HttpError(404, 'Không tìm thấy đơn hàng.')
    const order = deps.db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code) as OrderRow | undefined
    if (!order || (order.user_id !== userId && !isAdmin)) throw new HttpError(404, 'Không tìm thấy đơn hàng.')
    return order
  }

  r.post('/checkout', async (c) => {
    const user = requireUser(c)
    const deps = c.get('deps')
    const { db, config, now } = deps
    const planId = oneOf((await readJson(c)).planId, ['month', 'year'] as const, 'Gói')
    const plan = planOffers(config).find((p) => p.id === planId)!
    if (!config.payos && config.production) throw new HttpError(503, 'Thanh toán đang bảo trì, bạn quay lại sau nhé.')

    const order: OrderRow = {
      order_code: newOrderCode(db, now()),
      user_id: user.id,
      plan_id: plan.id,
      amount_vnd: plan.priceVnd,
      days: plan.days,
      status: 'pending',
      checkout_url: null,
      created_at: now().toISOString(),
      paid_at: null,
    }
    db.prepare(
      'INSERT INTO orders (order_code, user_id, plan_id, amount_vnd, days, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(order.order_code, order.user_id, order.plan_id, order.amount_vnd, order.days, order.status, order.created_at)

    if (!config.payos) {
      const result: CheckoutResult = { orderCode: order.order_code, checkoutUrl: null, devMode: true }
      return c.json(result)
    }
    try {
      const checkoutUrl = await payosCreateLink(deps, order, plan)
      db.prepare('UPDATE orders SET checkout_url = ? WHERE order_code = ?').run(checkoutUrl, order.order_code)
      const result: CheckoutResult = { orderCode: order.order_code, checkoutUrl, devMode: false }
      return c.json(result)
    } catch (e) {
      console.error(e)
      db.prepare(`UPDATE orders SET status = 'cancelled' WHERE order_code = ?`).run(order.order_code)
      throw new HttpError(502, 'Không tạo được link thanh toán, bạn thử lại sau ít phút.')
    }
  })

  r.get('/orders', (c) => {
    const user = requireUser(c)
    const { db, now } = c.get('deps')
    expireStaleOrders(db, now())
    const rows = db
      .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(user.id) as unknown as OrderRow[]
    return c.json({ items: rows.map(toOrder) })
  })

  r.get('/orders/:orderCode', async (c) => {
    const user = requireUser(c)
    const deps = c.get('deps')
    const { db, config, now } = deps
    let order = getOwnOrder(deps, user.id, user.role === 'admin', c.req.param('orderCode'))

    // Người dùng quay lại từ trang PayOS: hỏi lại PayOS phòng khi webhook chưa tới (hoặc không tới được)
    if (order.status !== 'paid' && order.status !== 'cancelled' && config.payos) {
      try {
        const remote = await payosStatus(deps, order.order_code)
        if (remote?.status === 'PAID' && remote.amount === order.amount_vnd) markPaid(db, order.order_code, now())
        else if (remote?.status === 'CANCELLED' && order.status === 'pending')
          db.prepare(`UPDATE orders SET status = 'cancelled' WHERE order_code = ?`).run(order.order_code)
      } catch (e) {
        console.error('Không hỏi được trạng thái PayOS', e)
      }
    }
    expireStaleOrders(db, now())
    order = getOwnOrder(deps, user.id, true, String(order.order_code))
    const owner = order.user_id ? getUserRow(c, order.user_id) : undefined
    return c.json({ order: toOrder(order), user: owner ? toUser(owner, now()) : null })
  })

  // PayOS gọi vào khi có tiền về. Luôn trả 2xx cho dữ liệu hợp lệ để PayOS không gửi lại mãi.
  r.post('/payos-webhook', async (c) => {
    const { db, config, now } = c.get('deps')
    if (!config.payos) throw new HttpError(404, 'Không tìm thấy.')
    const body = await readJson(c)
    const data = body.data as Record<string, unknown> | undefined
    const signature = typeof body.signature === 'string' ? body.signature : ''
    if (!data || typeof data !== 'object' || !safeEqualHex(payosSign(config.payos.checksumKey, data), signature))
      throw new HttpError(400, 'Chữ ký không hợp lệ.')

    const success = body.code === '00' && (data.code === undefined || data.code === '00')
    const orderCode = Number(data.orderCode)
    const order = Number.isSafeInteger(orderCode)
      ? (db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode) as OrderRow | undefined)
      : undefined
    // Không có đơn: thường là webhook thử khi khai báo URL trên trang PayOS
    if (success && order) {
      if (Number(data.amount) !== order.amount_vnd)
        console.error(`Webhook PayOS: đơn ${orderCode} số tiền ${String(data.amount)} không khớp ${order.amount_vnd}`)
      else markPaid(db, orderCode, now())
    }
    return c.json({ ok: true })
  })

  // Giả lập thanh toán thành công, chỉ dùng khi phát triển trên máy
  r.post('/dev-confirm', async (c) => {
    const deps = c.get('deps')
    if (deps.config.payos || deps.config.production) throw new HttpError(404, 'Không tìm thấy.')
    const user = requireUser(c)
    const order = getOwnOrder(deps, user.id, false, String((await readJson(c)).orderCode))
    markPaid(deps.db, order.order_code, deps.now())
    const fresh = getOwnOrder(deps, user.id, false, String(order.order_code))
    return c.json({ order: toOrder(fresh), user: toUser(getUserRow(c, user.id)!, deps.now()) })
  })

  return r
}
