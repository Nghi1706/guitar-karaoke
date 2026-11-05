import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import type { Arrangement, NoteEvent, Settings } from '../lib/arrange'
import { segId } from '../lib/arrange'
import { chordToString, keyUsesFlats, transposeChord } from '../lib/chordName'
import type { Song } from '../lib/parser'
import { href } from '../lib/router'
import { track } from '../lib/usage'
import { getVoicing } from '../lib/voicing'
import { ChordDiagram } from './ChordDiagram'
import { Icon } from './Icon'
import { NoteBurst } from './NoteBurst'

type Status = 'idle' | 'loading' | 'playing' | 'paused'

interface Props {
  song: Song
  arr: Arrangement
  notes: NoteEvent[]
  settings: Settings
  durations: Record<number, number>
  onSetDuration: (index: number, bars: number | null) => void
  onPlayingChange: (playing: boolean) => void
  beforePlay: () => Promise<boolean> // màn quảng cáo; false thì không phát
}

const BAR_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 3, 4]
const barLabel = (b: number) => ({ 0.25: '¼', 0.5: '½', 1.5: '1½' })[b] ?? String(b)
const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function findEvent(arr: Arrangement, t: number): number {
  const ev = arr.events
  let lo = 0
  let hi = ev.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ev[mid].startSec <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function Player({
  song,
  arr,
  notes,
  settings,
  durations,
  onSetDuration,
  onPlayingChange,
  beforePlay,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [active, setActive] = useState(-1)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [popover, setPopover] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const segEls = useRef(new Map<string, HTMLElement>())
  const activeRef = useRef(-1)
  const raf = useRef(0)
  const startFrom = useRef(0) // hợp âm bắt đầu phát
  const progressEl = useRef<HTMLDivElement>(null)
  const timeEl = useRef<HTMLSpanElement>(null)

  const showTime = useCallback(
    (t: number) => {
      const total = arr.totalSec || 1
      progressEl.current?.style.setProperty('--progress', String(Math.min(1, Math.max(0, t / total))))
      if (timeEl.current) timeEl.current.textContent = fmtTime(t)
    },
    [arr.totalSec],
  )

  const paint = useCallback(
    (idx: number) => {
      // Tô màu phần lời đã hát / chưa hát
      for (const [id, el] of segEls.current) {
        const e = arr.segEvent.get(id) ?? -1
        el.style.setProperty('--p', e < idx ? '1' : '0')
      }
      const first = arr.events[idx]?.segIds[0]
      if (first) segEls.current.get(first)?.closest('.line')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [arr],
  )

  const loop = useCallback(
    function tick() {
      const t = engine.songTime
      const ev0 = arr.events[0]
      if (!ev0) return
      showTime(t)
      const startAt = activeRef.current < 0 ? (arr.events[startFrom.current]?.startSec ?? 0) : -Infinity
      if (t < startAt) {
        setCountdown(Math.ceil(startAt - t))
      } else {
        setCountdown(null)
        const idx = findEvent(arr, t)
        if (idx !== activeRef.current) {
          activeRef.current = idx
          setActive(idx)
          paint(idx)
        }
        // Chạy màu karaoke trong hợp âm hiện tại, chia theo độ dài chữ
        const ev = arr.events[idx]
        const p = Math.min(1, Math.max(0, (t - ev.startSec) / (ev.endSec - ev.startSec)))
        const els = ev.segIds.map((id) => segEls.current.get(id)).filter((e): e is HTMLElement => !!e)
        const lens = els.map((e) => Math.max(1, e.textContent?.length ?? 1))
        const total = lens.reduce((a, b) => a + b, 0)
        let acc = 0
        els.forEach((el, i) => {
          const from = acc / total
          acc += lens[i]
          const to = acc / total
          el.style.setProperty('--p', String(Math.min(1, Math.max(0, (p - from) / (to - from)))))
        })
      }
      raf.current = requestAnimationFrame(tick)
    },
    [arr, paint, showTime],
  )

  const play = useCallback(
    async (fromIndex: number, countdownSec: number) => {
      if (!arr.events.length) return
      setError(null)
      setPopover(null)
      // Tải tiếng đàn ngay trong lúc người dùng bấm (trình duyệt chỉ cho bật âm thanh lúc này),
      // màn quảng cáo hiện song song nên tải xong là vào hát luôn
      const loading = engine.init()
      loading.catch(() => undefined)
      if (!(await beforePlay())) return
      setStatus('loading')
      try {
        await loading
      } catch (e) {
        setStatus('idle')
        setError('Không tải được tiếng đàn: ' + String(e))
        return
      }
      cancelAnimationFrame(raf.current)
      engine.setVolume(settings.volume)
      startFrom.current = fromIndex
      activeRef.current = -1
      paint(fromIndex)
      engine.start(notes, arr.events[fromIndex].startSec, countdownSec, arr.totalSec, () => {
        cancelAnimationFrame(raf.current)
        setStatus('idle')
        setCountdown(null)
        track('finish')
      })
      setStatus('playing')
      track('play')
      raf.current = requestAnimationFrame(loop)
    },
    [arr, notes, settings.volume, paint, loop, beforePlay],
  )

  const stop = useCallback(() => {
    engine.stop()
    cancelAnimationFrame(raf.current)
    activeRef.current = -1
    setActive(-1)
    setCountdown(null)
    setStatus('idle')
    paint(0)
    showTime(0)
  }, [paint, showTime])

  const togglePause = useCallback(() => {
    if (status === 'playing') {
      engine.pause()
      cancelAnimationFrame(raf.current)
      setStatus('paused')
    } else if (status === 'paused') {
      engine.resume()
      setStatus('playing')
      raf.current = requestAnimationFrame(loop)
    } else if (status === 'idle') {
      play(0, settings.countdownSec)
    }
  }, [status, loop, play, settings.countdownSec])

  useEffect(() => engine.setVolume(settings.volume), [settings.volume])
  useEffect(() => onPlayingChange(status !== 'idle'), [status, onPlayingChange])

  // Rời màn hình hát thì dừng đàn
  useEffect(
    () => () => {
      engine.stop()
      cancelAnimationFrame(raf.current)
      onPlayingChange(false)
    },
    [onPlayingChange],
  )

  // Phím Space: phát / tạm dừng
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) =>
      e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea, select')
    const onKey = (e: KeyboardEvent) => {
      if (!isSpace(e)) return
      e.preventDefault()
      if (!e.repeat) togglePause()
    }
    // Nút đang focus sẽ tự "click" khi nhả Space, chặn lại để không bị bật/tắt 2 lần
    const onKeyUp = (e: KeyboardEvent) => isSpace(e) && e.preventDefault()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [togglePause])

  const onChordClick = (index: number) => {
    if (status === 'playing' || status === 'paused') play(index, Math.min(settings.countdownSec, 2))
    else setPopover(popover === index ? null : index)
  }

  const current = arr.events[active] ?? (status === 'idle' ? arr.events[0] : undefined)
  const next = current ? arr.events[current.index + 1] : arr.events[0]
  const flats = arr.targetKey ? keyUsesFlats(arr.targetKey.tonic, arr.targetKey.minor) : false

  const chordCard = (ev: (typeof arr.events)[number] | undefined, title: string, big: boolean) => {
    if (!ev) return null
    const v = getVoicing(ev.chord, settings.capo)
    return (
      <div className={`chord-card ${big ? 'big' : ''}`}>
        <div className="chord-card-title">{title}</div>
        {/* key đổi theo hợp âm để chữ nảy nhẹ mỗi lần đổi */}
        <div key={ev.index} className="chord-card-name">
          {ev.label}
        </div>
        <ChordDiagram diagram={v.diagram} />
        {settings.capo > 0 && (
          <small>
            Capo {settings.capo}: thế {chordToString(transposeChord(ev.chord, -settings.capo), flats)}
          </small>
        )}
      </div>
    )
  }

  if (!arr.events.length) {
    return (
      <div className="empty">
        <p className="empty-title">Chưa có gì để hát</p>
        <p>Dán lời bài hát có hợp âm vào, web sẽ đệm đàn và chạy chữ cho bạn.</p>
        <a className="btn primary" href={href('soan')}>
          <Icon name="pen" /> Soạn bài
        </a>
      </div>
    )
  }

  const busy = status === 'playing' || status === 'paused'

  return (
    <div className="player">
      {error && <div className="error player-error">{error}</div>}

      <div className="player-body">
        <div className="lyrics">
          {song.sections.map((sec, si) => (
            <section key={si}>
              {sec.name && <h3 className="section-name">{sec.name}</h3>}
              {sec.lines.map((line, li) =>
                line.segments.length === 0 ? (
                  <div key={li} className="spacer" />
                ) : (
                  <div key={li} className="line">
                    {line.segments.map((seg, gi) => {
                      const id = segId(si, li, gi)
                      const evIdx = arr.segEvent.get(id) ?? -1
                      const ev = seg.chord ? arr.events[evIdx] : undefined
                      return (
                        <span key={gi} className={`seg ${evIdx === active ? 'active' : ''}`}>
                          <span className="chord-slot">
                            {ev && (
                              <button
                                className={`chord ${ev.index === active ? 'on' : ''}`}
                                onClick={() => onChordClick(ev.index)}
                                aria-label={busy ? `Phát từ hợp âm ${ev.label}` : `Chỉnh hợp âm ${ev.label}`}
                              >
                                {ev.label}
                                {durations[ev.index] !== undefined && (
                                  <sup className="bars">{barLabel(durations[ev.index])}</sup>
                                )}
                              </button>
                            )}
                            {/* Giữ cả hợp âm vừa qua để nốt của nó bay hết rồi mới gỡ */}
                            {ev && busy && (ev.index === active || ev.index === active - 1) && <NoteBurst />}
                            {ev && popover === ev.index && (
                              <span className="popover" onClick={(e) => e.stopPropagation()}>
                                <span className="popover-title">Hợp âm này dài bao nhiêu ô nhịp</span>
                                <span className="popover-bars">
                                  {BAR_OPTIONS.map((b) => (
                                    <button
                                      key={b}
                                      className={ev.bars === b ? 'sel' : ''}
                                      onClick={() => {
                                        onSetDuration(ev.index, b === settings.defaultBars ? null : b)
                                        setPopover(null)
                                      }}
                                    >
                                      {barLabel(b)}
                                    </button>
                                  ))}
                                </span>
                                <button className="btn primary" onClick={() => play(ev.index, settings.countdownSec)}>
                                  <Icon name="play" size={16} /> Phát từ đây
                                </button>
                              </span>
                            )}
                          </span>
                          <span
                            className="text"
                            ref={(el) => {
                              if (el) segEls.current.set(id, el)
                              else segEls.current.delete(id)
                            }}
                          >
                            {seg.text || ' '}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                ),
              )}
            </section>
          ))}
        </div>

        <aside className="now" aria-live="polite">
          {chordCard(current, status === 'idle' ? 'Hợp âm đầu' : 'Đang đàn', true)}
          {chordCard(next, 'Tiếp theo', false)}
        </aside>
      </div>

      <div className="transport">
        <button
          className="play-btn"
          onClick={togglePause}
          disabled={status === 'loading'}
          aria-label={status === 'playing' ? 'Tạm dừng' : 'Phát'}
        >
          {status === 'loading' ? <span className="spinner" /> : <Icon name={status === 'playing' ? 'pause' : 'play'} size={26} />}
        </button>
        <button className="icon-btn stop-btn" onClick={stop} disabled={!busy} aria-label="Dừng hẳn">
          <Icon name="stop" size={18} />
        </button>
        <div className="progress-wrap">
          <div className="progress" ref={progressEl}>
            <span />
          </div>
          <div className="times">
            <span ref={timeEl}>0:00</span>
            <span className="hint transport-hint">
              {status === 'loading'
                ? 'Đang tải tiếng đàn…'
                : busy
                  ? 'Bấm một hợp âm để nhảy tới đó'
                  : 'Bấm hợp âm để chỉnh độ dài. Phím cách để phát hoặc dừng'}
            </span>
            <span>{fmtTime(arr.totalSec)}</span>
          </div>
        </div>
      </div>

      {countdown !== null && (
        <div className="countdown" role="status">
          <div className="countdown-num">{countdown}</div>
          <div>Chuẩn bị vào bài</div>
        </div>
      )}
    </div>
  )
}
