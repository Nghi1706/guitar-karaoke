import { useEffect, useState } from 'react'
import type { Order, PlanOffer } from '../../shared/api'
import { api, fmtDate, fmtVnd } from '../api/client'
import { isPremium, useAuth } from '../auth/AuthContext'
import { href } from '../lib/router'

type Pending = { orderCode: number; devMode: boolean }

export function UpgradePage({ query }: { query: URLSearchParams }) {
  const { user, setUser } = useAuth()
  const [plans, setPlans] = useState<PlanOffer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<PlanOffer['id'] | null>(null)
  const [dev, setDev] = useState<Pending | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const returnedCode = Number(query.get('order')) || null
  const cancelled = query.get('cancel') === '1'

  useEffect(() => {
    api
      .plans()
      .then((r) => setPlans(r.plans))
      .catch((e) => setError((e as Error).message))
  }, [])

  // Quay về từ trang PayOS: hỏi server trạng thái đơn, đơn còn chờ thì hỏi lại vài giây một lần
  useEffect(() => {
    if (!returnedCode || !user) return
    let stop = false
    let tries = 0
    const check = async () => {
      try {
        const r = await api.order(returnedCode)
        if (stop) return
        setOrder(r.order)
        if (r.user) setUser(r.user)
        if (r.order.status === 'pending' && !cancelled && tries++ < 40) setTimeout(check, 3000)
      } catch (e) {
        if (!stop) setError((e as Error).message)
      }
    }
    check()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedCode, user?.id])

  const buy = async (planId: PlanOffer['id']) => {
    setError(null)
    setBusy(planId)
    try {
      const r = await api.checkout(planId)
      if (r.devMode || !r.checkoutUrl) setDev({ orderCode: r.orderCode, devMode: true })
      else window.location.href = r.checkoutUrl
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const devPay = async () => {
    if (!dev) return
    try {
      const r = await api.devConfirm(dev.orderCode)
      setOrder(r.order)
      setUser(r.user)
      setDev(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const premium = isPremium(user)
  const monthly = plans?.find((p) => p.id === 'month')

  return (
    <div className="page">
      <h1 className="page-title">Hát không quảng cáo</h1>
      <p className="page-lead">
        Bản miễn phí đủ mọi tính năng, chỉ có một quảng cáo ngắn mỗi lần mở web. Premium tắt quảng cáo đó trên mọi
        thiết bị bạn đăng nhập.
      </p>

      {order?.status === 'paid' && (
        <div className="notice ok">
          Đã thanh toán. Premium của bạn dùng đến hết ngày {fmtDate(user?.premiumUntil ?? null)}.
        </div>
      )}
      {order?.status === 'pending' && !cancelled && (
        <div className="notice">Đang chờ ngân hàng xác nhận đơn {order.orderCode}. Trang sẽ tự cập nhật.</div>
      )}
      {cancelled && <div className="notice">Bạn đã huỷ thanh toán. Chưa có khoản tiền nào bị trừ.</div>}
      {premium && order?.status !== 'paid' && (
        <div className="notice ok">Bạn đang dùng Premium đến hết ngày {fmtDate(user?.premiumUntil ?? null)}. Mua thêm sẽ được cộng dồn.</div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="plans">
        <article className="plan">
          <h2>Miễn phí</h2>
          <p className="plan-price">0đ</p>
          <ul>
            <li>Đệm đàn theo 4 điệu, đổi tông, capo</li>
            <li>Lời chạy theo nhạc, sơ đồ hợp âm</li>
            <li>Một quảng cáo mỗi lần mở web</li>
          </ul>
        </article>

        {(plans ?? []).map((p) => (
          <article key={p.id} className={`plan ${p.id === 'year' ? 'plan-featured' : ''}`}>
            <h2>{p.name}</h2>
            <p className="plan-price">
              {fmtVnd(p.priceVnd)}
              <small>/{p.id === 'year' ? 'năm' : 'tháng'}</small>
            </p>
            {p.id === 'year' && monthly && (
              <p className="plan-save">
                Rẻ hơn {fmtVnd(monthly.priceVnd * 12 - p.priceVnd)} so với trả theo tháng
              </p>
            )}
            <ul>
              <li>Mọi thứ của bản miễn phí</li>
              <li>Không quảng cáo trong {p.days} ngày</li>
              <li>Trả bằng mã QR ngân hàng, không tự gia hạn</li>
            </ul>
            {user ? (
              <button className="btn primary" disabled={busy !== null} onClick={() => buy(p.id)}>
                {busy === p.id ? 'Đang tạo mã QR…' : premium ? 'Mua thêm' : 'Thanh toán'}
              </button>
            ) : (
              <a className="btn primary" href={href('account')}>
                Đăng nhập để mua
              </a>
            )}
          </article>
        ))}
      </div>

      {dev && (
        <div className="notice dev">
          <p>
            Máy chủ chưa cấu hình PayOS nên đang chạy chế độ thử. Đơn {dev.orderCode} đã được tạo, bấm nút dưới để giả
            lập ngân hàng báo đã nhận tiền.
          </p>
          <button className="btn" onClick={devPay}>
            Giả lập thanh toán thành công
          </button>
        </div>
      )}

      <p className="hint">
        Thanh toán qua PayOS bằng VietQR: quét mã bằng app ngân hàng bất kỳ, Premium bật ngay khi tiền về. Cần hỗ trợ
        thì gửi góp ý kèm mã đơn.
      </p>
    </div>
  )
}
