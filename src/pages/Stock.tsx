import { Change, Loading, RangeBar, SignalChip, Star, Stat } from '../components/bits.tsx'
import { PriceChart } from '../components/PriceChart.tsx'
import { useHistory, useScan } from '../lib/data.ts'
import { crore, day, num, pct, price, sign, volume } from '../lib/format.ts'
import { SCAN_BY_ID, TRENDS } from '../lib/scans.ts'
import { screenerHref, type Theme } from '../lib/store.ts'

const vs = (close: number, level: number | null) => (level == null ? null : (close / level - 1) * 100)

export function Stock({ symbol, theme }: { symbol: string; theme: Theme }) {
  const scan = useScan()
  const history = useHistory(symbol)
  const row = scan.data?.rows.find((r) => r.s === symbol)

  if (history.error)
    return (
      <div className="empty">
        <b>No data for {symbol}.</b>
        <span>It may not be part of the {scan.data?.universe ?? 'covered'} universe. <a href="#/screener">Back to the screener</a></span>
      </div>
    )
  if (!history.data || !scan.data) return <Loading error={scan.error} what={symbol} />

  const h = history.data
  const n = h.c.length
  const close = h.c[n - 1]
  const chg = n > 1 ? (close / h.c[n - 2] - 1) * 100 : 0
  const stale = h.t[n - 1] < Number(scan.data.asOf.replaceAll('-', ''))

  return (
    <div className="page">
      <header className="stock-head">
        <div>
          <div className="crumbs">
            <a href={screenerHref({ sector: h.industry })}>{h.industry}</a>
          </div>
          <h1>
            {h.name} <span className="ticker">{h.s}</span> <Star symbol={h.s} />
          </h1>
        </div>
        <div className="quote">
          <span className="last">₹{price(close)}</span>
          <span className={`delta ${sign(chg)}`}>{pct(chg, 2)}</span>
          <span className="muted">Close, {day(h.t[n - 1])}</span>
        </div>
      </header>

      {stale && <p className="banner">No trades since {day(h.t[n - 1])}. This stock is left out of the scans until it trades again.</p>}

      <div className="stock-layout">
        <PriceChart history={h} theme={theme} pivots={stale ? undefined : row?.piv} />

        <aside className="side">
          {row && (
            <>
              <section className="card">
                <h2>Signals at last close</h2>
                {row.sig.length ? (
                  <ul className="siglist">
                    {row.sig.map((id) => (
                      <li key={id}>
                        <SignalChip id={id} href={screenerHref({ scans: id })} />
                        <p>{SCAN_BY_ID[id]?.desc}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="card-sub">None of the scans flagged this stock.</p>
                )}
              </section>

              <section className="card">
                <h2>52-week range</h2>
                <RangeBar low={row.lo52} high={row.hi52} value={row.close} />
                <div className="range-ends">
                  <span>{price(row.lo52)}<i>{pct(row.fromLo)} above low</i></span>
                  <span>{price(row.hi52)}<i>{row.fromHi === 0 ? 'at high' : `${pct(row.fromHi)} from high`}</i></span>
                </div>
              </section>

              <section className="card">
                <h2>Trend and momentum</h2>
                {row.trend && <p className="trendline">{TRENDS[row.trend]}</p>}
                <dl className="stats">
                  <Stat label="vs 20 DMA"><Change value={vs(row.close, row.sma20)} /></Stat>
                  <Stat label="vs 50 DMA"><Change value={vs(row.close, row.sma50)} /></Stat>
                  <Stat label="vs 200 DMA"><Change value={vs(row.close, row.sma200)} /></Stat>
                  <Stat label="RSI 14">{num(row.rsi, 1)}</Stat>
                  <Stat label="ADX 14" hint="Trend strength. Above 25 is a established trend, in either direction.">{num(row.adx, 1)}</Stat>
                  <Stat label="RS rating" hint="1–99 rank of 12-month return within the universe, latest quarter double weighted.">{num(row.rs)}</Stat>
                  <Stat label="ATR 14" hint="Average true range as a share of price: a typical day’s swing.">{row.atrPct == null ? '–' : `${row.atrPct.toFixed(1)}%`}</Stat>
                  <Stat label="Volume">{volume(row.vol)}</Stat>
                  <Stat label="vs 20-day avg">{row.volRatio == null ? '–' : `${row.volRatio.toFixed(1)}×`}</Stat>
                  <Stat label="Turnover" hint="20-day average traded value">{crore(row.turnoverCr)}</Stat>
                </dl>
              </section>

              <section className="card">
                <h2>Pivot levels</h2>
                <dl className="stats three">
                  <Stat label="R1">{price(row.piv.r1)}</Stat>
                  <Stat label="R2">{price(row.piv.r2)}</Stat>
                  <Stat label="Pivot">{price(row.piv.p)}</Stat>
                  <Stat label="S1">{price(row.piv.s1)}</Stat>
                  <Stat label="S2">{price(row.piv.s2)}</Stat>
                </dl>
                <p className="card-sub">Floor pivots for the next session, from the last session’s high, low and close.</p>
              </section>

              <section className="card">
                <h2>Returns</h2>
                <dl className="stats five">
                  <Stat label="1W"><Change value={row.r1w} /></Stat>
                  <Stat label="1M"><Change value={row.r1m} /></Stat>
                  <Stat label="3M"><Change value={row.r3m} /></Stat>
                  <Stat label="6M"><Change value={row.r6m} /></Stat>
                  <Stat label="1Y"><Change value={row.r1y} /></Stat>
                </dl>
                <p className="card-sub">Price only. Dividends are not included.</p>
              </section>
            </>
          )}

          {(h.events.length > 0 || h.dividends.length > 0) && (
            <section className="card">
              <h2>Corporate actions</h2>
              <ul className="events">
                {[...h.events].reverse().map((e) => (
                  <li key={`e${e.d}`}>
                    <span className="muted">{day(e.d)}</span>
                    <b>{e.label}</b>
                    <span className="src">
                      Earlier prices × {e.f.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}.{' '}
                      {e.src === 'feed' ? 'From NSE corporate actions, confirmed by the price gap.' : 'Not in the NSE feed; inferred from the overnight price gap.'}
                    </span>
                  </li>
                ))}
                {[...h.dividends].sort((a, b) => b.d - a.d).slice(0, 6).map((d) => (
                  <li key={`d${d.d}${d.label}`}>
                    <span className="muted">{day(d.d)}</span>
                    <b>{d.label}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
