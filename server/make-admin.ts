// Cấp quyền admin cho một tài khoản đã đăng ký: npm run make-admin -- email@vidu.com

import { existsSync } from 'node:fs'
import { loadConfig } from './config.ts'
import { openDb } from './db.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Cách dùng: npm run make-admin -- email@vidu.com')
  process.exit(1)
}

const db = openDb(loadConfig().dbPath)
const res = db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run(email)
db.close()
if (res.changes) console.log(`Đã cấp quyền admin cho ${email}.`)
else {
  console.error(`Chưa có tài khoản ${email}. Đăng ký trên web trước rồi chạy lại lệnh này.`)
  process.exit(1)
}
