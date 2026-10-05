import { useMemo } from 'react'
import { BreadthChart } from '../components/BreadthChart.tsx'
import { Change, HeatCell, Loading } from '../components/bits.tsx'
import { useMarket, useScan, type Row } from '../lib/data.ts'
import { price } from '../lib/format.ts'
import { SCANS } from '../lib/scans.ts'
import { screenerHref, stockHref, type Theme } from '../lib/store.ts'

function Movers({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <table className="plain">
        <tbody>
          {rows.map((r) => (
            <tr key={r.s}>
              <td>
                <a href={stockHref(r.s)} className="sym">{r.s}</a>
                <span className="sub">{r.name}</span>
              </td>
              <td className="num">{price(r.close)}</td>
              <td className="num"><Change value={r.chg} digits={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function Market({ theme }: { theme: Theme }) {
  const scan = useScan()
  const market = useMarket()

  const derived = useMemo(() => {
    if (!scan.data) return null
    const rows = scan.data.rows
    const byChg = [...rows].sort((a, b) => b.chg - a.chg)
    const counts = new Map<string, number>()
    for (const r of rows) for (const id of r.sig) counts.set(id, (counts.get(id) ?? 0) + 1)
    return {
      adv: rows.filter((r) => r.chg > 0).length,
      dec: rows.filter((r) => r.chg < 0).length,
      gainers: byChg.slice(0, 6),
      losers: byChg.slice(-6).reverse(),
      counts,
    }
  }, [scan.data])

  if (!scan.data || !market.data || !derived) return <Loading error={scan.error ?? market.error} what="market data" />

  const m = market.data
  const last = m.t.length - 1
  const total = scan.data.count
  const flat = total - derived.adv - derived.dec

  return (
    <div className="page">
      <header className="page-head">
        <h1>Market breadth</h1>
        <p className="muted">{scan.data.universe} · {total} stocks · split and bonus adjusted</p>
      </header>

      <div className="tiles">
        <div className="tile wide">
          <span className="tile-label">Advances / declines</span>
          <div className="tile-value">
            <span className="up">{derived.adv}</span>
            <span className="muted"> / </span>
            <span className="down">{derived.dec}</span>
          </div>
          <div className="adbar" role="img" aria-label={`${derived.adv} advancing, ${flat} unchanged, ${derived.dec} declining`}>
            <span className="a" style={{ flex: derived.adv }} />
            <span className="f" style={{ flex: flat }} />
            <span className="d" style={{ flex: derived.dec }} />
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">Above 200 DMA</span>
          <div className="tile-value">{m.above200[last]?.toFixed(0) ?? '–'}%</div>
        </div>
        <div className="tile">
          <span className="tile-label">Above 50 DMA</span>
          <div className="tile-value">{m.above50[last]?.toFixed(0) ?? '–'}%</div>
        </div>
        <a className="tile link" href={screenerHref({ scans: 'hi52' })}>
          <span className="tile-label">New 52-week highs</span>
          <div className="tile-value">{derived.counts.get('hi52') ?? 0}</div>
        </a>
        <a className="tile link" href={screenerHref({ scans: 'lo52' })}>
          <span className="tile-label">New 52-week lows</span>
          <div className="tile-value">{derived.counts.get('lo52') ?? 0}</div>
        </a>
      </div>

      <section className="card">
        <h2>Participation</h2>
        <p className="card-sub">Share of stocks trading above their own moving averages. Readings under 50% mean most stocks are in a downtrend, whatever the index says.</p>
        <BreadthChart market={m} theme={theme} />
      </section>

      <div className="grid-2">
        <Movers title="Top gainers" rows={derived.gainers} />
        <Movers title="Top losers" rows={derived.losers} />
      </div>

      <div className="grid-2 uneven">
        <section className="card">
          <h2>Sectors</h2>
          <p className="card-sub">Median return of the stocks in each sector, so one heavyweight cannot carry the group.</p>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="num">Stocks</th>
                  <th className="num">1D</th>
                  <th className="num">1W</th>
                  <th className="num">1M</th>
                  <th className="num">3M</th>
                  <th className="num">1Y</th>
                  <th className="num" title="Share of the sector’s stocks above their 200-day average">&gt; 200 DMA</th>
                </tr>
              </thead>
              <tbody>
                {m.sectors.map((s) => (
                  <tr key={s.name}>
                    <td><a href={screenerHref({ sector: s.name })}>{s.name}</a></td>
                    <td className="num muted">{s.n}</td>
                    <HeatCell value={s.chg} scale={2} />
                    <HeatCell value={s.r1w} scale={5} />
                    <HeatCell value={s.r1m} scale={10} />
                    <HeatCell value={s.r3m} scale={20} />
                    <HeatCell value={s.r1y} scale={40} />
                    <td className="num">{Number.isFinite(s.above200) ? `${s.above200}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Scans today</h2>
          <p className="card-sub">How many stocks each scan flagged at the last close.</p>
          <ul className="scanlist">
            {SCANS.filter((s) => derived.counts.get(s.id)).sort((a, b) => derived.counts.get(b.id)! - derived.counts.get(a.id)!).map((s) => (
              <li key={s.id}>
                <a href={screenerHref({ scans: s.id })} title={s.desc}>
                  <span className={`sig ${s.bias}`}><span className="dot" aria-hidden="true" />{s.name}</span>
                  <b>{derived.counts.get(s.id)}</b>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
