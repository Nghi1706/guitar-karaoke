// Dựng dòng thời gian: mỗi hợp âm bắt đầu lúc nào, kéo dài bao lâu, ứng với đoạn lời nào.
// Sau đó sinh danh sách nốt đàn theo pattern của điệu.

import type { PlayKind, StyleDef } from '../config/styles'
import {
  type Key,
  type ParsedChord,
  chordToString,
  isMinorSuffix,
  keyUsesFlats,
  parseChord,
  transposeChord,
} from './chordName'
import type { Song } from './parser'
import { getVoicing } from './voicing'

export interface Settings {
  styleId: string
  playMode: 'auto' | PlayKind // auto = rải ở phiên khúc, quạt ở điệp khúc
  bpm: number
  originalKey: Key | null // null = tự đoán từ hợp âm đầu bài
  transpose: number // số nửa cung dịch tông
  capo: number
  countdownSec: number
  defaultBars: number // độ dài mặc định mỗi hợp âm (ô nhịp)
  volume: number // dB
}

export const DEFAULT_SETTINGS: Settings = {
  styleId: 'ballad',
  playMode: 'auto',
  bpm: 70,
  originalKey: null,
  transpose: 0,
  capo: 0,
  countdownSec: 5,
  defaultBars: 1,
  volume: 0,
}

export interface ChordEvent {
  index: number
  label: string // tên hợp âm hiển thị (đã dịch tông)
  chord: ParsedChord // hợp âm phát ra (đã dịch tông)
  bars: number
  startSec: number
  endSec: number
  segIds: string[] // các cụm lời hát trong lúc hợp âm này vang
  chorus: boolean // hợp âm nằm trong đoạn điệp khúc
}

export interface Arrangement {
  events: ChordEvent[]
  segEvent: Map<string, number> // segId → index hợp âm
  totalSec: number
  key: Key | null
  targetKey: Key | null
}

export const segId = (s: number, l: number, g: number) => `${s}-${l}-${g}`

// "ĐK", "Điệp khúc 2", "Chorus:", "Refrain (x2)"... Pre-chorus vẫn tính là phiên khúc.
const CHORUS_NAME = /^(chorus|refrain|hook|điệp khúc|đk)/iu

export const isChorus = (sectionName: string | null) => !!sectionName && CHORUS_NAME.test(sectionName)

export function detectKey(song: Song): Key | null {
  for (const sec of song.sections)
    for (const line of sec.lines)
      for (const seg of line.segments) {
        const c = seg.chord && parseChord(seg.chord)
        if (c) return { tonic: c.root, minor: isMinorSuffix(c.suffix) }
      }
  return null
}

export function buildArrangement(
  song: Song,
  settings: Settings,
  style: StyleDef,
  durations: Record<number, number>,
): Arrangement {
  const key = settings.originalKey ?? detectKey(song)
  const targetKey = key && { tonic: (key.tonic + settings.transpose + 12) % 12, minor: key.minor }
  const flats = targetKey ? keyUsesFlats(targetKey.tonic, targetKey.minor) : false
  const secPerBar = (60 / settings.bpm) * style.beatsPerBar

  const events: ChordEvent[] = []
  const segEvent = new Map<string, number>()
  let t = 0

  song.sections.forEach((sec, si) => {
    const chorus = isChorus(sec.name)
    sec.lines.forEach((line, li) =>
      line.segments.forEach((seg, gi) => {
        const id = segId(si, li, gi)
        const parsed = seg.chord ? parseChord(seg.chord) : null
        if (parsed && seg.chord) {
          const chord = transposeChord(parsed, settings.transpose)
          const index = events.length
          const bars = durations[index] ?? settings.defaultBars
          events.push({
            index,
            // Không dịch tông thì giữ nguyên cách viết của bài gốc
            label: settings.transpose === 0 ? seg.chord : chordToString(chord, flats),
            chord,
            bars,
            startSec: t,
            endSec: t + bars * secPerBar,
            segIds: [],
            chorus,
          })
          t += bars * secPerBar
        }
        const current = events[events.length - 1]
        if (current) {
          current.segIds.push(id)
          segEvent.set(id, current.index)
        }
      }),
    )
  })
  return { events, segEvent, totalSec: t, key, targetKey }
}

export interface NoteEvent {
  time: number // giây, tính từ đầu bài
  midi: number
  duration: number
  velocity: number
}

interface Token {
  bass: boolean
  altBass: boolean
  strings: number[]
  strum: 'D' | 'U' | null
}

export function parsePattern(pattern: string): Token[] {
  return pattern
    .trim()
    .split(/\s+/)
    .map((raw) => {
      const tok: Token = { bass: false, altBass: false, strings: [], strum: null }
      if (raw === 'D' || raw === 'U') tok.strum = raw
      else if (raw !== '-') {
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i]
          if (ch === 'B') {
            if (raw[i + 1] === "'") {
              tok.altBass = true
              i++
            } else tok.bass = true
          } else if (/[1-6]/.test(ch)) tok.strings.push(Number(ch))
        }
      }
      return tok
    })
}

// Dao động nhỏ về lực gảy để nghe bớt "máy"
const humanize = (v: number) => Math.min(1, v * (0.92 + Math.random() * 0.12))

export function playKindOf(ev: ChordEvent, settings: Settings): PlayKind {
  if (settings.playMode !== 'auto') return settings.playMode
  return ev.chorus ? 'strum' : 'arpeggio'
}

export function renderNotes(arr: Arrangement, style: StyleDef, settings: Settings): NoteEvent[] {
  const patterns = { arpeggio: parsePattern(style.arpeggio), strum: parsePattern(style.strum) }
  if (!patterns.arpeggio.length || !patterns.strum.length || !arr.events.length) return []
  const stepSec = 60 / settings.bpm / style.stepsPerBeat
  const stepsPerBar = style.beatsPerBar * style.stepsPerBeat
  const raw: (NoteEvent & { until: number })[] = []
  let step = 0
  let kind: PlayKind | null = null
  let runStart = 0 // bước bắt đầu dùng kiểu đánh hiện tại, để đổi kiểu thì đánh lại từ đầu pattern

  for (const ev of arr.events) {
    const evKind = playKindOf(ev, settings)
    if (evKind !== kind) {
      kind = evKind
      runStart = step
    }
    const tokens = patterns[kind]
    const v = getVoicing(ev.chord, settings.capo)
    const treble = (k: number) => v.upper[Math.max(0, v.upper.length - k)] ?? v.bass
    const steps = Math.max(1, Math.round(ev.bars * stepsPerBar))
    // Đổi thế bấm thì các nốt cũ tắt, chỉ ngân thêm chút xíu
    const until = (step + steps) * stepSec + 0.12

    for (let s = 0; s < steps; s++, step++) {
      let tok = tokens[(step - runStart) % tokens.length]
      const time = step * stepSec
      // Vừa đổi hợp âm mà bước đó không có bass (hay tiếng quạt) thì thêm vào cho chắc nhịp
      if (s === 0 && !tok.bass && !tok.altBass && !tok.strum)
        tok = kind === 'arpeggio' ? { ...tok, bass: true } : { ...tok, strum: 'D' }

      if (tok.strum === 'D') {
        const notes = [v.bass, ...v.upper]
        const accent = step % stepsPerBar === 0 ? 0.8 : 0.65
        notes.forEach((midi, i) =>
          raw.push({ time: time + i * 0.012, midi, duration: 0, velocity: humanize(accent), until }),
        )
      } else if (tok.strum === 'U') {
        const notes = v.upper.slice(-4).reverse()
        notes.forEach((midi, i) =>
          raw.push({ time: time + i * 0.01, midi, duration: 0, velocity: humanize(0.45), until }),
        )
      } else {
        if (tok.bass) raw.push({ time, midi: v.bass, duration: 0, velocity: humanize(0.85), until })
        if (tok.altBass) raw.push({ time, midi: v.altBass, duration: 0, velocity: humanize(0.75), until })
        for (const k of tok.strings) raw.push({ time, midi: treble(k), duration: 0, velocity: humanize(0.6), until })
      }
    }
  }

  // Kết bài: quạt chậm hợp âm cuối cho ngân
  const endTime = step * stepSec
  const last = getVoicing(arr.events[arr.events.length - 1].chord, settings.capo)
  ;[last.bass, ...last.upper].forEach((midi, i) =>
    raw.push({ time: endTime + i * 0.035, midi, duration: 3, velocity: 0.7, until: Infinity }),
  )

  // Bỏ nốt trùng gảy cùng lúc (vd bass trùng với dây 3 của thế bấm)
  raw.sort((a, b) => a.time - b.time)
  const lastHit = new Map<number, number>()
  const unique = raw.filter((n) => {
    const prev = lastHit.get(n.midi)
    if (prev !== undefined && n.time - prev < 0.02) return false
    lastHit.set(n.midi, n.time)
    return true
  })

  // Mỗi nốt ngân tới khi chính nốt đó được gảy lại hoặc đổi hợp âm (giống dây đàn), tối đa 2.5 giây
  const nextSame = new Map<number, number>()
  for (let i = unique.length - 1; i >= 0; i--) {
    const n = unique[i]
    const next = nextSame.get(n.midi)
    if (!n.duration) n.duration = Math.min(2.5, (next ?? Infinity) - n.time, n.until - n.time)
    nextSame.set(n.midi, n.time)
  }
  return unique.map(({ time, midi, duration, velocity }) => ({ time, midi, duration, velocity }))
}
