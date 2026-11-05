// Tách từng dòng của ô soạn bài thành các mảnh để tô màu, dùng đúng luật của parser:
// hợp âm trong ngoặc, dòng chỉ có hợp âm, tiêu đề đoạn và ghi chú kiểu [x2].

import { isChordToken } from './chordName'
import { isChordLine, isHeader } from './parser'

export type TokenKind = 'text' | 'header' | 'chord' | 'bracket' | 'note'

export interface Token {
  kind: TokenKind
  text: string
}

export function highlightLine(line: string): Token[] {
  if (!line) return []
  if (isHeader(line)) return [{ kind: 'header', text: line }]

  const out: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }

  // Dòng hợp âm nằm phía trên lời: tô từng hợp âm, giữ nguyên khoảng trắng canh cột
  if (!line.includes('[') && isChordLine(line)) {
    for (const part of line.split(/(\s+)/)) push(isChordToken(part) ? 'chord' : 'text', part)
    return out
  }

  const re = /\[([^\]\n]*)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    push('text', line.slice(last, m.index))
    const inner = m[1]
    if (isChordToken(inner.trim())) {
      push('bracket', '[')
      push('chord', inner)
      push('bracket', ']')
    } else {
      push('note', m[0])
    }
    last = re.lastIndex
  }
  push('text', line.slice(last))
  return out
}
