// Chọn thế bấm cho hợp âm rồi quy ra các nốt MIDI sẽ phát.
// Ưu tiên thế bấm phổ thông trong chords-db (MIT). Hợp âm nào không có thì tự xếp nốt theo nhạc lý (tonal).

import guitarDb from '@tombatossals/chords-db/lib/guitar.json'
import { Chord, Note } from 'tonal'
import { type ParsedChord, SHARP_NAMES, isMinorSuffix, transposeChord } from './chordName'

// Dây buông chuẩn E2 A2 D3 G3 B3 E4 (dây 6 → dây 1)
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]

const DB_KEYS = ['C', 'Csharp', 'D', 'Eb', 'E', 'F', 'Fsharp', 'G', 'Ab', 'A', 'Bb', 'B']
const DB_SLASH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

interface DbPosition {
  frets: number[]
  fingers: number[]
  baseFret: number
  barres: number[]
}
interface DbChord {
  suffix: string
  positions: DbPosition[]
}
const db = guitarDb as unknown as { chords: Record<string, DbChord[]> }

export interface Diagram {
  frets: number[] // -1 = không đánh, 0 = buông, n = phím (tính từ baseFret)
  fingers: number[]
  baseFret: number
  barres: number[]
}

export interface Voicing {
  bass: number // nốt bass chính
  altBass: number // bass phụ (thường là nốt 5), dùng cho kiểu đánh bass luân phiên
  upper: number[] // các nốt phía trên, thấp → cao
  diagram: Diagram | null // thế bấm (đã trừ capo), null nếu là hợp âm tự xếp
}

const SUFFIX_ALIASES: Record<string, string> = {
  '': 'major',
  M: 'major',
  maj: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  M7: 'maj7',
  Maj7: 'maj7',
  Δ: 'maj7',
  Δ7: 'maj7',
  min7: 'm7',
  '-7': 'm7',
  '°': 'dim',
  o: 'dim',
  '°7': 'dim7',
  o7: 'dim7',
  '+': 'aug',
  sus: 'sus4',
  '7sus': '7sus4',
  ø: 'm7b5',
  ø7: 'm7b5',
  mM7: 'mmaj7',
  '+7': 'aug7',
  '7#5': 'aug7',
  '7+': 'aug7',
}

function dbSuffix(suffix: string): string {
  const s = suffix.replace(/[()]/g, '')
  return SUFFIX_ALIASES[s] ?? s
}

function findDbPosition(c: ParsedChord): DbPosition | null {
  const list = db.chords[DB_KEYS[c.root]]
  if (!list) return null
  let suffix = dbSuffix(c.suffix)
  if (c.bass !== null && c.bass !== c.root) {
    // chords-db lưu hợp âm slash dạng "/E" hoặc "m/E"
    suffix = (isMinorSuffix(c.suffix) ? 'm' : '') + '/' + DB_SLASH_NAMES[c.bass]
  }
  const positions = list.find((x) => x.suffix === suffix)?.positions
  if (!positions?.length) return null
  // Nốt thấp nhất phải đúng là bass: Bm chặn cả 6 dây sẽ ra bass F#, nên bỏ dây 6 thành x24432.
  // Bỏ dây xong còn ít hơn 4 nốt thì tìm thế khác có bass đúng sẵn.
  const bassPc = c.bass ?? c.root
  const first = muteBelowBass(positions[0], bassPc)
  if (first.frets.filter((f) => f >= 0).length >= 4) return first
  return positions.find((p) => lowestNote(p) % 12 === bassPc) ?? first
}

function absFret(p: DbPosition, f: number): number {
  return f <= 0 ? f : f + p.baseFret - 1
}

function lowestNote(p: DbPosition): number {
  const i = p.frets.findIndex((f) => f >= 0)
  return OPEN_STRINGS[i] + absFret(p, p.frets[i])
}

// Bỏ các dây thấp hơn nốt bass để tiếng bass đúng nốt gốc
function muteBelowBass(p: DbPosition, bassPc: number): DbPosition {
  const first = p.frets.findIndex((f, i) => f >= 0 && (OPEN_STRINGS[i] + absFret(p, f)) % 12 === bassPc)
  if (first <= 0) return p
  return {
    ...p,
    frets: p.frets.map((f, i) => (i < first ? -1 : f)),
    fingers: p.fingers.map((f, i) => (i < first ? 0 : f)),
  }
}

function chordPitchClasses(c: ParsedChord): number[] {
  const notes = Chord.get(SHARP_NAMES[c.root] + c.suffix).notes
  if (notes.length) return notes.map((n) => Note.chroma(n) ?? 0)
  // Không đọc được thì lùi về hợp âm ba trưởng hoặc thứ
  const third = isMinorSuffix(c.suffix) ? 3 : 4
  return [c.root, (c.root + third) % 12, (c.root + 7) % 12]
}

function fifthAbove(c: ParsedChord): number {
  if (/^o|dim|°|m7b5|ø|b5/.test(c.suffix)) return 6
  if (/aug|\+|#5/.test(c.suffix)) return 8
  return 7
}

function altBassFor(bass: number, interval: number): number {
  const below = bass - (12 - interval)
  return below >= 40 ? below : bass + interval
}

function lowestAtOrAbove(pc: number, min: number): number {
  return min + ((((pc - min) % 12) + 12) % 12)
}

function generated(c: ParsedChord): Omit<Voicing, 'diagram'> {
  const pcs = chordPitchClasses(c)
  const bassPc = c.bass ?? c.root
  const bass = lowestAtOrAbove(bassPc, 40)
  const upper = [...new Set(pcs.map((pc) => lowestAtOrAbove(pc, 55)))].sort((a, b) => a - b)
  return { bass, altBass: altBassFor(bass, fifthAbove(c)), upper }
}

const cache = new Map<string, Voicing>()

export function getVoicing(chord: ParsedChord, capo: number): Voicing {
  const key = `${chord.root}|${chord.suffix}|${chord.bass}|${capo}`
  const hit = cache.get(key)
  if (hit) return hit

  // Có capo thì bấm thế của hợp âm thấp hơn, tiếng phát ra vẫn đúng hợp âm gốc
  const shape = transposeChord(chord, -capo)
  const pos = findDbPosition(shape)
  let v: Voicing
  if (pos) {
    const midi = pos.frets.flatMap((f, i) => (f < 0 ? [] : [OPEN_STRINGS[i] + absFret(pos, f) + capo]))
    const [bass, ...upper] = midi
    v = {
      bass,
      altBass: altBassFor(bass, fifthAbove(chord)),
      upper,
      diagram: { frets: pos.frets, fingers: pos.fingers, baseFret: pos.baseFret, barres: pos.barres },
    }
  } else {
    v = { ...generated(chord), diagram: null }
  }
  cache.set(key, v)
  return v
}
