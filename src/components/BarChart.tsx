import { useLayoutEffect, useRef, useState } from 'react'

// Biểu đồ cột một chuỗi số theo ngày: cột ≤ 24px, đầu bo 4px, khe 2px, lưới mảnh, rê chuột xem số.

interface Point {
  label: string // hiện trên trục và trong tooltip
  value: number
}

interface Props {
  title: string
  points: Point[]
  format: (n: number) => string
  height?: number
}

const PAD = { top: 12, right: 8, bottom: 22, left: 44 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

const compact = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}tr` : n >= 1e4 ? `${+(n / 1e3).toFixed(0)}k` : n.toLocaleString('vi-VN')

export function BarChart({ title, points, format, height = 160 }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const slot = plotW / Math.max(1, points.length)
  const barW = Math.max(2, Math.min(24, slot - 2))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56)))
  const total = points.reduce((a, p) => a + p.value, 0)

  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        <b>{format(total)}</b>
      </figcaption>
      <div className="chart-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={`${title}: tổng ${format(total)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = PAD.left + slot * i + slot / 2
            const top = y(p.value)
            const h = PAD.top + plotH - top
            const r = Math.min(4, h, barW / 2)
            const x0 = cx - barW / 2
            const base = PAD.top + plotH
            return (
              <g key={i}>
                {h > 0 && (
                  <path
                    className={`chart-bar ${hover === i ? 'on' : ''}`}
                    d={`M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text className="chart-tick" x={cx} y={height - 6} textAnchor="middle">
                    {p.label}
                  </text>
                )}
                {/* vùng rê chuột rộng hơn cột */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              </g>
            )
          })}
        </svg>
        {hover !== null && points[hover] && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(width - 120, Math.max(0, PAD.left + slot * hover + slot / 2 - 60)),
            }}
          >
            <span>{points[hover].label}</span>
            <b>{format(points[hover].value)}</b>
          </div>
        )}
      </div>
    </figure>
  )
}
