import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import './App.css'
import { AuthProvider, isPremium, useAuth } from './auth/AuthContext'
import { useAdGate } from './components/AdGate'
import { Editor } from './components/Editor'
import { FeedbackDialog } from './components/FeedbackDialog'
import { Icon } from './components/Icon'
import { Modal } from './components/Modal'
import { Player } from './components/Player'
import { SettingsPanel } from './components/SettingsPanel'
import { ACCOUNTS_ENABLED, ADS_ENABLED, SERVER_ENABLED } from './config/features'
import { getStyle } from './config/styles'
import { buildArrangement, detectKey, renderNotes } from './lib/arrange'
import { parseSong } from './lib/parser'
import { href, type Route, useLocation } from './lib/router'
import {
  type SavedSong,
  deleteFromLibrary,
  loadCurrent,
  loadLibrary,
  newSong,
  saveCurrent,
  saveToLibrary,
} from './lib/storage'
import { track, trackOpen } from './lib/usage'
import { PHONE, useMediaQuery, WIDE } from './lib/useMediaQuery'
import { AccountPage } from './pages/AccountPage'
import { UpgradePage } from './pages/UpgradePage'

// Trang quản trị chỉ admin mở, tách ra để người dùng thường không phải tải
const AdminPage = lazy(() => import('./pages/AdminPage'))

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

function Shell() {
  const { user } = useAuth()
  const [song, setSong] = useState<SavedSong>(loadCurrent)
  const [library, setLibrary] = useState<SavedSong[]>(loadLibrary)
  const [playing, setPlaying] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { route, query } = useLocation()
  const wide = useMediaQuery(WIDE)
  const phone = useMediaQuery(PHONE)
  const { gate, element: adGate } = useAdGate()

  // Mở /app/ không có # thì chọn màn một lần lúc vào: có bài sẵn thì hát, chưa có thì soạn.
  // Không tính lại theo song.text, nếu không gõ chữ đầu tiên sẽ bị nhảy sang màn hát.
  const [startView] = useState<Route>(() => (song.text.trim() ? 'hat' : 'soan'))
  // Trang nào cần server mà đang tắt thì không mở được, quay về màn mặc định
  const blocked =
    (!SERVER_ENABLED && (route === 'account' || route === 'upgrade' || route === 'admin')) ||
    (route === 'upgrade' && !ACCOUNTS_ENABLED)
  const allowed = blocked ? null : route
  const view: Route = allowed ?? startView
  const studio = view === 'soan' || view === 'hat'

  const parsed = useMemo(() => parseSong(song.text), [song.text])
  const style = getStyle(song.settings.styleId)
  const arr = useMemo(
    () => buildArrangement(parsed, song.settings, style, song.durations),
    [parsed, song.settings, style, song.durations],
  )
  const notes = useMemo(() => renderNotes(arr, style, song.settings), [arr, style, song.settings])

  useEffect(trackOpen, [])

  useEffect(() => {
    const t = setTimeout(() => saveCurrent(song), 300)
    return () => clearTimeout(t)
  }, [song])

  const update = (patch: Partial<SavedSong>) => setSong((s) => ({ ...s, ...patch }))

  const onText = (text: string) => {
    // Thêm/bớt hợp âm thì độ dài đã chỉnh sẽ lệch vị trí, nên xoá đi
    const before = buildArrangement(parsed, song.settings, style, {}).events.length
    const after = buildArrangement(parseSong(text), song.settings, style, {}).events.length
    update(before === after ? { text } : { text, durations: {} })
    // Ô soạn từ chưa có hợp âm nào thành có: tính là một bài mới
    if (before === 0 && after > 0) track('compose')
  }

  const onSetDuration = (index: number, bars: number | null) => {
    const durations = { ...song.durations }
    if (bars === null) delete durations[index]
    else durations[index] = bars
    update({ durations })
  }

  const settingsPanel = (
    <SettingsPanel
      settings={song.settings}
      detectedKey={detectKey(parsed)}
      disabled={playing}
      onChange={(settings) => update({ settings })}
    />
  )

  let page
  switch (view) {
    case 'soan':
      page = (
        <Editor
          song={song}
          arr={arr}
          sectionCount={parsed.sections.length}
          library={library}
          onTitle={(title) => update({ title })}
          onText={onText}
          onSave={() => {
            setLibrary(saveToLibrary(song))
            track('save')
          }}
          onNew={() => setSong(newSong())}
          onLoad={(s) => setSong(s)}
          onDelete={(id) => setLibrary(deleteFromLibrary(id))}
        />
      )
      break
    case 'hat':
      page = (
        <Player
          song={parsed}
          arr={arr}
          notes={notes}
          settings={song.settings}
          durations={song.durations}
          onSetDuration={onSetDuration}
          onPlayingChange={setPlaying}
          beforePlay={gate}
        />
      )
      break
    case 'account':
      page = <AccountPage onFeedback={() => setFeedbackOpen(true)} />
      break
    case 'upgrade':
      page = <UpgradePage query={query} />
      break
    case 'admin':
      page = (
        <Suspense fallback={<div className="page-loading">Đang mở trang quản trị…</div>}>
          <AdminPage />
        </Suspense>
      )
      break
  }

  const premium = isPremium(user)
  // Tắt tài khoản thì giấu nút đăng nhập, nhưng ai đã đăng nhập (admin) vẫn thấy để vào tài khoản, đăng xuất
  const showAccount = SERVER_ENABLED && (ACCOUNTS_ENABLED || !!user)

  return (
    <div className={`app ${phone ? 'is-phone' : ''}`}>
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Karaoke Guitar, về trang giới thiệu">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Karaoke Guitar</span>
        </a>

        {!phone && (
          <nav className="top-nav" aria-label="Chế độ">
            <a className={view === 'soan' ? 'on' : ''} href={href('soan')} aria-current={view === 'soan'}>
              Soạn bài
            </a>
            <a className={view === 'hat' ? 'on' : ''} href={href('hat')} aria-current={view === 'hat'}>
              Hát
            </a>
          </nav>
        )}

        {studio && <span className="song-title">{song.title || 'Bài chưa đặt tên'}</span>}
        <span className="grow" />

        {studio && !wide && !phone && (
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
            <Icon name="sliders" /> Tuỳ chỉnh
          </button>
        )}
        {SERVER_ENABLED && (
          <button className="btn ghost" onClick={() => setFeedbackOpen(true)} aria-label="Gửi góp ý">
            <Icon name="message" />
            {!phone && <span className="label-wide">Góp ý</span>}
          </button>
        )}
        {user?.role === 'admin' && !phone && (
          <a className={`btn ghost ${view === 'admin' ? 'on' : ''}`} href={href('admin')}>
            <Icon name="shield" /> Quản trị
          </a>
        )}
        {ADS_ENABLED && ACCOUNTS_ENABLED && !premium && !phone && (
          <a className="btn upgrade" href={href('upgrade')}>
            <Icon name="star" /> Bỏ quảng cáo
          </a>
        )}
        {showAccount && !phone && (
          <a className={`avatar-link ${view === 'account' ? 'on' : ''}`} href={href('account')}>
            {user ? (
              <span className="avatar" aria-label={`Tài khoản ${user.name}`}>
                {(user.name || user.email).trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              'Đăng nhập'
            )}
          </a>
        )}
      </header>

      <main className="main">
        {studio && wide && (
          <aside className="rail" aria-label="Tuỳ chỉnh">
            {settingsPanel}
            <p className="credits">
              Tiếng đàn: FreePats Spanish Classical Guitar (CC0). Thế bấm: chords-db (MIT).
            </p>
          </aside>
        )}
        <div className="content">{page}</div>
      </main>

      {phone && (
        <nav className="tabbar" aria-label="Điều hướng">
          <a className={view === 'soan' ? 'on' : ''} href={href('soan')}>
            <Icon name="pen" />
            Soạn bài
          </a>
          <a className={view === 'hat' ? 'on' : ''} href={href('hat')}>
            <Icon name="mic" />
            Hát
          </a>
          <button
            className={settingsOpen ? 'on' : ''}
            onClick={() => {
              if (!studio) window.location.hash = href('hat')
              setSettingsOpen(true)
            }}
          >
            <Icon name="sliders" />
            Tuỳ chỉnh
          </button>
          {showAccount && (
            <a
              className={view === 'account' || view === 'upgrade' || view === 'admin' ? 'on' : ''}
              href={href('account')}
            >
              <Icon name="user" />
              {user ? 'Tài khoản' : 'Đăng nhập'}
            </a>
          )}
        </nav>
      )}

      {!wide && (
        <Modal variant="sheet" open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Tuỳ chỉnh">
          {settingsPanel}
        </Modal>
      )}
      {SERVER_ENABLED && (
        <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} page={view} />
      )}
      {adGate}
    </div>
  )
}
