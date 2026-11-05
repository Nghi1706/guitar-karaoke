import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { isPremium, useAuth } from '../auth/AuthContext'
import { AD_SECONDS, AD_SESSION_KEY, ADSENSE_CLIENT, ADSENSE_SLOT, adProvider } from '../config/ads'
import { ACCOUNTS_ENABLED, ADS_ENABLED } from '../config/features'
import { navigate } from '../lib/router'
import { Modal } from './Modal'

const PLACEMENT = 'pre-play'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

function AdSlot() {
  const provider = adProvider()

  useEffect(() => {
    if (provider !== 'adsense') return
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
    if (!document.querySelector(`script[src="${src}"]`)) {
      const s = document.createElement('script')
      s.async = true
      s.src = src
      s.crossOrigin = 'anonymous'
      document.head.appendChild(s)
    }
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // trình chặn quảng cáo: bỏ qua
    }
  }, [provider])

  if (provider === 'adsense') {
    return (
      <ins
        className="adsbygoogle ad-slot"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    )
  }

  // Banner nội bộ khi chưa gắn mạng quảng cáo
  return (
    <div className="ad-slot ad-house">
      <p className="ad-house-chord">G   Em   C   D</p>
      <p className="ad-house-title">Hát cả buổi không bị ngắt quãng</p>
      <p className="ad-house-text">
        Gói Premium tắt quảng cáo trên mọi thiết bị bạn đăng nhập. Từ 29.000đ một tháng, trả bằng mã QR ngân hàng.
      </p>
    </div>
  )
}

// Hook dùng ở App: gọi gate() trước khi phát. Trả về true nếu được phát tiếp.
export function useAdGate() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [left, setLeft] = useState(AD_SECONDS)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const finish = useCallback((ok: boolean, event: 'completed' | 'skipped' | 'upgrade_click') => {
    sessionStorage.setItem(AD_SESSION_KEY, '1')
    api.adEvent({ placement: PLACEMENT, event })
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }, [])

  const gate = useCallback((): Promise<boolean> => {
    if (!ADS_ENABLED || isPremium(user) || sessionStorage.getItem(AD_SESSION_KEY)) return Promise.resolve(true)
    setLeft(AD_SECONDS)
    setOpen(true)
    api.adEvent({ placement: PLACEMENT, event: 'shown' })
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [user])

  useEffect(() => {
    if (!open || left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [open, left])

  const element = (
    <Modal open={open} onClose={() => undefined} title="Quảng cáo" dismissable={false} className="ad-gate">
      <AdSlot />
      <div className="ad-actions">
        {ACCOUNTS_ENABLED && (
          <button
            className="btn-link"
            onClick={() => {
              finish(false, 'upgrade_click')
              navigate('upgrade')
            }}
          >
            Tắt quảng cáo với Premium
          </button>
        )}
        <button className="btn primary" disabled={left > 0} onClick={() => finish(true, 'completed')}>
          {left > 0 ? `Vào hát sau ${left} giây` : 'Vào hát'}
        </button>
      </div>
      <p className="hint">Mỗi lần mở web chỉ hiện một lần.</p>
    </Modal>
  )

  return { gate, element }
}
