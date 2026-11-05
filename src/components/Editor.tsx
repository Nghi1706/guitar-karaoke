import { useState } from 'react'
import type { Arrangement } from '../lib/arrange'
import { href } from '../lib/router'
import type { SavedSong } from '../lib/storage'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { SongTextArea } from './SongTextArea'

interface Props {
  song: SavedSong
  arr: Arrangement
  sectionCount: number
  library: SavedSong[]
  onTitle: (t: string) => void
  onText: (t: string) => void
  onSave: () => void
  onNew: () => void
  onLoad: (s: SavedSong) => void
  onDelete: (id: string) => void
}

const PLACEHOLDER = `Dán lời bài hát có hợp âm vào đây, ví dụ:

Verse 1:
[C]Đây là dòng [G]lời mẫu
[Am]Hợp âm đặt trong [F]ngoặc vuông

Chorus:
[F]Hoặc hợp âm nằm ở [G]dòng phía trên lời
  C          G
Cũng nhận được luôn`

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

export function Editor({
  song,
  arr,
  sectionCount,
  library,
  onTitle,
  onText,
  onSave,
  onNew,
  onLoad,
  onDelete,
}: Props) {
  const libraryBeside = useMediaQuery('(min-width: 900px)')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = () => {
    onSave()
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const libraryList = (
    <div className="library-list">
      {library.length === 0 ? (
        <p className="hint">Bài bạn lưu sẽ nằm ở đây, chỉ trên trình duyệt này.</p>
      ) : (
        <ul>
          {library.map((s) => (
            <li key={s.id} className={s.id === song.id ? 'sel' : ''}>
              <button
                className="library-item"
                onClick={() => {
                  onLoad(s)
                  setLibraryOpen(false)
                }}
              >
                {s.title || 'Bài chưa đặt tên'}
              </button>
              <button
                className="icon-btn danger"
                aria-label={`Xoá bài ${s.title || 'chưa đặt tên'}`}
                onClick={() => confirm(`Xoá bài “${s.title || 'chưa đặt tên'}”?`) && onDelete(s.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="editor-head">
          <input
            className="title-input"
            placeholder="Tên bài hát"
            aria-label="Tên bài hát"
            value={song.title}
            onChange={(e) => onTitle(e.target.value)}
          />
          {!libraryBeside && (
            <button className="btn ghost" onClick={() => setLibraryOpen(true)}>
              <Icon name="library" /> Thư viện{library.length > 0 && ` (${library.length})`}
            </button>
          )}
        </div>
        <SongTextArea value={song.text} placeholder={PLACEHOLDER} onChange={onText} />
        <div className="editor-footer">
          <span className="hint">
            {arr.events.length
              ? `${sectionCount} đoạn, ${arr.events.length} hợp âm, dài khoảng ${fmtTime(arr.totalSec)}`
              : 'Chưa thấy hợp âm nào trong lời'}
          </span>
          <span className="grow" />
          <button className="btn" onClick={save} disabled={!song.text.trim()}>
            <Icon name="save" /> {saved ? 'Đã lưu' : 'Lưu vào thư viện'}
          </button>
          <a
            className={`btn primary ${arr.events.length ? '' : 'disabled'}`}
            href={href('hat')}
            aria-disabled={!arr.events.length}
            onClick={(e) => !arr.events.length && e.preventDefault()}
          >
            <Icon name="mic" /> Sang hát
          </a>
        </div>
      </div>

      {libraryBeside ? (
        <aside className="library" aria-label="Thư viện">
          <div className="library-head">
            <h3>Thư viện</h3>
            <button className="btn ghost small" onClick={onNew}>
              <Icon name="plus" size={16} /> Bài mới
            </button>
          </div>
          {libraryList}
        </aside>
      ) : (
        <Modal variant="sheet" open={libraryOpen} onClose={() => setLibraryOpen(false)} title="Thư viện">
          <button
            className="btn"
            onClick={() => {
              onNew()
              setLibraryOpen(false)
            }}
          >
            <Icon name="plus" size={16} /> Bài mới
          </button>
          {libraryList}
        </Modal>
      )}
    </div>
  )
}
