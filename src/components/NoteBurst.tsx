import { type CSSProperties, useState } from 'react'

// Vài nốt nhạc bay lên từ hợp âm vừa đánh, chỉ để trang trí.
// Mỗi lần gắn vào là một lượt bay; vị trí, hướng lượn và tốc độ chọn ngẫu nhiên một lần.
const SHAPES = ['eighth', 'beamed', 'quarter'] as const

function makeNotes() {
  const count = Math.random() < 0.5 ? 2 : 3
  return Array.from({ length: count }, (_, i) => ({
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    tone: i % 2 ? 'tone-chord' : 'tone-brass',
    style: {
      // Bay chéo lên bên phải, thấp vừa đủ để dòng đầu bài không bị cắt; tính theo em để to nhỏ theo cỡ chữ lời
      '--x': `${(i * 0.5 + Math.random() * 0.6).toFixed(2)}em`,
      '--drift': `${(0.6 + i * 0.9 + Math.random() * 0.8).toFixed(2)}em`,
      '--rise': `${(1.6 + Math.random() * 1.2).toFixed(2)}em`,
      '--rot': `${Math.round((Math.random() - 0.5) * 50)}deg`,
      '--size': `${(0.8 + Math.random() * 0.4).toFixed(2)}em`,
      '--dur': `${(1.9 + Math.random() * 0.9).toFixed(2)}s`,
      '--delay': `${(i * 0.22 + Math.random() * 0.08).toFixed(2)}s`,
    } as CSSProperties,
  }))
}

export function NoteBurst() {
  const [notes] = useState(makeNotes)
  return (
    <span className="note-burst" aria-hidden="true">
      {notes.map((n, i) => (
        <i key={i} className={`fly-note ${n.shape} ${n.tone}`} style={n.style} />
      ))}
    </span>
  )
}
