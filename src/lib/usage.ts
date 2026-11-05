// Đếm lượt dùng ẩn danh để biết bao nhiêu người dùng, bao nhiêu lượt hát.
// Mỗi trình duyệt tự tạo một mã ngẫu nhiên, không gửi lời bài hát hay thông tin cá nhân.

import type { UsageEvent } from '../../shared/api'
import { api } from '../api/client'

const CLIENT_KEY = 'gk.clientId' // localStorage: giữ qua các lần mở web
const OPENED_KEY = 'gk.opened' // sessionStorage: mỗi phiên tab chỉ đếm 1 lần mở

function clientId(): string | null {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    return null // trình duyệt chặn lưu trữ: bỏ qua, không đếm
  }
}

export function track(event: UsageEvent) {
  const id = clientId()
  if (id) api.usageEvent({ clientId: id, event })
}

export function trackOpen() {
  try {
    if (sessionStorage.getItem(OPENED_KEY)) return
    sessionStorage.setItem(OPENED_KEY, '1')
  } catch {
    return
  }
  track('open')
}
