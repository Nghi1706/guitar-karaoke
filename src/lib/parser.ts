// Tách bài dán vào thành đoạn → dòng → các cụm (hợp âm + lời).
// Nhận 2 kiểu phổ biến:
//   1. Hợp âm nằm trong lời:   [A]Tình sao [C#]thế nhớ nhau
//   2. Hợp âm nằm dòng trên lời:  A        C#
//                                 Tình sao thế nhớ nhau

import { isChordToken } from './chordName'

export interface Segment {
  chord: string | null // tên hợp âm như trong bài gốc, null = lời nối tiếp hợp âm trước
  text: string
}

export interface Line {
  segments: Segment[]
}

export interface Section {
  name: string | null
  lines: Line[] // dòng rỗng (segments = []) là khoảng ngắt giữa các khổ
}

export interface Song {
  sections: Section[]
}

const HEADER_WORDS =
  /^(verse|chorus|bridge|intro|outro|interlude|pre-?chorus|refrain|hook|solo|coda|ending|điệp khúc|đk|phiên khúc|pk|lời|dạo|kết|vào bài)\s*\d*\s*(\(.*\))?$/iu

export function isHeader(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 30) return false
  const inner = t
    .replace(/^\[|\]$/g, '')
    .replace(/:$/, '')
    .trim()
  if (isChordToken(inner)) return false
  if (HEADER_WORDS.test(inner)) return true
  // Dòng ngắn kết thúc bằng ":" và không chứa hợp âm cũng coi là tiêu đề đoạn
  return t.endsWith(':') && !/\[/.test(t)
}

function headerName(line: string): string {
  return line
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/:$/, '')
    .trim()
}

// Dòng chỉ gồm hợp âm, kiểu "A    C#    F#m" (cho phép thêm vạch nhịp "|" hoặc "-")
export function isChordLine(line: string): boolean {
  const tokens = line
    .trim()
    .split(/\s+/)
    .filter((t) => t && t !== '|' && t !== '-')
  return tokens.length > 0 && tokens.every((t) => isChordToken(t))
}

function mergeChordLine(chordLine: string, lyric: string): string {
  const positions: { col: number; chord: string }[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(chordLine))) {
    if (isChordToken(m[0])) positions.push({ col: m.index, chord: m[0] })
  }
  let out = lyric.padEnd(Math.max(...positions.map((p) => p.col)), ' ')
  // Chèn từ phải sang trái để không lệch vị trí cột
  for (const p of [...positions].reverse()) {
    // Hợp âm lệch vào giữa chữ (do canh cột không chuẩn) thì đưa về đầu chữ
    let col = p.col
    while (col > 0 && col < out.length && out[col - 1] !== ' ' && out[col] !== ' ' && out[col - 1] !== ']') col--
    out = out.slice(0, col) + `[${p.chord}]` + out.slice(col)
  }
  return out
}

function normalizeChordOverLyrics(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes('[') && isChordLine(line)) {
      const next = lines[i + 1]
      if (next !== undefined && next.trim() && !isChordLine(next) && !isHeader(next)) {
        out.push(mergeChordLine(line, next))
        i++
      } else {
        out.push(
          line
            .trim()
            .split(/\s+/)
            .filter(isChordToken)
            .map((c) => `[${c}]`)
            .join(' '),
        )
      }
    } else {
      out.push(line)
    }
  }
  return out
}

function parseLine(line: string): Line {
  const segments: Segment[] = []
  const re = /\[([^\]]+)\]/g
  let last = 0
  let pendingText = ''
  let current: Segment | null = null
  let m: RegExpExecArray | null

  const flushText = (text: string) => {
    if (current) current.text += text
    else pendingText += text
  }

  while ((m = re.exec(line))) {
    flushText(line.slice(last, m.index))
    last = re.lastIndex
    const inner = m[1].trim()
    if (isChordToken(inner)) {
      if (!current && pendingText) segments.push({ chord: null, text: pendingText })
      pendingText = ''
      current = { chord: inner, text: '' }
      segments.push(current)
    } else {
      flushText(m[0]) // giữ nguyên ghi chú kiểu [x2]
    }
  }
  flushText(line.slice(last))
  if (!current && pendingText) segments.push({ chord: null, text: pendingText })
  return { segments }
}

export function parseSong(text: string): Song {
  const raw = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.trimEnd())
  const lines = normalizeChordOverLyrics(raw)

  const sections: Section[] = []
  let current: Section = { name: null, lines: [] }

  for (const line of lines) {
    if (isHeader(line)) {
      if (current.lines.some((l) => l.segments.length)) sections.push(current)
      current = { name: headerName(line), lines: [] }
      continue
    }
    if (!line.trim()) {
      const prev = current.lines[current.lines.length - 1]
      if (prev && prev.segments.length) current.lines.push({ segments: [] })
      continue
    }
    current.lines.push(parseLine(line))
  }
  if (current.lines.some((l) => l.segments.length)) sections.push(current)

  // Bỏ dòng trống thừa ở cuối mỗi đoạn
  for (const s of sections) {
    while (s.lines.length && !s.lines[s.lines.length - 1].segments.length) s.lines.pop()
  }
  return { sections }
}
