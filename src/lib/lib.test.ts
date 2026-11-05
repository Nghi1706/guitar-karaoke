import { describe, expect, it } from 'vitest'
import { STYLES, getStyle } from '../config/styles'
import { DEFAULT_SETTINGS, buildArrangement, isChorus, parsePattern, playKindOf, renderNotes } from './arrange'
import { chordToString, parseChord, transposeChord } from './chordName'
import { parseSong } from './parser'
import { getVoicing } from './voicing'

const SAMPLE = `Verse 1:
[C]Đây là dòng [G]lời mẫu
Lời nối [Am]tiếp

Chorus:
[F]Điệp khúc [G7]đây [C]`

describe('chordName', () => {
  it('đọc và dịch tông hợp âm', () => {
    const c = parseChord('C#m7')!
    expect(c).toEqual({ root: 1, suffix: 'm7', bass: null })
    expect(chordToString(transposeChord(c, -1), false)).toBe('Cm7')
    expect(chordToString(transposeChord(parseChord('A/C#')!, 1), true)).toBe('Bb/D')
  })

  it('không nhận nhầm tiêu đề thành hợp âm', () => {
    expect(parseChord('Chorus')).toBeNull()
    expect(parseChord('x2')).toBeNull()
    expect(parseChord('Ebdim')).not.toBeNull()
    expect(parseChord('Dmaj7')).not.toBeNull()
  })
})

describe('parser', () => {
  it('tách đoạn, dòng, cụm hợp âm', () => {
    const song = parseSong(SAMPLE)
    expect(song.sections.map((s) => s.name)).toEqual(['Verse 1', 'Chorus'])
    const l2 = song.sections[0].lines[1]
    expect(l2.segments).toEqual([
      { chord: null, text: 'Lời nối ' },
      { chord: 'Am', text: 'tiếp' },
    ])
  })

  it('chuyển kiểu hợp âm nằm trên dòng lời', () => {
    const song = parseSong('C       G\nĐây là lời mẫu')
    expect(song.sections[0].lines[0].segments).toEqual([
      { chord: 'C', text: 'Đây là ' },
      { chord: 'G', text: 'lời mẫu' },
    ])
  })
})

describe('arrange', () => {
  const song = parseSong(SAMPLE)
  const style = getStyle('ballad')

  it('lời không có hợp âm thuộc về hợp âm đứng trước', () => {
    const arr = buildArrangement(song, DEFAULT_SETTINGS, style, {})
    expect(arr.events.map((e) => e.label)).toEqual(['C', 'G', 'Am', 'F', 'G7', 'C'])
    expect(arr.segEvent.get('0-1-0')).toBe(1) // "Lời nối " hát trong lúc đàn G
  })

  it('tính thời gian theo BPM và độ dài từng hợp âm', () => {
    const arr = buildArrangement(song, { ...DEFAULT_SETTINGS, bpm: 60 }, style, { 1: 0.5 })
    expect(arr.events[0].endSec).toBe(4) // 1 ô 4/4 ở 60 BPM
    expect(arr.events[1].endSec - arr.events[1].startSec).toBe(2)
    expect(arr.totalSec).toBe(22)
  })

  it('dịch tông dùng dấu giáng khi tông mới là tông giáng', () => {
    const arr = buildArrangement(song, { ...DEFAULT_SETTINGS, transpose: 3 }, style, {})
    expect(arr.events.map((e) => e.label)).toEqual(['Eb', 'Bb', 'Cm', 'Ab', 'Bb7', 'Eb'])
  })

  it('sinh nốt cho mọi điệu, nốt nằm trong tầm guitar', () => {
    for (const st of STYLES)
      for (const playMode of ['arpeggio', 'strum'] as const) {
        const settings = { ...DEFAULT_SETTINGS, styleId: st.id, playMode }
        const arr = buildArrangement(song, settings, st, {})
        const notes = renderNotes(arr, st, settings)
        expect(notes.length).toBeGreaterThan(20)
        for (const n of notes) {
          expect(n.midi).toBeGreaterThanOrEqual(40)
          expect(n.midi).toBeLessThanOrEqual(88)
          expect(n.duration).toBeGreaterThan(0)
        }
      }
  })

  it('nhận ra đoạn điệp khúc', () => {
    for (const name of ['ĐK', 'đk 2', 'Điệp khúc', 'Chorus', 'Refrain (x2)']) expect(isChorus(name)).toBe(true)
    for (const name of [null, 'Verse 1', 'Pre-chorus', 'Phiên khúc', 'Intro']) expect(isChorus(name)).toBe(false)
  })

  it('tự động rải ở phiên khúc, quạt ở điệp khúc', () => {
    const arr = buildArrangement(song, DEFAULT_SETTINGS, style, {})
    expect(arr.events.map((e) => playKindOf(e, DEFAULT_SETTINGS))).toEqual([
      'arpeggio',
      'arpeggio',
      'arpeggio',
      'strum',
      'strum',
      'strum',
    ])
    const always = { ...DEFAULT_SETTINGS, playMode: 'arpeggio' as const }
    expect(arr.events.every((e) => playKindOf(e, always) === 'arpeggio')).toBe(true)
  })

  it('đoạn quạt gảy nhiều nốt cùng lúc hơn đoạn rải', () => {
    const arr = buildArrangement(song, DEFAULT_SETTINGS, style, {})
    const count = (playMode: 'arpeggio' | 'strum') => renderNotes(arr, style, { ...DEFAULT_SETTINGS, playMode }).length
    expect(count('strum')).toBeGreaterThan(count('arpeggio'))
  })

  it('đọc pattern', () => {
    expect(parsePattern("B B' 123 D -")).toEqual([
      { bass: true, altBass: false, strings: [], strum: null },
      { bass: false, altBass: true, strings: [], strum: null },
      { bass: false, altBass: false, strings: [1, 2, 3], strum: null },
      { bass: false, altBass: false, strings: [], strum: 'D' },
      { bass: false, altBass: false, strings: [], strum: null },
    ])
  })
})

describe('voicing', () => {
  it('lấy thế bấm phổ thông từ chords-db', () => {
    const a = getVoicing(parseChord('A')!, 0)
    expect(a.diagram?.frets).toEqual([-1, 0, 2, 2, 2, 0])
    expect([a.bass, ...a.upper]).toEqual([45, 52, 57, 61, 64])
  })

  it('bass luôn là nốt gốc', () => {
    for (const name of ['Bm', 'F#m', 'C#m', 'Eb', 'F', 'G7', 'Dmaj7', 'C/E']) {
      const c = parseChord(name)!
      expect(getVoicing(c, 0).bass % 12, name).toBe(c.bass ?? c.root)
    }
  })

  it('capo đổi thế bấm nhưng giữ đúng cao độ', () => {
    const a = getVoicing(parseChord('A')!, 2) // bấm thế G
    expect(a.diagram?.frets).toEqual([3, 2, 0, 0, 0, 3])
    const pcs = new Set([a.bass, ...a.upper].map((m) => m % 12))
    expect(pcs).toEqual(new Set([9, 1, 4])) // A C# E
  })

  it('hợp âm lạ thì tự xếp nốt', () => {
    const v = getVoicing(parseChord('C7#9')!, 0)
    expect(v.upper.length).toBeGreaterThanOrEqual(3)
  })
})
