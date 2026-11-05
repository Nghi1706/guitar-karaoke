import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AdminStats, CheckoutResult, Order, Paged, User } from '../shared/api.ts'
import { createApp } from './app.ts'
import { type Config, loadConfig } from './config.ts'
import { type DB, openDb } from './db.ts'

const PAYOS = { clientId: 'cid', apiKey: 'key', checksumKey: 'secret', baseUrl: 'https://payos.test' }

function setup(over: Partial<Config> = {}, fetchImpl?: typeof fetch) {
  const config: Config = { ...loadConfig({}, []), adminEmails: ['boss@vidu.com'], trustProxy: true, ...over }
  const db = openDb(':memory:')
  const clock = { now: new Date('2026-10-31T03:00:00Z') }
  const app = createApp({ db, config, fetch: fetchImpl, now: () => clock.now })
  return { app, db, clock }
}

type App = ReturnType<typeof setup>['app']

// Client giả lập trình duyệt: giữ cookie giữa các request
function client(app: App, ip = '1.1.1.1') {
  let cookie = ''
  const call = async <T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers = {}) => {
    const res = await app.request(path, {
      method,
      headers: {
        'x-forwarded-for': ip,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
    return { status: res.status, body: (await res.json()) as T }
  }
  return {
    get: <T = Record<string, unknown>>(p: string) => call<T>('GET', p),
    post: <T = Record<string, unknown>>(p: string, b: unknown = {}, h = {}) => call<T>('POST', p, b, h),
    patch: <T = Record<string, unknown>>(p: string, b: unknown) => call<T>('PATCH', p, b),
    del: <T = Record<string, unknown>>(p: string) => call<T>('DELETE', p, {}),
    get cookie() {
      return cookie
    },
  }
}

async function register(app: App, email: string, ip?: string) {
  const c = client(app, ip)
  const res = await c.post<{ user: User }>('/api/auth/register', { email, password: 'matkhau123', name: 'Tên' })
  expect(res.status).toBe(201)
  return { c, user: res.body.user }
}

// Ký dữ liệu webhook giống PayOS
function signPayos(data: Record<string, unknown>, key = PAYOS.checksumKey) {
  const str = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] ?? ''}`)
    .join('&')
  return createHmac('sha256', key).update(str).digest('hex')
}

describe('auth', () => {
  let app: App
  beforeEach(() => ({ app } = setup()))

  it('đăng ký, xem me, đăng xuất, đăng nhập lại', async () => {
    const { c, user } = await register(app, 'An@Vidu.com')
    expect(user).toMatchObject({ email: 'an@vidu.com', role: 'user', plan: 'free', premiumUntil: null })
    expect(c.cookie).toMatch(/^gk_session=/)
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.id).toBe(user.id)

    await c.post('/api/auth/logout')
    expect((await c.get('/api/auth/me')).body.user).toBeNull()

    const bad = await c.post('/api/auth/login', { email: 'an@vidu.com', password: 'sai-mat-khau' })
    expect(bad.status).toBe(401)
    expect(bad.body.error).toBe('Email hoặc mật khẩu không đúng.')
    const ok = await c.post<{ user: User }>('/api/auth/login', { email: 'AN@vidu.com', password: 'matkhau123' })
    expect(ok.status).toBe(200)
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.email).toBe('an@vidu.com')
  })

  it('kiểm tra dữ liệu và email trùng', async () => {
    const c = client(app)
    expect((await c.post('/api/auth/register', { email: 'x', password: 'matkhau123', name: 'A' })).status).toBe(400)
    expect((await c.post('/api/auth/register', { email: 'a@b.co', password: 'ngan', name: 'A' })).status).toBe(400)
    await register(app, 'trung@vidu.com')
    const dup = await c.post('/api/auth/register', { email: 'TRUNG@vidu.com', password: 'matkhau123', name: 'B' })
    expect(dup.status).toBe(409)
  })

  it('đổi tên và mật khẩu', async () => {
    const { c } = await register(app, 'doi@vidu.com')
    expect((await c.patch<{ user: User }>('/api/auth/me', { name: '  Mới ' })).body.user.name).toBe('Mới')
    expect((await c.post('/api/auth/password', { currentPassword: 'sai', newPassword: 'moimoi123' })).status).toBe(400)
    expect(
      (await c.post('/api/auth/password', { currentPassword: 'matkhau123', newPassword: 'moimoi123' })).status,
    ).toBe(200)
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user).not.toBeNull()
    const other = client(app)
    expect((await other.post('/api/auth/login', { email: 'doi@vidu.com', password: 'moimoi123' })).status).toBe(200)
  })

  it('chặn request ghi không phải JSON hoặc khác nguồn', async () => {
    const form = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'type=bug&message=hello',
    })
    expect(form.status).toBe(400)
    const c = client(app)
    const cross = await c.post('/api/feedback', { type: 'bug', message: 'xin chào' }, { origin: 'https://evil.com' })
    expect(cross.status).toBe(403)
    const same = await c.post(
      '/api/feedback',
      { type: 'bug', message: 'xin chào' },
      { origin: 'http://localhost:5280' },
    )
    expect(same.status).toBe(201)
  })

  it('giới hạn số lần đăng nhập theo IP', async () => {
    const c = client(app, '9.9.9.9')
    const statuses = []
    for (let i = 0; i < 21; i++)
      statuses.push((await c.post('/api/auth/login', { email: 'ai@vidu.com', password: 'x' })).status)
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true)
    expect(statuses[20]).toBe(429)
    // IP khác không bị ảnh hưởng
    expect((await client(app, '8.8.8.8').post('/api/auth/login', { email: 'ai@vidu.com', password: 'x' })).status).toBe(
      401,
    )
  })
})

describe('admin', () => {
  let app: App
  let db: DB
  beforeEach(() => ({ app, db } = setup()))

  it('email trong ADMIN_EMAILS thành admin, người thường bị chặn', async () => {
    const { c: boss, user } = await register(app, 'boss@vidu.com')
    expect(user.role).toBe('admin')
    const { c: normal } = await register(app, 'thuong@vidu.com')
    expect((await normal.get('/api/admin/stats')).status).toBe(403)
    expect((await client(app).get('/api/admin/users')).status).toBe(401)
    expect((await boss.get('/api/admin/stats')).status).toBe(200)
  })

  it('tìm, khoá, cấp Premium, xoá tài khoản', async () => {
    const { c: boss, user: me } = await register(app, 'boss@vidu.com')
    const { c: victim, user } = await register(app, 'nguoi.dung@vidu.com')
    await register(app, 'khac@vidu.com')

    const found = await boss.get<Paged<User>>('/api/admin/users?q=nguoi')
    expect(found.body.total).toBe(1)
    expect(found.body.items[0].id).toBe(user.id)
    expect((await boss.get<Paged<User>>('/api/admin/users?pageSize=2&page=2')).body.items).toHaveLength(1)

    // Khoá: mất phiên, không đăng nhập lại được
    const banned = await boss.patch<{ user: User }>(`/api/admin/users/${user.id}`, { status: 'banned' })
    expect(banned.body.user.status).toBe('banned')
    expect((await victim.get('/api/auth/me')).body.user).toBeNull()
    const login = await victim.post('/api/auth/login', { email: 'nguoi.dung@vidu.com', password: 'matkhau123' })
    expect(login.status).toBe(403)

    const until = '2027-01-01T00:00:00.000Z'
    const premium = await boss.patch<{ user: User }>(`/api/admin/users/${user.id}`, { premiumUntil: until })
    expect(premium.body.user).toMatchObject({ plan: 'premium', premiumUntil: until })
    expect((await boss.get<Paged<User>>('/api/admin/users?plan=premium')).body.total).toBe(1)

    // Không tự hạ quyền / tự khoá / tự xoá
    expect((await boss.patch(`/api/admin/users/${me.id}`, { role: 'user' })).status).toBe(400)
    expect((await boss.patch(`/api/admin/users/${me.id}`, { status: 'banned' })).status).toBe(400)
    expect((await boss.del(`/api/admin/users/${me.id}`)).status).toBe(400)

    expect((await boss.del(`/api/admin/users/${user.id}`)).status).toBe(200)
    expect((await boss.del(`/api/admin/users/${user.id}`)).status).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toMatchObject({ n: 2 })
  })

  it('góp ý: khách gửi, admin xem và đổi trạng thái', async () => {
    const guest = client(app)
    expect((await guest.post('/api/feedback', { type: 'bug', message: 'ngắn' })).status).toBe(400)
    expect((await guest.post('/api/feedback', { type: 'xyz', message: 'nội dung đủ dài' })).status).toBe(400)
    expect(
      (await guest.post('/api/feedback', { type: 'bug', message: 'Không phát được tiếng', email: 'khach@vidu.com' }))
        .status,
    ).toBe(201)
    const { c: user } = await register(app, 'gopy@vidu.com')
    await user.post('/api/feedback', { type: 'song', message: 'Bài này sai hợp âm', page: 'play' })

    const { c: boss } = await register(app, 'boss@vidu.com')
    const list =
      await boss.get<Paged<{ id: string; type: string; userEmail: string | null; email: string | null }>>(
        '/api/admin/feedback',
      )
    expect(list.body.total).toBe(2)
    const song = list.body.items.find((f) => f.type === 'song')!
    expect(song.userEmail).toBe('gopy@vidu.com')
    expect(list.body.items.find((f) => f.type === 'bug')!.email).toBe('khach@vidu.com')

    const upd = await boss.patch<{ item: { status: string; adminNote: string } }>(`/api/admin/feedback/${song.id}`, {
      status: 'resolved',
      adminNote: 'Đã sửa',
    })
    expect(upd.body.item).toMatchObject({ status: 'resolved', adminNote: 'Đã sửa' })
    expect((await boss.get<Paged<unknown>>('/api/admin/feedback?status=open')).body.total).toBe(1)
  })

  it('thống kê đủ từng ngày theo giờ Việt Nam', async () => {
    const { app, clock } = setup()
    const { c: boss } = await register(app, 'boss@vidu.com')
    const guest = client(app)
    await guest.post('/api/ads/event', { placement: 'pre-play', event: 'shown' })
    await guest.post('/api/ads/event', { placement: 'pre-play', event: 'skipped' })
    expect((await guest.post('/api/ads/event', { placement: 'pre play', event: 'shown' })).status).toBe(400)
    // 20:00 UTC ngày 31/10 = 03:00 ngày 1/11 giờ Việt Nam
    clock.now = new Date('2026-10-31T20:00:00Z')
    await register(app, 'dem@vidu.com')
    await guest.post('/api/ads/event', { placement: 'pre-play', event: 'shown' })
    await guest.post('/api/feedback', { type: 'other', message: 'Góp ý buổi đêm' })

    const s = (await boss.get<AdminStats>('/api/admin/stats?days=7')).body
    expect(s.daily).toHaveLength(7)
    expect(s.daily.at(-1)).toMatchObject({ date: '2026-11-01', signups: 1, adShown: 1, feedback: 1 })
    expect(s.daily.at(-2)).toMatchObject({ date: '2026-10-31', signups: 1, adShown: 1, feedback: 0 })
    expect(s.daily[0]).toMatchObject({ date: '2026-10-26', signups: 0, revenueVnd: 0 })
    expect(s.users).toMatchObject({ total: 2, premium: 0, newInRange: 2 })
    expect(s.ads).toMatchObject({ shown: 2, skipped: 1, completed: 0 })
    expect(s.feedback).toMatchObject({ open: 1, total: 1 })
  })

  it('đếm người dùng ẩn danh, lượt hát, soạn và lưu bài', async () => {
    const { app, clock } = setup()
    const { c: boss } = await register(app, 'boss@vidu.com')
    const guest = client(app)
    const send = (clientId: string, event: string) => guest.post('/api/usage/event', { clientId, event })

    // Máy A dùng từ hôm 25/10, hôm nay quay lại hát 2 lần, hát hết 1 bài
    clock.now = new Date('2026-10-25T03:00:00Z')
    await send('may-a-123456', 'open')
    clock.now = new Date('2026-10-31T03:00:00Z')
    await send('may-a-123456', 'open')
    await send('may-a-123456', 'compose')
    await send('may-a-123456', 'play')
    await send('may-a-123456', 'play')
    await send('may-a-123456', 'finish')
    await send('may-a-123456', 'save')
    // Máy B mới, chỉ mở xem
    await send('may-b-123456', 'open')

    expect((await send('ngắn', 'open')).status).toBe(400)
    expect((await send('may-c 123456', 'open')).status).toBe(400)
    expect((await send('may-c-123456', 'hack')).status).toBe(400)

    const s = (await boss.get<AdminStats>('/api/admin/stats?days=3')).body
    expect(s.usage).toEqual({
      totalUsers: 2,
      totalSingers: 1,
      totalPlays: 2,
      activeUsers: 2,
      newUsers: 1, // máy A đã dùng từ trước khoảng 3 ngày
      singers: 1,
      plays: 2,
      finishes: 1,
      composes: 1,
      saves: 1,
    })
    expect(s.daily.at(-1)).toMatchObject({
      date: '2026-10-31',
      activeUsers: 2,
      newUsers: 1,
      plays: 2,
      singers: 1,
      finishes: 1,
      composes: 1,
      saves: 1,
    })
  })
})

describe('thanh toán', () => {
  it('chế độ giả lập: checkout rồi dev-confirm cộng ngày Premium, gọi lại không cộng thêm', async () => {
    const { app, clock } = setup()
    const { c, user } = await register(app, 'mua@vidu.com')
    expect((await client(app).post('/api/billing/checkout', { planId: 'month' })).status).toBe(401)
    expect((await c.post('/api/billing/checkout', { planId: 'life' })).status).toBe(400)

    const plans = (await c.get<{ plans: { id: string; priceVnd: number }[] }>('/api/plans')).body.plans
    expect(plans.map((p) => [p.id, p.priceVnd])).toEqual([
      ['month', 29000],
      ['year', 249000],
    ])

    const co = (await c.post<CheckoutResult>('/api/billing/checkout', { planId: 'month' })).body
    expect(co).toMatchObject({ devMode: true, checkoutUrl: null })
    expect(Number.isSafeInteger(co.orderCode)).toBe(true)

    const paid = await c.post<{ order: Order; user: User }>('/api/billing/dev-confirm', { orderCode: co.orderCode })
    expect(paid.body.order.status).toBe('paid')
    expect(paid.body.user.plan).toBe('premium')
    expect(paid.body.user.premiumUntil).toBe('2026-11-30T03:00:00.000Z')
    await c.post('/api/billing/dev-confirm', { orderCode: co.orderCode })
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.premiumUntil).toBe('2026-11-30T03:00:00.000Z')

    // Mua tiếp khi còn hạn: cộng nối vào ngày hết hạn cũ
    const co2 = (await c.post<CheckoutResult>('/api/billing/checkout', { planId: 'year' })).body
    await c.post('/api/billing/dev-confirm', { orderCode: co2.orderCode })
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.premiumUntil).toBe('2027-11-30T03:00:00.000Z')

    // Đơn của người khác không xem được
    const { c: other } = await register(app, 'khac@vidu.com')
    expect((await other.get(`/api/billing/orders/${co.orderCode}`)).status).toBe(404)

    // Đơn chờ quá 30 phút thành hết hạn
    const co3 = (await c.post<CheckoutResult>('/api/billing/checkout', { planId: 'month' })).body
    clock.now = new Date(clock.now.getTime() + 31 * 60_000)
    expect((await c.get<{ order: Order }>(`/api/billing/orders/${co3.orderCode}`)).body.order.status).toBe('expired')
    const mine = (await c.get<{ items: Order[] }>('/api/billing/orders')).body.items
    expect(mine.map((o) => o.status).sort()).toEqual(['expired', 'paid', 'paid'])
    expect(user.id).toBe(mine[0].userId)
  })

  it('production chưa có PayOS: không cho thanh toán, tắt dev-confirm', async () => {
    const { app } = setup({ production: true })
    const { c } = await register(app, 'prod@vidu.com')
    expect((await c.post('/api/billing/checkout', { planId: 'month' })).status).toBe(503)
    expect((await c.post('/api/billing/dev-confirm', { orderCode: 1 })).status).toBe(404)
  })

  it('PayOS: tạo link có chữ ký, webhook đúng chữ ký thì kích hoạt, sai thì từ chối', async () => {
    const calls: { url: string; body: Record<string, unknown> | null }[] = []
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
      calls.push({ url, body })
      if (init?.method === 'POST') return Response.json({ code: '00', data: { checkoutUrl: 'https://pay.payos.vn/x' } })
      return Response.json({ code: '00', data: { status: 'PENDING', amount: 29000 } })
    }) as typeof fetch
    const { app, db } = setup({ payos: PAYOS, siteUrl: 'https://gk.vn' }, fakeFetch)
    const { c } = await register(app, 'payos@vidu.com')

    const co = (await c.post<CheckoutResult>('/api/billing/checkout', { planId: 'month' })).body
    expect(co).toMatchObject({ devMode: false, checkoutUrl: 'https://pay.payos.vn/x' })
    const sent = calls[0].body!
    expect(calls[0].url).toBe('https://payos.test/v2/payment-requests')
    expect(sent.returnUrl).toBe(`https://gk.vn/app/#/upgrade?order=${co.orderCode}`)
    expect(String(sent.description).length).toBeLessThanOrEqual(9)
    const signed = `amount=29000&cancelUrl=${sent.cancelUrl}&description=${sent.description}&orderCode=${co.orderCode}&returnUrl=${sent.returnUrl}`
    expect(sent.signature).toBe(createHmac('sha256', PAYOS.checksumKey).update(signed).digest('hex'))

    // PayOS báo còn chờ
    expect((await c.get<{ order: Order }>(`/api/billing/orders/${co.orderCode}`)).body.order.status).toBe('pending')

    const data = { orderCode: co.orderCode, amount: 29000, description: 'GKTHANG', code: '00', desc: 'success' }
    const hook = (body: unknown) =>
      app.request('/api/billing/payos-webhook', { method: 'POST', body: JSON.stringify(body) })

    expect((await hook({ code: '00', data, signature: signPayos(data, 'khoa-sai') })).status).toBe(400)
    expect((await hook({ code: '00', data: { ...data, amount: 1000 }, signature: signPayos(data) })).status).toBe(400)
    const wrongAmount = { ...data, amount: 1000 }
    expect((await hook({ code: '00', data: wrongAmount, signature: signPayos(wrongAmount) })).status).toBe(200)
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.plan).toBe('free')

    expect((await hook({ code: '00', data, signature: signPayos(data) })).status).toBe(200)
    expect((await hook({ code: '00', data, signature: signPayos(data) })).status).toBe(200) // gửi lại
    expect((await c.get<{ user: User }>('/api/auth/me')).body.user.premiumUntil).toBe('2026-11-30T03:00:00.000Z')

    // Webhook thử của PayOS (đơn không tồn tại) vẫn trả 200
    const test = { ...data, orderCode: 123 }
    expect((await hook({ code: '00', data: test, signature: signPayos(test) })).status).toBe(200)

    // Doanh thu hiện ở trang admin
    db.prepare(`UPDATE users SET role = 'admin' WHERE email = 'payos@vidu.com'`).run()
    const s = (await c.get<AdminStats>('/api/admin/stats')).body
    expect(s.revenue).toMatchObject({ totalVnd: 29000, inRangeVnd: 29000, paidOrders: 1 })
    expect(s.daily.at(-1)!.revenueVnd).toBe(29000)
    const orders = (await c.get<Paged<Order>>('/api/admin/orders?status=paid')).body
    expect(orders.items[0]).toMatchObject({ userEmail: 'payos@vidu.com', amountVnd: 29000 })
  })

  it('PayOS: quay lại từ trang thanh toán thì hỏi lại trạng thái và kích hoạt', async () => {
    const fakeFetch = (async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ code: '00', data: { checkoutUrl: 'https://pay.payos.vn/y' } })
        : Response.json({ code: '00', data: { status: 'PAID', amount: 249000 } })) as typeof fetch
    const { app } = setup({ payos: PAYOS }, fakeFetch)
    const { c } = await register(app, 'quaylai@vidu.com')
    const co = (await c.post<CheckoutResult>('/api/billing/checkout', { planId: 'year' })).body
    const res = await c.get<{ order: Order; user: User }>(`/api/billing/orders/${co.orderCode}`)
    expect(res.body.order.status).toBe('paid')
    expect(res.body.user.plan).toBe('premium')
  })
})

describe('seo', () => {
  it('robots.txt và sitemap.xml theo SITE_URL', async () => {
    const { app } = setup({ siteUrl: 'https://karaoke.vn' })
    const robots = await (await app.request('/robots.txt')).text()
    expect(robots).toContain('Disallow: /api/')
    expect(robots).toContain('Sitemap: https://karaoke.vn/sitemap.xml')
    const res = await app.request('/sitemap.xml')
    expect(res.headers.get('content-type')).toContain('xml')
    expect(await res.text()).toContain('<loc>https://karaoke.vn/</loc>')
  })

  it('API không tồn tại trả lỗi JSON', async () => {
    const { app } = setup()
    const res = await app.request('/api/khong-co')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Không tìm thấy API này.' })
  })
})
