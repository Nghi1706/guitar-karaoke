import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LoginBody, RegisterBody, User } from '../../shared/api'
import { api } from '../api/client'

interface AuthState {
  user: User | null
  ready: boolean // đã hỏi server xong chưa
  offline: boolean // không gọi được server: app vẫn chạy như khách
  login: (b: LoginBody) => Promise<User>
  register: (b: RegisterBody) => Promise<User>
  logout: () => Promise<void>
  setUser: (u: User | null) => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await api.me()
      setUser(r.user)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      offline,
      setUser,
      refresh,
      login: async (b) => {
        const r = await api.login(b)
        setUser(r.user)
        return r.user
      },
      register: async (b) => {
        const r = await api.register(b)
        setUser(r.user)
        return r.user
      },
      logout: async () => {
        await api.logout().catch(() => undefined)
        setUser(null)
      },
    }),
    [user, ready, offline, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider')
  return v
}

export const isPremium = (u: User | null) => u?.plan === 'premium'
