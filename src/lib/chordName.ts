// Đọc tên hợp âm, dịch tông, chọn cách viết thăng/giáng.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export interface ParsedChord {
  root: number // pitch class 0..11
  suffix: string // phần sau nốt gốc: "", "m", "7", "maj7", "m7b5"...
  bass: number | null // nốt bass của hợp âm slash (C/E → E)
}

const CHORD_RE = /^([A-G])([#b♯♭]?)([^/\s]*)(?:\/([A-G])([#b♯♭]?))?$/
// Chỉ chấp nhận các ký hiệu hợp âm thật, để "[Chorus]" hay "[x2]" không bị nhận nhầm.
const SUFFIX_RE = /^(?:maj|min|mmaj|m|M|dim|aug|sus|add|Δ|ø|°|o|\+|-|\d+|[#b♯♭]\d+|\(|\)|,)*$/

function accidental(acc: string): number {
  if (acc === '#' || acc === '♯') return 1
  if (acc === 'b' || acc === '♭') return -1
  return 0
}

const mod12 = (n: number) => ((n % 12) + 12) % 12

export function parseChord(raw: string): ParsedChord | null {
  const m = CHORD_RE.exec(raw.trim())
  if (!m) return null
  const [, letter, acc, suffix, bassLetter, bassAcc] = m
  if (!SUFFIX_RE.test(suffix)) return null
  return {
    root: mod12(LETTER_PC[letter] + accidental(acc)),
    suffix,
    bass: bassLetter ? mod12(LETTER_PC[bassLetter] + accidental(bassAcc)) : null,
  }
}

export const isChordToken = (s: string) => parseChord(s) !== null

export function isMinorSuffix(suffix: string): boolean {
  return /^(m|min|-)(?!aj)/.test(suffix)
}

export function transposeChord(c: ParsedChord, semitones: number): ParsedChord {
  return {
    root: mod12(c.root + semitones),
    suffix: c.suffix,
    bass: c.bass === null ? null : mod12(c.bass + semitones),
  }
}

export function noteName(pc: number, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]
}

export function chordToString(c: ParsedChord, flats: boolean): string {
  const bass = c.bass === null ? '' : '/' + noteName(c.bass, flats)
  return noteName(c.root, flats) + c.suffix + bass
}

// Tông trưởng viết bằng dấu giáng: F, Bb, Eb, Ab, Db
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1])

export function keyUsesFlats(tonic: number, minor: boolean): boolean {
  const relativeMajor = minor ? mod12(tonic + 3) : tonic
  return FLAT_MAJOR_KEYS.has(relativeMajor)
}

export interface Key {
  tonic: number
  minor: boolean
}

export function keyName(k: Key): string {
  return noteName(k.tonic, keyUsesFlats(k.tonic, k.minor)) + (k.minor ? 'm' : '')
}
