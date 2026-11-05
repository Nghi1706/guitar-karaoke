// Kiểu dữ liệu dùng chung giữa web (src/) và server (server/).
// Mọi API nằm dưới /api, trả JSON. Lỗi trả { error: string } kèm mã HTTP 4xx/5xx,
// error là câu tiếng Việt hiển thị thẳng cho người dùng được.
// Đăng nhập bằng cookie httpOnly `gk_session`, web gọi fetch với credentials: 'include'.

export type Role = 'user' | 'admin'
export type UserStatus = 'active' | 'banned'
export type Plan = 'free' | 'premium'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  plan: Plan // tính từ premiumUntil: còn hạn thì 'premium'
  premiumUntil: string | null // ISO
  createdAt: string // ISO
}

// ---------- Auth ----------
// POST /api/auth/register  RegisterBody -> { user: User }
// POST /api/auth/login     LoginBody    -> { user: User }
// POST /api/auth/logout                 -> { ok: true }
// GET  /api/auth/me                     -> { user: User | null }
// POST /api/auth/password  ChangePasswordBody -> { ok: true }   (cần đăng nhập)
// PATCH /api/auth/me       { name: string } -> { user: User }   (cần đăng nhập)

export interface RegisterBody {
  email: string
  password: string // tối thiểu 8 ký tự
  name: string
}

export interface LoginBody {
  email: string
  password: string
}

export interface ChangePasswordBody {
  currentPassword: string
  newPassword: string
}

// ---------- Gói & thanh toán (PayOS / VietQR) ----------
// GET  /api/plans                            -> { plans: PlanOffer[] }
// POST /api/billing/checkout  { planId }     -> CheckoutResult        (cần đăng nhập)
// GET  /api/billing/orders                   -> { items: Order[] }    (đơn của tôi)
// GET  /api/billing/orders/:orderCode        -> { order: Order, user: User }
//      Nếu đơn đang pending và có PayOS thì server hỏi lại PayOS để cập nhật trạng thái.
// POST /api/billing/payos-webhook            PayOS gọi vào, server kiểm chữ ký rồi kích hoạt Premium.
// POST /api/billing/dev-confirm { orderCode } -> { order, user }
//      Chỉ có khi chưa cấu hình PayOS và không chạy production: giả lập thanh toán thành công.

export interface PlanOffer {
  id: 'month' | 'year'
  name: string
  priceVnd: number
  days: number
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired'

export interface Order {
  orderCode: number
  userId: string
  userEmail?: string // chỉ có trong API admin
  planId: PlanOffer['id']
  amountVnd: number
  status: OrderStatus
  createdAt: string
  paidAt: string | null
}

export interface CheckoutResult {
  orderCode: number
  checkoutUrl: string | null // trang thanh toán PayOS; null khi devMode
  devMode: boolean
}

// ---------- Góp ý / báo lỗi ----------
// POST /api/feedback  FeedbackBody -> { ok: true }   (không cần đăng nhập)

export type FeedbackType = 'feedback' | 'bug' | 'song' | 'other'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved'

export interface FeedbackBody {
  type: FeedbackType
  message: string // 5..2000 ký tự
  email?: string // khách chưa đăng nhập để lại email nếu muốn được trả lời
  page?: string // màn hình đang đứng khi gửi
}

export interface FeedbackItem {
  id: string
  type: FeedbackType
  message: string
  email: string | null
  userId: string | null
  userEmail: string | null
  page: string | null
  status: FeedbackStatus
  adminNote: string | null
  createdAt: string
}

// ---------- Quảng cáo ----------
// POST /api/ads/event  AdEventBody -> { ok: true }   (không cần đăng nhập)

export interface AdEventBody {
  placement: string // vd 'pre-play'
  event: 'shown' | 'completed' | 'skipped' | 'upgrade_click'
}

// ---------- Thống kê sử dụng ----------
// POST /api/usage/event  UsageEventBody -> { ok: true }   (không cần đăng nhập)

// open: mở app (mỗi phiên tab một lần), play: bấm phát, finish: phát tới hết bài,
// compose: ô soạn từ chưa có hợp âm nào thành có (dán hoặc gõ bài mới), save: lưu vào thư viện
export type UsageEvent = 'open' | 'play' | 'finish' | 'compose' | 'save'

export interface UsageEventBody {
  clientId: string // mã ngẫu nhiên của trình duyệt, lưu trong localStorage
  event: UsageEvent
}

// ---------- Admin (role = 'admin') ----------
// GET    /api/admin/stats?days=30                 -> AdminStats
// GET    /api/admin/users?q=&plan=&role=&status=&page=1&pageSize=20 -> Paged<User>
// PATCH  /api/admin/users/:id  AdminUserPatch     -> { user: User }
// DELETE /api/admin/users/:id                     -> { ok: true }  (không xoá được chính mình)
// GET    /api/admin/feedback?status=&type=&page=  -> Paged<FeedbackItem>
// PATCH  /api/admin/feedback/:id { status?, adminNote? } -> { item: FeedbackItem }
// GET    /api/admin/orders?status=&page=          -> Paged<Order>

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminUserPatch {
  name?: string
  role?: Role
  status?: UserStatus
  premiumUntil?: string | null // admin cấp/thu hồi Premium tay
}

export interface DailyStat {
  date: string // YYYY-MM-DD
  signups: number
  revenueVnd: number
  adShown: number
  feedback: number
  activeUsers: number // số trình duyệt có dùng app trong ngày
  newUsers: number // số trình duyệt lần đầu dùng app trong ngày
  plays: number
  singers: number // số trình duyệt có bấm phát trong ngày
  finishes: number
  composes: number
  saves: number
}

export interface AdminStats {
  users: { total: number; premium: number; banned: number; newInRange: number }
  revenue: { totalVnd: number; inRangeVnd: number; paidOrders: number }
  feedback: { open: number; total: number }
  ads: { shown: number; completed: number; skipped: number; upgradeClicks: number } // trong khoảng ngày
  // Người dùng tính theo trình duyệt (mã ẩn danh): một người dùng 2 máy được đếm là 2
  usage: {
    totalUsers: number // từ trước tới nay
    totalSingers: number // từ trước tới nay, số trình duyệt đã từng bấm phát
    totalPlays: number // từ trước tới nay
    activeUsers: number // các số dưới đây tính trong khoảng ngày
    newUsers: number
    singers: number
    plays: number
    finishes: number
    composes: number
    saves: number
  }
  daily: DailyStat[] // đủ từng ngày trong khoảng, ngày không có số liệu thì 0
}
