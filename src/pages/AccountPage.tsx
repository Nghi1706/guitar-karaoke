import { type FormEvent, useEffect, useState } from 'react'
import type { Order } from '../../shared/api'
import { api, fmtDate, fmtDateTime, fmtVnd } from '../api/client'
import { isPremium, useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { ACCOUNTS_ENABLED } from '../config/features'
import { href } from '../lib/router'

const ORDER_STATUS: Record<Order['status'], string> = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  cancelled: 'Đã huỷ',
  expired: 'Hết hạn',
}

export function AccountPage({ onFeedback }: { onFeedback: () => void }) {
  const { user, ready, offline } = useAuth()
  if (!ready) return <div className="page-loading">Đang tải…</div>
  if (offline && !user)
    return (
      <div className="page narrow">
        <h1 className="page-title">Tài khoản</h1>
        <p className="error">
          Chưa kết nối được máy chủ tài khoản. Bạn vẫn soạn và hát được bình thường, bài được lưu trên trình duyệt này.
        </p>
      </div>
    )
  return user ? <Profile onFeedback={onFeedback} /> : <AuthForms />
}

function AuthForms() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login({ email: email.trim(), password })
      else await register({ email: email.trim(), password, name: name.trim() })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <h1 className="page-title">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
      {ACCOUNTS_ENABLED ? (
        <>
          <p className="page-lead">
            Không cần tài khoản vẫn hát được. Có tài khoản thì bạn nâng cấp Premium để tắt quảng cáo trên mọi máy.
          </p>

          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>
              Đăng nhập
            </button>
            <button role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>
              Tạo tài khoản
            </button>
          </div>
        </>
      ) : (
        <p className="page-lead">Trang này dành cho quản trị viên. Bạn không cần tài khoản để hát.</p>
      )}

      <form className="stack card" onSubmit={submit}>
        {mode === 'register' && (
          <label className="field">
            <span>Tên hiển thị</span>
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <label className="field">
          <span>Mật khẩu{mode === 'register' && ' (ít nhất 8 ký tự)'}</span>
          <input
            type="password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>
    </div>
  )
}

function Profile({ onFeedback }: { onFeedback: () => void }) {
  const { user, setUser, logout } = useAuth()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [nameMsg, setNameMsg] = useState<string | null>(null)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api
      .myOrders()
      .then((r) => setOrders(r.items))
      .catch(() => setOrders([]))
  }, [])

  if (!user) return null
  const premium = isPremium(user)

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await api.updateMe(name.trim())
      setUser(r.user)
      setNameMsg('Đã đổi tên.')
    } catch (err) {
      setNameMsg((err as Error).message)
    }
  }

  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      setPwMsg({ ok: true, text: 'Đã đổi mật khẩu.' })
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <div className="page narrow">
      <h1 className="page-title">Xin chào, {user.name || user.email}</h1>

      <section className={`card plan-card ${premium ? 'is-premium' : ''}`}>
        <div>
          <h2>{premium ? 'Gói Premium' : 'Gói miễn phí'}</h2>
          <p className="hint">
            {premium
              ? `Không có quảng cáo đến hết ngày ${fmtDate(user.premiumUntil)}.`
              : 'Mỗi lần mở web sẽ có một quảng cáo ngắn trước khi phát.'}
          </p>
        </div>
        <a className={`btn ${premium ? '' : 'primary'}`} href={href('upgrade')}>
          <Icon name="star" /> {premium ? 'Gia hạn' : 'Nâng cấp Premium'}
        </a>
      </section>

      <section className="card stack">
        <h2>Thông tin</h2>
        <p className="hint">Email đăng nhập: {user.email}</p>
        <form className="inline-form" onSubmit={saveName}>
          <label className="field grow">
            <span>Tên hiển thị</span>
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" disabled={!name.trim() || name.trim() === user.name}>
            Lưu tên
          </button>
        </form>
        {nameMsg && <p className="hint">{nameMsg}</p>}
      </section>

      <section className="card stack">
        <h2>Đổi mật khẩu</h2>
        <form className="stack" onSubmit={changePw}>
          <label className="field">
            <span>Mật khẩu hiện tại</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Mật khẩu mới (ít nhất 8 ký tự)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </label>
          {pwMsg && <p className={pwMsg.ok ? 'ok' : 'error'}>{pwMsg.text}</p>}
          <button className="btn">Đổi mật khẩu</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Lịch sử thanh toán</h2>
        {orders === null ? (
          <p className="hint">Đang tải…</p>
        ) : orders.length === 0 ? (
          <p className="hint">Chưa có giao dịch nào.</p>
        ) : (
          <ul className="plain-list">
            {orders.map((o) => (
              <li key={o.orderCode}>
                <span>
                  {o.planId === 'year' ? 'Premium 1 năm' : 'Premium 1 tháng'}
                  <span className="hint"> mã {o.orderCode}, {fmtDateTime(o.createdAt)}</span>
                </span>
                <span className={`status status-${o.status}`}>
                  {fmtVnd(o.amountVnd)}, {ORDER_STATUS[o.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="row-actions">
        <button className="btn ghost" onClick={onFeedback}>
          <Icon name="message" /> Gửi góp ý
        </button>
        {user.role === 'admin' && (
          <a className="btn ghost" href={href('admin')}>
            <Icon name="shield" /> Quản trị
          </a>
        )}
        <span className="grow" />
        <button className="btn danger" onClick={logout}>
          <Icon name="logout" /> Đăng xuất
        </button>
      </div>
    </div>
  )
}
