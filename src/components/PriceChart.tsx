import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { isoDay, type History } from '../lib/data.ts'
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.ts'
import type { Pivots } from '../lib/scans.ts'
import { CHART_COLORS, type Theme } from '../lib/store.ts'
import { day, pct, price, sign, volume } from '../lib/format.ts'

const RANGES = [
  ['3M', 63],
  ['6M', 126],
  ['1Y', 252],
  ['2Y', 504],
  ['Max', Infinity],
] as const

const MAIN_HEIGHT = 440
const VOLUME_HEIGHT = 90
const PANE_HEIGHT = 120

type Overlay = 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'bb'
type Pane = 'volume' | 'rsi' | 'macd'

const OVERLAYS: { id: Overlay; label: string; color: 's1' | 's2' | 's3' | 's4' | 'band' }[] = [
  { id: 'sma20', label: 'SMA 20', color: 's1' },
  { id: 'sma50', label: 'SMA 50', color: 's2' },
  { id: 'sma200', label: 'SMA 200', color: 's3' },
  { id: 'ema20', label: 'EMA 20', color: 's4' },
  { id: 'bb', label: 'Bollinger', color: 'band' },
]

const PANES: { id: Pane; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'rsi', label: 'RSI' },
  { id: 'macd', label: 'MACD' },
]

function usePersistedSet<T extends string>(key: string, initial: T[]) {
  const [value, setValue] = useState<T[]>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch {
      // fall through to the default
    }
    return initial
  })
  const toggle = (id: T) => {
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id]
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // not persisted
    }
  }
  return [value, toggle] as const
}

export function PriceChart({ history, theme, pivots }: { history: History; theme: Theme; pivots?: Pivots }) {
  const el = useRef<HTMLDivElement>(null)
  const [overlays, toggleOverlay] = usePersistedSet<Overlay>('chart.overlays', ['sma50', 'sma200'])
  const [panes, togglePane] = usePersistedSet<Pane>('chart.panes', ['volume'])
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('1Y')
  const [log, setLog] = useState(false)
  const [showPivots, setShowPivots] = useState(false)
  const [adjusted, setAdjusted] = useState(true)
  const [hover, setHover] = useState<number | null>(null)

  const hasEvents = history.events.length > 0

  // Bars as charted: adjusted (as stored) or with the adjustment undone, i.e. as traded.
  const bars = useMemo(() => {
    const { t, o, h, l, c, v, events } = history
    if (adjusted || !events.length) return { t, o, h, l, c, v }
    const factor = t.map((d) => events.reduce((f, e) => (e.d > d ? f * e.f : f), 1))
    const undo = (x: number[]) => x.map((p, i) => Math.round((p / factor[i]) * 100) / 100)
    return { t, o: undo(o), h: undo(h), l: undo(l), c: undo(c), v: v.map((x, i) => Math.round(x * factor[i])) }
  }, [history, adjusted])

  const ind = useMemo(() => {
    const m = macd(bars.c)
    return {
      sma20: sma(bars.c, 20),
      sma50: sma(bars.c, 50),
      sma200: sma(bars.c, 200),
      ema20: ema(bars.c, 20),
      bb: bollinger(bars.c, 20, 2),
      rsi: rsi(bars.c, 14),
      macd: m,
    }
  }, [bars])

  const times = useMemo(() => bars.t.map(isoDay), [bars])

  useEffect(() => {
    if (!el.current) return
    const C = CHART_COLORS[theme]
    const n = times.length

    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: 'inherit',
        fontSize: 11,
        panes: { separatorColor: C.border, separatorHoverColor: C.grid, enableResize: true },
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border, mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
      timeScale: { borderColor: C.border, rightOffset: 4, minBarSpacing: 1.5 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, labelBackgroundColor: C.crosshair },
        horzLine: { color: C.crosshair, labelBackgroundColor: C.crosshair },
      },
    })

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: C.up,
      downColor: C.down,
      borderUpColor: C.up,
      borderDownColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      priceLineVisible: false,
    })
    candles.setData(times.map((time, i) => ({ time, open: bars.o[i], high: bars.h[i], low: bars.l[i], close: bars.c[i] })))

    const line = (values: number[], color: string, width: 1 | 2 = 2, pane = 0, style = LineStyle.Solid) => {
      const s = chart.addSeries(
        LineSeries,
        { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        pane,
      )
      s.setData(times.map((time, i) => (Number.isFinite(values[i]) ? { time, value: values[i] } : { time })))
      return s
    }

    for (const o of OVERLAYS) {
      if (!overlays.includes(o.id)) continue
      if (o.id === 'bb') {
        line(ind.bb.upper, C.band, 1)
        line(ind.bb.lower, C.band, 1)
      } else line(ind[o.id], C[o.color])
    }

    // Capital changes and dividends, marked on the bar where they took effect.
    const markers: SeriesMarker<Time>[] = []
    const first = bars.t[0]
    for (const e of history.events)
      if (e.d >= first) markers.push({ time: isoDay(e.d), position: 'aboveBar', shape: 'arrowDown', color: C.marker, text: e.type === 'SPLIT' ? 'Split' : e.type === 'BONUS' ? 'Bonus' : 'Adj' })
    for (const d of history.dividends)
      if (d.d >= first) markers.push({ time: isoDay(d.d), position: 'belowBar', shape: 'circle', color: C.marker, text: 'D', size: 0.6 })
    markers.sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1))
    createSeriesMarkers(candles, markers)

    // Pivot levels apply to current prices, so they are only drawn on the adjusted view.
    if (showPivots && pivots && adjusted) {
      const levels: [string, number][] = [['R2', pivots.r2], ['R1', pivots.r1], ['P', pivots.p], ['S1', pivots.s1], ['S2', pivots.s2]]
      for (const [title, value] of levels)
        candles.createPriceLine({ price: value, title, color: C.band, lineWidth: 1, lineStyle: title === 'P' ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true })
    }

    let paneIndex = 1
    const subPanes: number[] = []
    if (panes.includes('volume')) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, paneIndex)
      vol.setData(times.map((time, i) => ({ time, value: bars.v[i], color: bars.c[i] >= bars.o[i] ? C.upSoft : C.downSoft })))
      subPanes.push(paneIndex++)
    }
    if (panes.includes('rsi')) {
      const r = line(ind.rsi, C.s1, 2, paneIndex)
      for (const level of [70, 30])
        r.createPriceLine({ price: level, color: C.crosshair, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' })
      subPanes.push(paneIndex++)
    }
    if (panes.includes('macd')) {
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex)
      hist.setData(
        times.map((time, i) =>
          Number.isFinite(ind.macd.hist[i]) ? { time, value: ind.macd.hist[i], color: ind.macd.hist[i] >= 0 ? C.upSoft : C.downSoft } : { time },
        ),
      )
      line(ind.macd.line, C.s1, 2, paneIndex)
      line(ind.macd.signal, C.s2, 2, paneIndex)
      subPanes.push(paneIndex++)
    }
    // Stretch factors rather than pixel heights: they hold whatever size the chart is measured at.
    const all = chart.panes()
    all[0].setStretchFactor(MAIN_HEIGHT)
    for (const p of subPanes) all[p]?.setStretchFactor(p === 1 && panes.includes('volume') ? VOLUME_HEIGHT : PANE_HEIGHT)

    const span = RANGES.find((r) => r[0] === range)![1]
    const applyRange = () => {
      if (span >= n) chart.timeScale().fitContent()
      else chart.timeScale().setVisibleLogicalRange({ from: n - span - 0.5, to: n + 3 })
    }
    applyRange()
    // The chart is created before it has been measured; apply the range again once it has a width.
    let sized = false
    chart.timeScale().subscribeSizeChange(() => {
      if (!sized) applyRange()
      sized = true
    })

    const index = new Map(times.map((t, i) => [t, i]))
    chart.subscribeCrosshairMove((p) => setHover(p.time ? (index.get(String(p.time)) ?? null) : null))

    return () => chart.remove()
  }, [bars, ind, times, theme, overlays, panes, range, log, history, showPivots, pivots, adjusted])

  const i = hover ?? times.length - 1
  const prev = i > 0 ? bars.c[i - 1] : bars.o[i]
  const chg = (bars.c[i] / prev - 1) * 100
  const C = CHART_COLORS[theme]
  const height = MAIN_HEIGHT + (panes.includes('volume') ? VOLUME_HEIGHT : 0) + (panes.includes('rsi') ? PANE_HEIGHT : 0) + (panes.includes('macd') ? PANE_HEIGHT : 0)

  return (
    <div className="chart-card">
      <div className="chart-toolbar">
        <div className="seg" role="group" aria-label="Range">
          {RANGES.map(([r]) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Overlays">
          {OVERLAYS.map((o) => (
            <button key={o.id} className={`chip ${overlays.includes(o.id) ? 'on' : ''}`} aria-pressed={overlays.includes(o.id)} onClick={() => toggleOverlay(o.id)}>
              <span className="swatch" style={{ background: C[o.color] }} />
              {o.label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Panes">
          {PANES.map((p) => (
            <button key={p.id} className={`chip ${panes.includes(p.id) ? 'on' : ''}`} aria-pressed={panes.includes(p.id)} onClick={() => togglePane(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="chips right">
          {pivots && (
            <button className={`chip ${showPivots ? 'on' : ''}`} aria-pressed={showPivots} onClick={() => setShowPivots(!showPivots)} title="Floor pivot levels for the next session">
              Pivots
            </button>
          )}
          <button className={`chip ${log ? 'on' : ''}`} aria-pressed={log} onClick={() => setLog(!log)}>
            Log
          </button>
          {hasEvents && (
            <button
              className={`chip ${adjusted ? 'on' : 'warn'}`}
              aria-pressed={adjusted}
              onClick={() => setAdjusted(!adjusted)}
              title="Switch between prices adjusted for splits and bonuses and prices as they traded"
            >
              {adjusted ? 'Adjusted' : 'As traded'}
            </button>
          )}
        </div>
      </div>

      <div className="chart-wrap" style={{ height }}>
        <div className="chart-legend">
          <div className="ohlc">
            <span className="muted">{day(bars.t[i])}</span>
            <span><i>O</i>{price(bars.o[i])}</span>
            <span><i>H</i>{price(bars.h[i])}</span>
            <span><i>L</i>{price(bars.l[i])}</span>
            <span><i>C</i>{price(bars.c[i])}</span>
            <span className={sign(chg)}>{pct(chg, 2)}</span>
          </div>
          <div className="ohlc small">
            {OVERLAYS.filter((o) => overlays.includes(o.id)).map((o) => (
              <span key={o.id}>
                <span className="swatch" style={{ background: C[o.color] }} />
                <i>{o.label}</i>
                {o.id === 'bb' ? `${price(ind.bb.lower[i])} – ${price(ind.bb.upper[i])}` : price(ind[o.id][i])}
              </span>
            ))}
            {panes.includes('volume') && <span><i>Vol</i>{volume(bars.v[i])}</span>}
            {panes.includes('rsi') && <span><i>RSI 14</i>{Number.isFinite(ind.rsi[i]) ? ind.rsi[i].toFixed(1) : '–'}</span>}
            {panes.includes('macd') && (
              <span>
                <span className="swatch" style={{ background: C.s1 }} /><i>MACD</i>{Number.isFinite(ind.macd.line[i]) ? ind.macd.line[i].toFixed(2) : '–'}
                <span className="swatch gap" style={{ background: C.s2 }} /><i>Signal</i>{Number.isFinite(ind.macd.signal[i]) ? ind.macd.signal[i].toFixed(2) : '–'}
              </span>
            )}
          </div>
        </div>
        <div ref={el} className="chart-canvas" />
      </div>
      {!adjusted && (
        <p className="chart-note">
          Showing prices as they traded. The drop at each marked split or bonus is a change in share count, not a loss; indicators on this view are distorted by it.
        </p>
      )}
    </div>
  )
}
