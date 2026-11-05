// Điều hướng bằng hash (#/hat, #/admin...) để server tĩnh nào cũng phục vụ được, không cần cấu hình rewrite.

import { useEffect, useState } from 'react'

export type Route = 'soan' | 'hat' | 'account' | 'upgrade' | 'admin'
const ROUTES: Route[] = ['soan', 'hat', 'account', 'upgrade', 'admin']

export interface Location {
  route: Route | null // null: hash trống hoặc không hợp lệ
  query: URLSearchParams
}

function read(): Location {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, qs = ''] = raw.split('?')
  const route = ROUTES.includes(path as Route) ? (path as Route) : null
  return { route, query: new URLSearchParams(qs) }
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(read)
  useEffect(() => {
    const on = () => setLoc(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return loc
}

export function navigate(route: Route, query?: Record<string, string>) {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  window.location.hash = `/${route}${qs}`
}

export const href = (route: Route) => `#/${route}`
