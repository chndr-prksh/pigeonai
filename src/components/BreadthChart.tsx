import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { isoDay, type MarketFile } from '../lib/data.ts'
import { CHART_COLORS, type Theme } from '../lib/store.ts'
import { day } from '../lib/format.ts'

// Share of the universe trading above its 200- and 50-day averages, through time.
export function BreadthChart({ market, theme }: { market: MarketFile; theme: Theme }) {
  const el = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const times = useMemo(() => market.t.map(isoDay), [market])
  const C = CHART_COLORS[theme]

  useEffect(() => {
    if (!el.current) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: 'inherit', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: C.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.02 } },
      timeScale: { borderColor: C.border, rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false }, vertLine: { color: C.crosshair, labelBackgroundColor: C.crosshair } },
      handleScale: false,
      handleScroll: false,
      localization: { priceFormatter: (p: number) => `${p.toFixed(0)}%` },
    })
    const add = (values: (number | null)[], color: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) })
      s.setData(times.map((time, i) => (values[i] == null ? { time } : { time, value: values[i]! })))
      return s
    }
    const s200 = add(market.above200, C.s1)
    add(market.above50, C.s2)
    s200.createPriceLine({ price: 50, color: C.crosshair, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
    // Scrolling is off, so the whole history always fills the width, including after a resize.
    chart.timeScale().fitContent()
    chart.timeScale().subscribeSizeChange(() => chart.timeScale().fitContent())
    const index = new Map(times.map((t, i) => [t, i]))
    chart.subscribeCrosshairMove((p) => setHover(p.time ? (index.get(String(p.time)) ?? null) : null))
    return () => chart.remove()
  }, [market, times, C])

  const i = hover ?? times.length - 1
  const val = (x: number | null) => (x == null ? '–' : `${x.toFixed(1)}%`)

  return (
    <div>
      <div className="legend-row">
        <span><span className="swatch" style={{ background: C.s1 }} />Above 200 DMA <b>{val(market.above200[i])}</b></span>
        <span><span className="swatch" style={{ background: C.s2 }} />Above 50 DMA <b>{val(market.above50[i])}</b></span>
        <span className="muted">{day(market.t[i])}</span>
      </div>
      <div ref={el} style={{ height: 260 }} />
    </div>
  )
}
