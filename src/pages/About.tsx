import { useScan } from '../lib/data.ts'
import { day } from '../lib/format.ts'
import { SCANS } from '../lib/scans.ts'

export function About() {
  const scan = useScan()
  const groups = [...new Set(SCANS.map((s) => s.group))]
  return (
    <div className="page prose">
      <h1>About and disclaimer</h1>

      <section className="card notice">
        <h2>Not investment advice</h2>
        <p>
          PigeonAI is for information and education only. Nothing here is a recommendation to buy, sell or hold any
          security. A scan flags a price pattern; it says nothing about whether a stock suits you. The people who
          built this are not SEBI-registered investment advisers or research analysts. Talk to a SEBI-registered
          adviser before investing.
        </p>
        <p>Data can be late, incomplete or wrong. Check prices with your broker or on nseindia.com before acting on anything.</p>
      </section>

      <section className="card">
        <h2>Where the data comes from</h2>
        <p>
          Prices are end-of-day bhavcopy data from the NSE MCP server, covering the Nifty 500
          {scan.data && <> as of the close on {day(scan.data.asOf)}</>}. There are no intraday or live prices here. Data
          made available through the NSEIL MCP server is for informational and educational purposes; NSEIL is not
          responsible for anything derived from it.
        </p>
        <p>
          History starts in January 2024. The NSE server currently returns nothing for most of 2023, and a chart
          with a year missing from the middle would produce false signals, so only the unbroken recent stretch is used.
        </p>
      </section>

      <section className="card">
        <h2>How splits and bonuses are handled</h2>
        <p>
          Bhavcopy prices are raw. When a company issues a 1:1 bonus its share price halves overnight, and an
          unadjusted chart shows a 50% crash that never happened. That one bar then corrupts every moving average,
          52-week range and return calculated across it.
        </p>
        <p>
          Every series here is back-adjusted so earlier prices are comparable with today’s. The NSE corporate-actions
          feed only reaches back about a year, so each adjustment is established two ways: an event from the feed is
          applied only if the price really gapped by that ratio on the ex-date, and an overnight gap larger than any
          price band allows is matched against the ratios a split or bonus can produce. Each stock page lists the
          adjustments applied and which of the two they came from, and the chart can be switched to prices as traded.
        </p>
        <p>Dividends and demergers are not adjusted for. Returns are price returns.</p>
      </section>

      <section className="card">
        <h2>From a Google Sheet to this</h2>
        <p>
          This began in 2021 as a Python notebook that pushed indicator values for NSE stocks into a Google Sheet,
          where each scanner was a column. Every one of those columns is here as a scan. The sheet carried values
          rather than formulas, so each rule was worked back from the stocks it flagged; where a threshold had to be
          chosen, the definition below states it.
        </p>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr><th>Column in the sheet</th><th>Scan here</th></tr>
            </thead>
            <tbody>
              {[...new Set(SCANS.filter((s) => s.sheet).map((s) => s.sheet!))].map((col) => (
                <tr key={col}>
                  <td>{col}</td>
                  <td>{SCANS.filter((s) => s.sheet === col).map((s) => s.name).join(', ')}</td>
                </tr>
              ))}
              <tr><td>Pivot, S1, S2, R1, R2</td><td>Pivot levels on every stock page and chart</td></tr>
              <tr><td>30-Day Chart</td><td>The 30-day sparkline in the screener</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>The scans</h2>
        {groups.map((g) => (
          <div key={g}>
            <h3>{g}</h3>
            <dl className="defs">
              {SCANS.filter((s) => s.group === g).map((s) => (
                <div key={s.id}>
                  <dt>{s.name}{s.sheet && <span className="tag">Original sheet</span>}</dt>
                  <dd>{s.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Open source</h2>
        <p>
          Charts are drawn with TradingView Lightweight Charts™ (Apache 2.0). Indicators and scans are computed in
          the open by this project’s own code. Nifty 500 is a trademark of NSE Indices Ltd; this site is not
          affiliated with or endorsed by NSE.
        </p>
      </section>
    </div>
  )
}
