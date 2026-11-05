import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  // 'dialog': hộp giữa màn hình. 'sheet': trượt từ cạnh phải (tablet) hoặc từ dưới lên (điện thoại).
  variant?: 'dialog' | 'sheet'
  dismissable?: boolean // false: không đóng bằng Esc hay bấm ra ngoài
  className?: string
}

// Dùng <dialog> gốc của trình duyệt: tự giữ focus bên trong, đọc được bằng trình đọc màn hình.
export function Modal({ open, onClose, title, children, variant = 'dialog', dismissable = true, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal modal-${variant} ${className ?? ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (dismissable) onClose()
      }}
      onClick={(e) => {
        // Bấm vào vùng tối bên ngoài khung thì đóng
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          {dismissable && (
            <button className="icon-btn" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          )}
        </div>
        {open && children}
      </div>
    </dialog>
  )
}
