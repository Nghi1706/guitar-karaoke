// Đọc cấu hình từ biến môi trường (xem .env.example).

export interface PayosConfig {
  clientId: string
  apiKey: string
  checksumKey: string
  baseUrl: string
}

export interface Config {
  port: number
  siteUrl: string // không có dấu / ở cuối
  production: boolean
  adminEmails: string[]
  dbPath: string
  payos: PayosConfig | null // null = chưa cấu hình, chạy chế độ giả lập thanh toán (chỉ khi không phải production)
  prices: { month: number; year: number }
  trustProxy: boolean // chạy sau nginx/Cloudflare thì bật để lấy IP thật từ X-Forwarded-For
  statsUtcOffsetHours: number // thống kê theo ngày dùng giờ Việt Nam (UTC+7)
}

type Env = Record<string, string | undefined>

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? Math.trunc(n) : fallback
}

export function loadConfig(env: Env = process.env, argv: string[] = process.argv): Config {
  const production = env.NODE_ENV === 'production' || argv.includes('--prod')
  const port = int(env.PORT, 8787)
  const { PAYOS_CLIENT_ID: clientId, PAYOS_API_KEY: apiKey, PAYOS_CHECKSUM_KEY: checksumKey } = env
  return {
    port,
    siteUrl: (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    production,
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    dbPath: env.DB_PATH || 'data/app.db',
    payos:
      clientId && apiKey && checksumKey
        ? { clientId, apiKey, checksumKey, baseUrl: env.PAYOS_BASE_URL || 'https://api-merchant.payos.vn' }
        : null,
    prices: { month: int(env.PRICE_MONTH_VND, 29000), year: int(env.PRICE_YEAR_VND, 249000) },
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    statsUtcOffsetHours: int(env.STATS_UTC_OFFSET_HOURS, 7),
  }
}
