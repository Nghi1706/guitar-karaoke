// SQLite có sẵn trong Node (node:sqlite), không cần cài database riêng.
// Thêm thay đổi schema thì thêm một phần tử vào MIGRATIONS, không sửa phần tử cũ.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type DB = DatabaseSync

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    premium_until TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX users_created ON users(created_at);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE orders (
    order_code INTEGER PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    plan_id TEXT NOT NULL,
    amount_vnd INTEGER NOT NULL,
    days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    checkout_url TEXT,
    created_at TEXT NOT NULL,
    paid_at TEXT
  );
  CREATE INDEX orders_user ON orders(user_id);
  CREATE INDEX orders_paid ON orders(status, paid_at);

  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    email TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    page TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    admin_note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX feedback_created ON feedback(created_at);

  CREATE TABLE ad_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placement TEXT NOT NULL,
    event TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ad_events_created ON ad_events(created_at);
  `,
  `
  -- Lượt dùng ẩn danh: client_id là mã ngẫu nhiên mỗi trình duyệt tự tạo, không gắn với tài khoản
  CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    event TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX usage_events_created ON usage_events(created_at);
  CREATE INDEX usage_events_client ON usage_events(client_id, created_at);
  `,
]

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: DB) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

// Chạy fn trong một transaction, lỗi thì rollback
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
