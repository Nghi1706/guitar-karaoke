import { useMemo, useRef } from 'react'
import { highlightLine } from '../lib/highlight'

interface Props {
  value: string
  placeholder: string
  onChange: (text: string) => void
}

// Ô soạn bài có tô màu hợp âm. Lớp chữ tô màu nằm dưới, textarea chữ trong suốt nằm trên,
// cùng kích thước, cùng chừa chỗ thanh cuộn nên xuống dòng giống hệt nhau.
// Textarea tự cuộn (để trình duyệt giữ con trỏ trong tầm nhìn), lớp tô màu cuộn theo.
export function SongTextArea({ value, placeholder, onChange }: Props) {
  const lines = useMemo(() => value.split('\n').map(highlightLine), [value])
  const paint = useRef<HTMLPreElement>(null)

  return (
    <div className="song-text">
      <pre ref={paint} className="song-text-paint" aria-hidden="true">
        {lines.map((tokens, i) => (
          <span key={i}>
            {tokens.map((t, j) =>
              t.kind === 'text' ? t.text : (
                <span key={j} className={`tk-${t.kind}`}>
                  {t.text}
                </span>
              ),
            )}
            {'\n'}
          </span>
        ))}
        {/* Giữ chiều cao cho dòng trống cuối cùng */}{' '}
      </pre>
      <textarea
        className="song-text-input"
        aria-label="Lời bài hát có hợp âm"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (paint.current) paint.current.scrollTop = e.currentTarget.scrollTop
        }}
      />
    </div>
  )
}
