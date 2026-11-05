import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

// Mốc chia màn hình, khớp với App.css
export const WIDE = '(min-width: 1100px)' // PC: cột tuỳ chỉnh luôn hiện
export const PHONE = '(max-width: 719px)' // điện thoại: thanh tab dưới đáy
