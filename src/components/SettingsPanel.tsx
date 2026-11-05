import { STYLES, getStyle } from '../config/styles'
import type { Settings } from '../lib/arrange'
import { type Key, keyName } from '../lib/chordName'

interface Props {
  settings: Settings
  detectedKey: Key | null
  disabled: boolean
  onChange: (s: Settings) => void
}

const KEY_OPTIONS = Array.from({ length: 12 }, (_, i) => i)

export function SettingsPanel({ settings, detectedKey, disabled, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  const key = settings.originalKey ?? detectedKey
  const transposeTo = (t: number) => set('transpose', ((((t + 6) % 12) + 12) % 12) - 6) // giữ trong khoảng -6..+5

  return (
    <div className="settings">
      <fieldset disabled={disabled}>
        <label>
          Điệu
          <select
            value={settings.styleId}
            onChange={(e) => {
              const style = getStyle(e.target.value)
              onChange({ ...settings, styleId: style.id, bpm: style.defaultBpm })
            }}
          >
            {STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.timeSignature})
              </option>
            ))}
          </select>
        </label>

        <label>
          Cách đánh
          <select value={settings.playMode} onChange={(e) => set('playMode', e.target.value as Settings['playMode'])}>
            <option value="auto">Tự động</option>
            <option value="arpeggio">Luôn rải</option>
            <option value="strum">Luôn quạt</option>
          </select>
          {settings.playMode === 'auto' && <small>rải ở phiên khúc, quạt ở điệp khúc (đoạn ĐK, Chorus)</small>}
        </label>

        <label>
          Tempo: <b>{settings.bpm} BPM</b>
          <input
            type="range"
            min={40}
            max={160}
            value={settings.bpm}
            onChange={(e) => set('bpm', Number(e.target.value))}
          />
        </label>

        <label>
          Tông gốc
          <select
            value={key ? `${key.tonic}${key.minor ? 'm' : ''}` : ''}
            onChange={(e) => {
              const v = e.target.value
              set('originalKey', v ? { tonic: parseInt(v), minor: v.endsWith('m') } : null)
            }}
          >
            {!key && <option value="">(chưa có hợp âm)</option>}
            {KEY_OPTIONS.flatMap((t) => [false, true].map((minor) => ({ tonic: t, minor }))).map((k) => (
              <option key={`${k.tonic}${k.minor}`} value={`${k.tonic}${k.minor ? 'm' : ''}`}>
                {keyName(k)}
              </option>
            ))}
          </select>
          {!settings.originalKey && detectedKey && <small>tự đoán theo hợp âm đầu bài</small>}
        </label>

        <label>
          Tông hát
          <div className="row">
            <button type="button" onClick={() => transposeTo(settings.transpose - 1)}>
              −
            </button>
            <b className="grow center">
              {key ? keyName({ tonic: (key.tonic + settings.transpose + 12) % 12, minor: key.minor }) : '—'}
              {settings.transpose !== 0 && ` (${settings.transpose > 0 ? '+' : ''}${settings.transpose})`}
            </b>
            <button type="button" onClick={() => transposeTo(settings.transpose + 1)}>
              +
            </button>
          </div>
        </label>

        <label>
          Capo
          <select value={settings.capo} onChange={(e) => set('capo', Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Không capo' : `Capo ${i}`}
              </option>
            ))}
          </select>
          <small>chỉ đổi thế bấm, giúp tiếng đàn sáng hơn; tông vẫn giữ nguyên</small>
        </label>

        <label>
          Đếm ngược trước khi vào bài
          <select value={settings.countdownSec} onChange={(e) => set('countdownSec', Number(e.target.value))}>
            {[0, 3, 5, 8, 10].map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Không đếm' : `${s} giây`}
              </option>
            ))}
          </select>
        </label>

        <label>
          Mỗi hợp âm mặc định
          <select value={settings.defaultBars} onChange={(e) => set('defaultBars', Number(e.target.value))}>
            <option value={0.5}>½ ô nhịp</option>
            <option value={1}>1 ô nhịp</option>
            <option value={2}>2 ô nhịp</option>
          </select>
        </label>
      </fieldset>

      <label>
        Âm lượng
        <input
          type="range"
          min={-30}
          max={6}
          value={settings.volume}
          onChange={(e) => set('volume', Number(e.target.value))}
        />
      </label>
    </div>
  )
}
