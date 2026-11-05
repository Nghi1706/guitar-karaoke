import { useCallback, useEffect, useState } from 'react'
import type {
  AdminStats,
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
  Order,
  OrderStatus,
  Paged,
  User,
} from '../../shared/api'
import { api, fmtDate, fmtDateTime, fmtVnd } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { BarChart } from '../components/BarChart'
import { ACCOUNTS_ENABLED, ADS_ENABLED } from '../config/features'
import { href } from '../lib/router'

type Tab = 'overview' | 'users' | 'feedback' | 'orders'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'users', label: 'Người dùng' },
  { id: 'feedback', label: 'Góp ý' },
  { id: 'orders', label: 'Đơn hàng' },
]

const FEEDBACK_TYPE: Record<FeedbackType, string> = {
  feedback: 'Góp ý',
  bug: 'Báo lỗi',
  song: 'Bài đánh sai',
  other: 'Khác',
}
const FEEDBACK_STATUS: Record<FeedbackStatus, string> = {
  open: 'Chưa xử lý',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xong',
}
const ORDER_STATUS: Record<OrderStatus, string> = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  cancelled: 'Đã huỷ',
  expired: 'Hết hạn',
}

const PAGE_SIZE = 20

export default function AdminPage() {
  const { user, ready } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')

  if (!ready) return <div className="page-loading">Đang tải…</div>
  if (user?.role !== 'admin')
    return (
      <div className="page narrow">
        <h1 className="page-title">Quản trị</h1>
        <p>Trang này chỉ dành cho quản trị viên.</p>
        <a className="btn" href={href(user ? 'hat' : 'account')}>
          {user ? 'Về trang hát' : 'Đăng nhập'}
        </a>
      </div>
    )

  return (
    <div className="page wide-page">
      <h1 className="page-title">Quản trị</h1>
      <div className="segmented admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users me={user} />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'orders' && <Orders />}
    </div>
  )
}

// ---------- Tổng quan ----------

function Overview() {
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    setError(null)
    api.admin
      .stats(days)
      .then(setStats)
      .catch((e) => setError((e as Error).message))
  }, [days])

  if (error) return <p className="error">{error}</p>
  if (!stats) return <p className="hint">Đang tải số liệu…</p>

  const label = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const pct = stats.ads.shown ? Math.round((stats.ads.completed / stats.ads.shown) * 100) : 0
  const num = (n: number) => n.toLocaleString('vi-VN')
  const usage = stats.usage

  return (
    <div className="stack-l">
      <div className="toolbar">
        <label className="field-inline">
          Khoảng thời gian
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
        </label>
        <span className="grow" />
        <button className="btn ghost small" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Người dùng {days} ngày</span>
          <b className="tile-value">{num(usage.activeUsers)}</b>
          <span className="hint">
            {num(usage.newUsers)} người mới, tổng từ trước tới nay {num(usage.totalUsers)}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Người đã hát {days} ngày</span>
          <b className="tile-value">{num(usage.singers)}</b>
          <span className="hint">tổng từ trước tới nay {num(usage.totalSingers)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Lượt hát {days} ngày</span>
          <b className="tile-value">{num(usage.plays)}</b>
          <span className="hint">
            {num(usage.finishes)} lượt hát hết bài, tổng từ trước tới nay {num(usage.totalPlays)}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Bài soạn mới {days} ngày</span>
          <b className="tile-value">{num(usage.composes)}</b>
          <span className="hint">{num(usage.saves)} lượt lưu vào thư viện</span>
        </div>
        <div className="tile">
          <span className="tile-label">Góp ý chưa xử lý</span>
          <b className="tile-value">{num(stats.feedback.open)}</b>
          <span className="hint">trên tổng {num(stats.feedback.total)}</span>
        </div>
        {ACCOUNTS_ENABLED && (
          <>
            <div className="tile">
              <span className="tile-label">Tài khoản</span>
              <b className="tile-value">{num(stats.users.total)}</b>
              <span className="hint">
                +{num(stats.users.newInRange)} trong {days} ngày
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">Đang dùng Premium</span>
              <b className="tile-value">{num(stats.users.premium)}</b>
              <span className="hint">{stats.users.banned} tài khoản bị khoá</span>
            </div>
            <div className="tile">
              <span className="tile-label">Doanh thu {days} ngày</span>
              <b className="tile-value">{fmtVnd(stats.revenue.inRangeVnd)}</b>
              <span className="hint">tổng từ trước tới nay {fmtVnd(stats.revenue.totalVnd)}</span>
            </div>
          </>
        )}
        {ADS_ENABLED && (
          <div className="tile">
            <span className="tile-label">Quảng cáo đã hiện</span>
            <b className="tile-value">{num(stats.ads.shown)}</b>
            <span className="hint">
              {pct}% chờ hết giờ, {num(stats.ads.upgradeClicks)} lượt bấm nâng cấp
            </span>
          </div>
        )}
      </div>
      <p className="hint">
        Người dùng được đếm theo trình duyệt: một người dùng cả điện thoại lẫn máy tính tính là 2, xoá dữ liệu trình
        duyệt thì tính là người mới.
      </p>

      {asTable ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th className="num">Người dùng</th>
                <th className="num">Người mới</th>
                <th className="num">Người hát</th>
                <th className="num">Lượt hát</th>
                <th className="num">Hát hết bài</th>
                <th className="num">Soạn bài</th>
                <th className="num">Lưu bài</th>
                <th className="num">Góp ý</th>
                {ACCOUNTS_ENABLED && <th className="num">Đăng ký mới</th>}
                {ACCOUNTS_ENABLED && <th className="num">Doanh thu</th>}
                {ADS_ENABLED && <th className="num">Quảng cáo hiện</th>}
              </tr>
            </thead>
            <tbody>
              {[...stats.daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{fmtDate(d.date)}</td>
                  <td className="num">{d.activeUsers}</td>
                  <td className="num">{d.newUsers}</td>
                  <td className="num">{d.singers}</td>
                  <td className="num">{d.plays}</td>
                  <td className="num">{d.finishes}</td>
                  <td className="num">{d.composes}</td>
                  <td className="num">{d.saves}</td>
                  <td className="num">{d.feedback}</td>
                  {ACCOUNTS_ENABLED && <td className="num">{d.signups}</td>}
                  {ACCOUNTS_ENABLED && <td className="num">{fmtVnd(d.revenueVnd)}</td>}
                  {ADS_ENABLED && <td className="num">{d.adShown}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="charts">
          <BarChart
            title="Người dùng mỗi ngày"
            points={stats.daily.map((d) => ({ label: label(d.date), value: d.activeUsers }))}
            format={num}
          />
          <BarChart
            title="Lượt hát mỗi ngày"
            points={stats.daily.map((d) => ({ label: label(d.date), value: d.plays }))}
            format={num}
          />
          <BarChart
            title="Bài soạn mới mỗi ngày"
            points={stats.daily.map((d) => ({ label: label(d.date), value: d.composes }))}
            format={num}
          />
          <BarChart
            title="Góp ý mỗi ngày"
            points={stats.daily.map((d) => ({ label: label(d.date), value: d.feedback }))}
            format={num}
          />
          {ACCOUNTS_ENABLED && (
            <BarChart
              title="Đăng ký mới mỗi ngày"
              points={stats.daily.map((d) => ({ label: label(d.date), value: d.signups }))}
              format={num}
            />
          )}
          {ACCOUNTS_ENABLED && (
            <BarChart
              title="Doanh thu mỗi ngày"
              points={stats.daily.map((d) => ({ label: label(d.date), value: d.revenueVnd }))}
              format={fmtVnd}
            />
          )}
          {ADS_ENABLED && (
            <BarChart
              title="Quảng cáo hiện mỗi ngày"
              points={stats.daily.map((d) => ({ label: label(d.date), value: d.adShown }))}
              format={num}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Dữ liệu phân trang ----------

function usePaged<T>(load: (page: number) => Promise<Paged<T>>, deps: unknown[]) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<T> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  useEffect(() => setPage(1), [run])
  useEffect(() => {
    let live = true // bỏ kết quả của lần gọi cũ nếu bộ lọc đã đổi
    setError(null)
    run(page)
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [run, page, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { page, setPage, data, setData, error, reload }
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (pages <= 1) return null
  return (
    <div className="pager">
      <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trang trước
      </button>
      <span className="hint">
        Trang {page}/{pages}
      </span>
      <button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Trang sau
      </button>
    </div>
  )
}

// ---------- Người dùng ----------

function Users({ me }: { me: User }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const { page, setPage, data, error, reload } = usePaged(
    (p) => api.admin.users({ q: search, plan, status, page: p, pageSize: PAGE_SIZE }),
    [search, plan, status],
  )

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg(null)
    try {
      await fn()
      setMsg(done)
      reload()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  const addPremium = (u: User, days: number) => {
    const from = Math.max(Date.now(), u.premiumUntil ? Date.parse(u.premiumUntil) : 0)
    return act(
      () => api.admin.updateUser(u.id, { premiumUntil: new Date(from + days * 864e5).toISOString() }),
      `Đã cộng ${days} ngày Premium cho ${u.email}.`,
    )
  }

  return (
    <div className="stack-l">
      <div className="toolbar">
        <input
          className="grow"
          type="search"
          placeholder="Tìm theo email hoặc tên"
          aria-label="Tìm người dùng"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Lọc theo gói">
          <option value="">Mọi gói</option>
          <option value="free">Miễn phí</option>
          <option value="premium">Premium</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc theo trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="banned">Bị khoá</option>
        </select>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="hint">{data.total} tài khoản</p>
          <div className="table-wrap">
            <table className="table cards-on-phone">
              <thead>
                <tr>
                  <th>Tài khoản</th>
                  <th>Gói</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const self = u.id === me.id
                  return (
                    <tr key={u.id}>
                      <td data-label="Tài khoản">
                        <b>{u.name || '(chưa có tên)'}</b>
                        <div className="hint">{u.email}</div>
                      </td>
                      <td data-label="Gói">
                        {u.plan === 'premium' ? (
                          <span className="badge brass">Premium đến {fmtDate(u.premiumUntil)}</span>
                        ) : (
                          'Miễn phí'
                        )}
                      </td>
                      <td data-label="Vai trò">{u.role === 'admin' ? <span className="badge">Admin</span> : 'Người dùng'}</td>
                      <td data-label="Trạng thái">
                        {u.status === 'banned' ? <span className="badge danger">Bị khoá</span> : 'Hoạt động'}
                      </td>
                      <td data-label="Ngày tạo">{fmtDate(u.createdAt)}</td>
                      <td data-label="Thao tác">
                        <div className="actions">
                          <button className="btn small" onClick={() => addPremium(u, 30)}>
                            +30 ngày
                          </button>
                          {u.plan === 'premium' && (
                            <button
                              className="btn small"
                              onClick={() =>
                                confirm(`Thu hồi Premium của ${u.email}?`) &&
                                act(() => api.admin.updateUser(u.id, { premiumUntil: null }), 'Đã thu hồi Premium.')
                              }
                            >
                              Thu hồi Premium
                            </button>
                          )}
                          {!self && (
                            <button
                              className="btn small"
                              onClick={() =>
                                act(
                                  () => api.admin.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }),
                                  u.role === 'admin' ? 'Đã bỏ quyền admin.' : 'Đã cấp quyền admin.',
                                )
                              }
                            >
                              {u.role === 'admin' ? 'Bỏ admin' : 'Cấp admin'}
                            </button>
                          )}
                          {!self && (
                            <button
                              className="btn small danger"
                              onClick={() =>
                                act(
                                  () =>
                                    api.admin.updateUser(u.id, { status: u.status === 'banned' ? 'active' : 'banned' }),
                                  u.status === 'banned' ? 'Đã mở khoá.' : 'Đã khoá tài khoản.',
                                )
                              }
                            >
                              {u.status === 'banned' ? 'Mở khoá' : 'Khoá'}
                            </button>
                          )}
                          {!self && (
                            <button
                              className="btn small danger"
                              onClick={() =>
                                confirm(`Xoá hẳn tài khoản ${u.email}? Không khôi phục được.`) &&
                                act(() => api.admin.deleteUser(u.id), 'Đã xoá tài khoản.')
                              }
                            >
                              Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="hint">Không có tài khoản nào khớp bộ lọc.</p>}
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// ---------- Góp ý ----------

function Feedback() {
  const [status, setStatus] = useState<FeedbackStatus | ''>('open')
  const [type, setType] = useState<FeedbackType | ''>('')
  const { page, setPage, data, setData, error } = usePaged(
    (p) => api.admin.feedback({ status, type, page: p, pageSize: PAGE_SIZE }),
    [status, type],
  )

  const replace = (item: FeedbackItem) =>
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === item.id ? item : x)) })

  return (
    <div className="stack-l">
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | '')} aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as FeedbackType | '')} aria-label="Loại">
          <option value="">Mọi loại</option>
          {Object.entries(FEEDBACK_TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="hint">{data.total} góp ý</p>
          {data.items.length === 0 && <p className="hint">Không còn góp ý nào ở mục này.</p>}
          <ul className="feedback-list">
            {data.items.map((f) => (
              <FeedbackCard key={f.id} item={f} onChange={replace} />
            ))}
          </ul>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}

function FeedbackCard({ item, onChange }: { item: FeedbackItem; onChange: (f: FeedbackItem) => void }) {
  const [note, setNote] = useState(item.adminNote ?? '')
  const [err, setErr] = useState<string | null>(null)

  const save = async (p: { status?: FeedbackStatus; adminNote?: string }) => {
    setErr(null)
    try {
      onChange((await api.admin.updateFeedback(item.id, p)).item)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const from = item.userEmail ?? item.email
  return (
    <li className={`card feedback-card fb-${item.status}`}>
      <div className="feedback-meta">
        <span className="badge">{FEEDBACK_TYPE[item.type]}</span>
        <span className="hint">
          {from ? (
            <a href={`mailto:${from}`}>{from}</a>
          ) : (
            'Khách không để lại email'
          )}
          {item.page && `, ở màn ${item.page}`}, {fmtDateTime(item.createdAt)}
        </span>
      </div>
      <p className="feedback-msg">{item.message}</p>
      <div className="feedback-actions">
        <select
          value={item.status}
          onChange={(e) => save({ status: e.target.value as FeedbackStatus })}
          aria-label="Đổi trạng thái"
        >
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="grow"
          placeholder="Ghi chú nội bộ"
          aria-label="Ghi chú nội bộ"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn small" disabled={note === (item.adminNote ?? '')} onClick={() => save({ adminNote: note })}>
          Lưu ghi chú
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </li>
  )
}

// ---------- Đơn hàng ----------

function Orders() {
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const { page, setPage, data, error } = usePaged<Order>(
    (p) => api.admin.orders({ status, page: p, pageSize: PAGE_SIZE }),
    [status],
  )

  return (
    <div className="stack-l">
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')} aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="hint">{data.total} đơn</p>
          <div className="table-wrap">
            <table className="table cards-on-phone">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Tài khoản</th>
                  <th>Gói</th>
                  <th className="num">Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Tạo lúc</th>
                  <th>Thanh toán lúc</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.orderCode}>
                    <td data-label="Mã đơn">{o.orderCode}</td>
                    <td data-label="Tài khoản">{o.userEmail ?? o.userId}</td>
                    <td data-label="Gói">{o.planId === 'year' ? '1 năm' : '1 tháng'}</td>
                    <td data-label="Số tiền" className="num">
                      {fmtVnd(o.amountVnd)}
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`status status-${o.status}`}>{ORDER_STATUS[o.status]}</span>
                    </td>
                    <td data-label="Tạo lúc">{fmtDateTime(o.createdAt)}</td>
                    <td data-label="Thanh toán lúc">{fmtDateTime(o.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="hint">Chưa có đơn nào.</p>}
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
