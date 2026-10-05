// Split / bonus adjustment.
//
// NSE bhavcopy prices are raw. A 1:1 bonus halves the price overnight and, left alone,
// shows up as a 50% crash that poisons every moving average, 52-week range and return.
// The MCP corporate-actions feed only reaches back about a year, so it cannot be the
// only source: RELIANCE's Oct 2024 bonus and BAJFINANCE's Jun 2025 split are both absent.
//
// So each event is established two ways:
//   1. feed    - a SPLIT/BONUS from get_corporate_actions, accepted only if the price
//                actually gapped by roughly that factor on the ex-date.
//   2. inferred - an overnight gap that no price band allows and that lands on a
//                ratio a split or bonus can produce.

export interface RawBar {
  d: string // yyyy-MM-dd
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface FeedAction {
  exDate: string
  actionType: string
  purpose: string
  adjustmentFactor: number
}

export interface AdjEvent {
  d: string
  type: 'SPLIT' | 'BONUS' | 'ADJ'
  label: string
  f: number // multiply earlier prices by this
  src: 'feed' | 'inferred'
}

// Factors a bonus (a:b -> b/(a+b)) or a face-value split (new/old) can produce, alone or
// combined. Price alone cannot say which it was, so inferred events are labelled by
// what happened to the share count.
const RATIOS: [number, string][] = [
  [1 / 2, 'Shares doubled (1:1 bonus or 2-for-1 split)'],
  [1 / 3, 'Shares tripled (2:1 bonus or 3-for-1 split)'],
  [2 / 3, '3 shares for every 2 (1:2 bonus)'],
  [1 / 4, '4 shares for every 1 (bonus and/or split)'],
  [1 / 5, '5 shares for every 1 (bonus and/or split)'],
  [3 / 5, '5 shares for every 3 (2:3 bonus)'],
  [1 / 6, '6 shares for every 1 (bonus and/or split)'],
  [1 / 10, '10 shares for every 1 (bonus and/or split)'],
  [1 / 20, '20 shares for every 1 (bonus and/or split)'],
]

// NSE's widest daily price band is 20%, and F&O names (no band) essentially never
// open 35% lower. Anything below this is treated as a capital change, not a move.
const GAP_THRESHOLD = 0.65
const SNAP_TOLERANCE = 0.06

function snap(ratio: number): [number, string] | null {
  let best: [number, string] | null = null
  let bestErr = SNAP_TOLERANCE
  for (const [f, label] of RATIOS) {
    const err = Math.abs(ratio / f - 1)
    if (err < bestErr) {
      best = [f, label]
      bestErr = err
    }
  }
  return best
}

export function findEvents(bars: RawBar[], feed: FeedAction[]): AdjEvent[] {
  const events: AdjEvent[] = []
  const idx = new Map(bars.map((b, i) => [b.d, i]))

  for (const a of feed) {
    if (a.actionType !== 'SPLIT' && a.actionType !== 'BONUS') continue
    const f = a.adjustmentFactor
    if (!(f > 0 && f < 1)) continue
    // First session on or after the ex-date.
    let i = idx.get(a.exDate)
    if (i === undefined) i = bars.findIndex((b) => b.d >= a.exDate)
    if (i === undefined || i <= 0) continue
    const gap = bars[i].o / bars[i - 1].c
    if (Math.abs(gap / f - 1) > 0.15) continue // the feed says so, the tape does not
    events.push({ d: bars[i].d, type: a.actionType, label: a.purpose, f, src: 'feed' })
  }

  for (let i = 1; i < bars.length; i++) {
    const gap = bars[i].o / bars[i - 1].c
    if (!(gap < GAP_THRESHOLD)) continue
    // Skip if the feed already explained a gap within a few sessions of this one.
    if (events.some((e) => Math.abs((idx.get(e.d) ?? -99) - i) <= 3)) continue
    const s = snap(gap)
    if (!s) continue
    events.push({ d: bars[i].d, type: 'ADJ', label: s[1], f: s[0], src: 'inferred' })
  }

  return events.sort((a, b) => (a.d < b.d ? -1 : 1))
}

// The NSE server has holes in its history (most of 2023 is missing as of Oct 2026).
// Indicators and gap detection must never run across one, so keep only the unbroken
// stretch that ends at the latest bar.
export function latestContinuous(bars: RawBar[], maxGapDays = 45): RawBar[] {
  for (let i = bars.length - 1; i > 0; i--) {
    if (Date.parse(bars[i].d) - Date.parse(bars[i - 1].d) > maxGapDays * 864e5) return bars.slice(i)
  }
  return bars
}

// Back-adjust: scale every bar before an ex-date so the series is continuous and
// the most recent prices stay exactly as traded.
export function adjust(bars: RawBar[], events: AdjEvent[]): RawBar[] {
  const out = bars.map((b) => ({ ...b }))
  let factor = 1
  let e = events.length - 1
  for (let i = out.length - 1; i >= 0; i--) {
    while (e >= 0 && events[e].d > out[i].d) {
      factor *= events[e].f
      e--
    }
    if (factor !== 1) {
      const b = out[i]
      b.o *= factor
      b.h *= factor
      b.l *= factor
      b.c *= factor
      b.v = Math.round(b.v / factor)
    }
  }
  return out
}
