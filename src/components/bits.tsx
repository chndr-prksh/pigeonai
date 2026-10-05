import type { ReactNode } from 'react'
import { pct, sign } from '../lib/format.ts'
import { SCAN_BY_ID } from '../lib/scans.ts'
import { useWatchlist } from '../lib/store.ts'

export function Sparkline({ values, width = 84, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  const dir = sign(values[values.length - 1] - values[0])
  return (
    <svg className={`spark ${dir}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Change({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return <span className={sign(value)}>{pct(value, digits)}</span>
}

// A cell tinted by the sign and size of a return; the number stays in ink.
export function HeatCell({ value, scale }: { value: number | null; scale: number }) {
  if (value == null) return <td className="num muted">–</td>
  const strength = Math.min(1, Math.abs(value) / scale)
  const tone = value >= 0 ? 'var(--up-rgb)' : 'var(--down-rgb)'
  return (
    <td className="num heat" style={{ background: `rgba(${tone}, ${(0.06 + strength * 0.34).toFixed(2)})` }}>
      {pct(value)}
    </td>
  )
}

export function SignalChip({ id, href }: { id: string; href?: string }) {
  const def = SCAN_BY_ID[id]
  if (!def) return null
  const body = (
    <>
      <span className="dot" aria-hidden="true" />
      {def.name}
    </>
  )
  return href ? (
    <a className={`sig ${def.bias}`} href={href} title={def.desc}>{body}</a>
  ) : (
    <span className={`sig ${def.bias}`} title={def.desc}>{body}</span>
  )
}

export function Star({ symbol }: { symbol: string }) {
  const { has, toggle } = useWatchlist()
  const on = has(symbol)
  return (
    <button
      className={`star ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(symbol)
      }}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

export function Loading({ error, what }: { error: string | null; what: string }) {
  return (
    <div className="empty">
      {error ? (
        <>
          <b>Couldn’t load {what}.</b>
          <span>Run <code>npm run data</code> to build the data files, then reload.</span>
        </>
      ) : (
        <span>Loading {what}…</span>
      )}
    </div>
  )
}

// Where a value sits between a low and a high, e.g. close within the 52-week range.
export function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const p = high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0.5
  return (
    <div className="rangebar" role="img" aria-label={`${Math.round(p * 100)}% of the way from low to high`}>
      <span style={{ left: `${p * 100}%` }} />
    </div>
  )
}

export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
