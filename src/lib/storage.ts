// Lưu bài trong trình duyệt (localStorage).

import { DEFAULT_SETTINGS, type Settings } from './arrange'

export interface SavedSong {
  id: string
  title: string
  text: string
  settings: Settings
  durations: Record<number, number>
  updatedAt: number
}

const CURRENT_KEY = 'gk.current'
const LIBRARY_KEY = 'gk.library'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function newSong(): SavedSong {
  return {
    id: crypto.randomUUID(),
    title: '',
    text: '',
    settings: { ...DEFAULT_SETTINGS },
    durations: {},
    updatedAt: Date.now(),
  }
}

// Bài lưu từ bản cũ có thể thiếu tuỳ chỉnh mới thêm, bù bằng giá trị mặc định
const withDefaults = (s: SavedSong): SavedSong => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } })

export function loadCurrent(): SavedSong {
  const s = read<SavedSong | null>(CURRENT_KEY, null)
  return s ? withDefaults(s) : newSong()
}

export function saveCurrent(song: SavedSong) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(song))
}

export function loadLibrary(): SavedSong[] {
  return read<SavedSong[]>(LIBRARY_KEY, [])
    .map(withDefaults)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveToLibrary(song: SavedSong): SavedSong[] {
  const lib = loadLibrary().filter((s) => s.id !== song.id)
  lib.unshift({ ...song, updatedAt: Date.now() })
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib))
  return lib
}

export function deleteFromLibrary(id: string): SavedSong[] {
  const lib = loadLibrary().filter((s) => s.id !== id)
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib))
  return lib
}
