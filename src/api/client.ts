// Gọi API server (cùng domain, dev thì Vite chuyển /api sang server Node).

import type {
  AdEventBody,
  AdminStats,
  AdminUserPatch,
  CheckoutResult,
  FeedbackBody,
  FeedbackItem,
  FeedbackStatus,
  LoginBody,
  Order,
  Paged,
  PlanOffer,
  RegisterBody,
  UsageEventBody,
  User,
} from '../../shared/api'
import { SERVER_ENABLED } from '../config/features'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Query = Record<string, string | number | undefined>

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const qs = query
    ? new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ''
  // Web tĩnh không có server: báo lỗi ngay, không gửi request đi đâu cả
  if (!SERVER_ENABLED) throw new ApiError(0, 'Bản web này không có máy chủ.')
  let res: Response
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Máy chủ báo lỗi ${res.status}.`)
  return data as T
}

const get = <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query)
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body)
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)

export const api = {
  me: () => get<{ user: User | null }>('/auth/me'),
  login: (b: LoginBody) => post<{ user: User }>('/auth/login', b),
  register: (b: RegisterBody) => post<{ user: User }>('/auth/register', b),
  logout: () => post<{ ok: true }>('/auth/logout'),
  updateMe: (name: string) => patch<{ user: User }>('/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: true }>('/auth/password', { currentPassword, newPassword }),

  plans: () => get<{ plans: PlanOffer[] }>('/plans'),
  checkout: (planId: PlanOffer['id']) => post<CheckoutResult>('/billing/checkout', { planId }),
  myOrders: () => get<{ items: Order[] }>('/billing/orders'),
  order: (code: number) => get<{ order: Order; user: User | null }>(`/billing/orders/${code}`),
  devConfirm: (orderCode: number) => post<{ order: Order; user: User }>('/billing/dev-confirm', { orderCode }),

  feedback: (b: FeedbackBody) => post<{ ok: true }>('/feedback', b),
  adEvent: (b: AdEventBody) => post<{ ok: true }>('/ads/event', b).catch(() => undefined), // không chặn người dùng
  usageEvent: (b: UsageEventBody) => post<{ ok: true }>('/usage/event', b).catch(() => undefined),

  admin: {
    stats: (days: number) => get<AdminStats>('/admin/stats', { days }),
    users: (q: Query) => get<Paged<User>>('/admin/users', q),
    updateUser: (id: string, p: AdminUserPatch) => patch<{ user: User }>(`/admin/users/${id}`, p),
    deleteUser: (id: string) => request<{ ok: true }>('DELETE', `/admin/users/${id}`, {}),
    feedback: (q: Query) => get<Paged<FeedbackItem>>('/admin/feedback', q),
    updateFeedback: (id: string, p: { status?: FeedbackStatus; adminNote?: string }) =>
      patch<{ item: FeedbackItem }>(`/admin/feedback/${id}`, p),
    orders: (q: Query) => get<Paged<Order>>('/admin/orders', q),
  },
}

export const fmtVnd = (n: number) => n.toLocaleString('vi-VN') + 'đ'
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'
