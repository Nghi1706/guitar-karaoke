// Phát tiếng đàn bằng Tone.js với bộ mẫu âm guitar nylon FreePats (CC0).

import * as Tone from 'tone'
import type { NoteEvent } from '../lib/arrange'

// Tên file mẫu âm trong public/samples/nylon (dấu # đổi thành "s" cho URL an toàn)
const SAMPLE_NOTES = (
  'G1 G#1 A1 A#1 B1 C2 C#2 D2 D#2 E2 F2 G2 A2 B2 C3 D3 E3 F3 F#3 G3 G#3 A3 A#3 B3 ' +
  'C4 C#4 D4 D#4 E4 F4 F#4 G4 A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5 A#5 B5 C6'
).split(' ')

export class GuitarEngine {
  private sampler: Tone.Sampler | null = null
  private click: Tone.PolySynth | null = null
  private loading: Promise<void> | null = null
  private countdownSec = 0
  private offsetSec = 0

  // Phải gọi từ một thao tác của người dùng (bấm nút), trình duyệt mới cho phát âm thanh
  init(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        await Tone.start()
        Tone.getContext().lookAhead = 0.05
        const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).toDestination()
        await reverb.ready
        const urls = Object.fromEntries(SAMPLE_NOTES.map((n) => [n, n.replace('#', 's') + '.mp3']))
        this.sampler = new Tone.Sampler({
          urls,
          baseUrl: import.meta.env.BASE_URL + 'samples/nylon/',
          release: 0.6,
        }).connect(reverb)
        this.click = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 },
          volume: -8,
        }).toDestination()
        await Tone.loaded()
      })()
    }
    return this.loading
  }

  setVolume(db: number) {
    Tone.getDestination().volume.value = db
  }

  /**
   * Lên lịch phát: đếm ngược `countdownSec` giây, rồi phát các nốt từ mốc `offsetSec` của bài.
   */
  start(notes: NoteEvent[], offsetSec: number, countdownSec: number, endSec: number, onEnd: () => void) {
    const sampler = this.sampler
    const click = this.click
    if (!sampler || !click) throw new Error('Engine chưa khởi tạo')
    this.stop()
    const transport = Tone.getTransport()
    this.countdownSec = countdownSec
    this.offsetSec = offsetSec

    for (let i = 0; i < countdownSec; i++) {
      const last = i === Math.ceil(countdownSec) - 1
      transport.schedule((time) => click.triggerAttackRelease(last ? 'A5' : 'E5', 0.05, time), i)
    }
    for (const n of notes) {
      if (n.time < offsetSec - 0.001) continue
      const note = Tone.Frequency(n.midi, 'midi').toNote()
      transport.schedule(
        (time) => sampler.triggerAttackRelease(note, n.duration, time, n.velocity),
        countdownSec + n.time - offsetSec,
      )
    }
    transport.schedule(
      (time) => {
        Tone.getDraw().schedule(onEnd, time)
      },
      countdownSec + endSec - offsetSec,
    )
    transport.start()
  }

  pause() {
    Tone.getTransport().pause()
    this.sampler?.releaseAll()
  }

  resume() {
    Tone.getTransport().start()
  }

  stop() {
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    this.sampler?.releaseAll()
  }

  /** Vị trí hiện tại trong bài (giây). Âm = đang đếm ngược. Tính theo tiếng thật đang phát ra loa. */
  get songTime(): number {
    const transport = Tone.getTransport()
    const t = transport.state === 'started' ? transport.getSecondsAtTime(Tone.immediate()) : transport.seconds
    return t - this.countdownSec + this.offsetSec
  }
}

export const engine = new GuitarEngine()
