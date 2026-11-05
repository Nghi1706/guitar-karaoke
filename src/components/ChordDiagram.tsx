import type { Diagram } from '../lib/voicing'

const W = 92
const H = 108
const LEFT = 16
const TOP = 22
const STRING_GAP = 12
const FRET_GAP = 20
const FRETS = 4

export function ChordDiagram({ diagram }: { diagram: Diagram | null }) {
  if (!diagram) return <div className="diagram-missing">Không có sơ đồ</div>
  const x = (s: number) => LEFT + s * STRING_GAP
  const y = (f: number) => TOP + f * FRET_GAP
  const right = x(5)

  return (
    <svg className="diagram" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {diagram.baseFret === 1 ? (
        <rect x={LEFT} y={TOP - 3} width={right - LEFT} height={3} fill="currentColor" />
      ) : (
        <text x={2} y={y(0.65)} fontSize={10} fill="currentColor">
          {diagram.baseFret}
        </text>
      )}
      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line key={`f${f}`} x1={LEFT} x2={right} y1={y(f)} y2={y(f)} stroke="currentColor" strokeOpacity={0.5} />
      ))}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={TOP} y2={y(FRETS)} stroke="currentColor" strokeOpacity={0.7} />
      ))}
      {diagram.barres.map((b) => {
        const strings = diagram.frets.map((f, i) => (f === b ? i : -1)).filter((i) => i >= 0)
        if (strings.length < 2) return null
        return (
          <rect
            key={`b${b}`}
            x={x(strings[0]) - 4}
            y={y(b - 0.5) - 4}
            width={x(strings[strings.length - 1]) - x(strings[0]) + 8}
            height={8}
            rx={4}
            className="diagram-dot"
          />
        )
      })}
      {diagram.frets.map((f, s) => {
        if (f < 0)
          return (
            <text key={s} x={x(s)} y={TOP - 7} fontSize={9} textAnchor="middle" fill="currentColor">
              ×
            </text>
          )
        if (f === 0) return <circle key={s} cx={x(s)} cy={TOP - 10} r={3} fill="none" stroke="currentColor" />
        return <circle key={s} cx={x(s)} cy={y(f - 0.5)} r={4.5} className="diagram-dot" />
      })}
    </svg>
  )
}
