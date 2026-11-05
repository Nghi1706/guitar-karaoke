import { useState } from 'react'
import type { FeedbackType } from '../../shared/api'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Modal } from './Modal'

const TYPES: { id: FeedbackType; label: string }[] = [
  { id: 'feedback', label: 'Góp ý' },
  { id: 'bug', label: 'Báo lỗi' },
  { id: 'song', label: 'Bài hát đánh sai' },
  { id: 'other', label: 'Khác' },
]

interface Props {
  open: boolean
  onClose: () => void
  page: string
}

export function FeedbackDialog({ open, onClose, page }: Props) {
  const { user } = useAuth()
  const [type, setType] = useState<FeedbackType>('feedback')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    onClose()
    if (state === 'sent') {
      setState('idle')
      setMessage('')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setState('sending')
    try {
      await api.feedback({ type, message: message.trim(), email: user ? undefined : email.trim() || undefined, page })
      setState('sent')
    } catch (err) {
      setError((err as Error).message)
      setState('idle')
    }
  }

  return (
    <Modal open={open} onClose={close} title="Gửi góp ý">
      {state === 'sent' ? (
        <div className="stack">
          <p>Đã gửi. Cảm ơn bạn, nhóm phát triển sẽ đọc từng góp ý.</p>
          <button className="btn primary" onClick={close}>
            Đóng
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="chips" role="radiogroup" aria-label="Loại góp ý">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                role="radio"
                aria-checked={type === t.id}
                className={`chip ${type === t.id ? 'on' : ''}`}
                onClick={() => setType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Nội dung</span>
            <textarea
              rows={5}
              required
              minLength={5}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === 'song'
                  ? 'Tên bài, hợp âm nào nghe chưa đúng, bạn đang dùng điệu gì…'
                  : 'Bạn gặp chuyện gì, hoặc muốn web có thêm gì?'
              }
            />
          </label>
          {!user && (
            <label className="field">
              <span>Email (nếu muốn được trả lời)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={state === 'sending' || message.trim().length < 5}>
            {state === 'sending' ? 'Đang gửi…' : 'Gửi góp ý'}
          </button>
        </form>
      )}
    </Modal>
  )
}
