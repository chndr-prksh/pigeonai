import { useMemo, useState } from 'react'
import { Change, Loading, SignalChip, Sparkline, Star } from '../components/bits.tsx'
import { useScan, type Row } from '../lib/data.ts'
import { num, price } from '../lib/format.ts'
import { SCANS, TRENDS, type ScanDef, type Trend } from '../lib/scans.ts'
import { screenerHref, stockHref, useWatchlist, type Route } from '../lib/store.ts'

type SortKey = 's' | 'close' | 'chg' | 'volRatio' | 'rsi' | 'rs' | 'fromHi' | 'r1m' | 'r3m' | 'r1y' | 'turnoverCr' | 'sig'

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'close', label: 'Close' },
  { key: 'chg', label: 'Day' },
  { key: 'volRatio', label: 'Vol ×', title: 'Today’s volume as a multiple of the 20-day average' },
  { key: 'rsi', label: 'RSI', title: 'Relative Strength Index, 14 days' },
  { key: 'rs', label: 'RS', title: 'Relative-strength rating, 1–99: rank of the stock’s 12-month return (latest quarter double weighted) within the universe' },
  { key: 'fromHi', label: 'vs 52w high' },
  { key: 'r1m', label: '1M' },
  { key: 'r3m', label: '3M' },
  { key: 'r1y', label: '1Y' },
  { key: 'turnoverCr', label: 'Turnover', title: '20-day average traded value, ₹ crore' },
]

const GROUPS = [...new Set(SCANS.map((s) => s.group))]

export function Screener({ route, watchOnly = false }: { route: Route; watchOnly?: boolean }) {
  const scan = useScan()
  const watch = useWatchlist()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'chg', dir: -1 })

  const active = (route.query.get('scans') ?? '').split(',').filter(Boolean)
  const sector = route.query.get('sector') ?? ''
  const q = route.query.get('q') ?? ''
  const minTurnover = Number(route.query.get('liq') ?? 0)
  const trend = route.query.get('trend') ?? ''
  const sheetOnly = route.query.get('set') === 'sheet'

  // Filters live in the URL so a screen can be bookmarked or shared.
  const go = (patch: Record<string, string | undefined>) => {
    const next = { scans: active.join(','), sector, q, liq: minTurnover ? String(minTurnover) : '', trend, set: sheetOnly ? 'sheet' : '', ...patch }
    const href = watchOnly ? screenerHref(next).replace('#/screener', '#/watchlist') : screenerHref(next)
    window.history.replaceState(null, '', href)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  const toggleScan = (id: string) => go({ scans: (active.includes(id) ? active.filter((x) => x !== id) : [...active, id]).join(',') })

  const rows = scan.data?.rows ?? []

  const base = useMemo(() => {
    const needle = q.trim().toUpperCase()
    return rows.filter(
      (r) =>
        (!watchOnly || watch.list.includes(r.s)) &&
        (!sector || r.industry === sector) &&
        (!trend || r.trend === trend) &&
        (!minTurnover || r.turnoverCr >= minTurnover) &&
        (!needle || r.s.includes(needle) || r.name.toUpperCase().includes(needle)),
    )
  }, [rows, watchOnly, watch.list, sector, minTurnover, q, trend])

  // Counts show what each scan would add given the other filters already applied.
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const r of base) if (active.every((id) => r.sig.includes(id))) for (const id of r.sig) c.set(id, (c.get(id) ?? 0) + 1)
    return c
  }, [base, active.join(',')])

  const shown = useMemo(() => {
    const out = base.filter((r) => active.every((id) => r.sig.includes(id)))
    const val = (r: Row): number | string | null => (sort.key === 'sig' ? r.sig.length : sort.key === 's' ? r.s : r[sort.key])
    return out.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      if (x == null) return 1 // blanks sink whichever way the column is sorted
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [base, active.join(','), sort])

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.industry))].sort(), [rows])

  if (!scan.data) return <Loading error={scan.error} what="the scan" />

  const header = (key: SortKey, label: string, title?: string, cls = 'num') => (
    <th
      key={key}
      className={`${cls} sortable ${sort.key === key ? 'sorted' : ''}`}
      title={title}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 's' ? 1 : -1 })}
    >
      {label}
      <span className="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  )

  const scanButton = (s: ScanDef) => {
    const on = active.includes(s.id)
    const n = counts.get(s.id) ?? 0
    return (
      <li key={s.id}>
        <button className={`scan ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && n === 0} onClick={() => toggleScan(s.id)} title={s.desc}>
          <span className={`sig ${s.bias}`}><span className="dot" aria-hidden="true" />{s.name}</span>
          <b>{n}</b>
        </button>
      </li>
    )
  }

  return (
    <div className="page screener">
      <aside className="scans" aria-label="Scans">
        <div className="scans-head">
          <h2>Scans</h2>
          {active.length > 0 && <button className="linkish" onClick={() => go({ scans: '' })}>Clear</button>}
        </div>
        <p className="card-sub">Pick one or more. A stock must match all of them.</p>
        <div className="seg full" role="group" aria-label="Scan set">
          <button className={sheetOnly ? '' : 'on'} onClick={() => go({ set: '' })}>All {SCANS.length}</button>
          <button className={sheetOnly ? 'on' : ''} onClick={() => go({ set: 'sheet' })} title="Only the scanners from the original Google Sheet">
            Original sheet {SCANS.filter((s) => s.sheet).length}
          </button>
        </div>
        {GROUPS.map((g) => {
          const list = SCANS.filter((s) => s.group === g && (!sheetOnly || s.sheet || active.includes(s.id)))
          return list.length ? (
            <div key={g}>
              <h3>{g}</h3>
              <ul>{list.map(scanButton)}</ul>
            </div>
          ) : null
        })}
      </aside>

      <section className="results">
        <header className="page-head">
          <h1>{watchOnly ? 'Watchlist' : 'Screener'}</h1>
          <p className="muted">
            {shown.length} of {watchOnly ? watch.list.length : scan.data.count} stocks
            {active.length > 0 && <> matching {active.length === 1 ? 'the selected scan' : `all ${active.length} scans`}</>}
          </p>
        </header>

        <div className="filters">
          <input type="search" placeholder="Filter by symbol or name" value={q} onChange={(e) => go({ q: e.target.value })} aria-label="Filter by symbol or name" />
          <select value={sector} onChange={(e) => go({ sector: e.target.value })} aria-label="Sector">
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={trend} onChange={(e) => go({ trend: e.target.value })} aria-label="Price trend">
            <option value="">Any price trend</option>
            {(Object.keys(TRENDS) as Trend[]).map((t) => <option key={t} value={t}>{TRENDS[t]}</option>)}
          </select>
          <select value={minTurnover} onChange={(e) => go({ liq: e.target.value === '0' ? '' : e.target.value })} aria-label="Minimum turnover">
            <option value={0}>Any turnover</option>
            <option value={10}>Turnover ≥ ₹10 Cr</option>
            <option value={50}>Turnover ≥ ₹50 Cr</option>
            <option value={200}>Turnover ≥ ₹200 Cr</option>
          </select>
        </div>

        {active.length > 0 && (
          <div className="active-scans">
            {active.map((id) => <button key={id} className="pill" onClick={() => toggleScan(id)}><SignalChip id={id} /> <span aria-hidden="true">×</span></button>)}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty">
            <b>{watchOnly && watch.list.length === 0 ? 'Your watchlist is empty.' : 'No stocks match.'}</b>
            <span>{watchOnly && watch.list.length === 0 ? 'Star a stock in the screener or on its chart to keep it here. The list is saved in this browser.' : 'Try removing a scan or widening the filters.'}</span>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="data rows">
              <thead>
                <tr>
                  <th aria-label="Watchlist" />
                  {header('s', 'Stock', undefined, '')}
                  <th>30 days</th>
                  {COLUMNS.map((c) => header(c.key, c.label, c.title))}
                  {header('sig', 'Signals', undefined, '')}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.s} onClick={() => (window.location.hash = stockHref(r.s))}>
                    <td><Star symbol={r.s} /></td>
                    <td>
                      <a href={stockHref(r.s)} className="sym" onClick={(e) => e.stopPropagation()}>{r.s}</a>
                      <span className="sub">{r.name}</span>
                    </td>
                    <td><Sparkline values={r.spark} /></td>
                    <td className="num">{price(r.close)}</td>
                    <td className="num"><Change value={r.chg} digits={2} /></td>
                    <td className="num">{r.volRatio == null ? '–' : `${r.volRatio.toFixed(1)}×`}</td>
                    <td className="num">{num(r.rsi)}</td>
                    <td className="num">{num(r.rs)}</td>
                    <td className="num">{r.fromHi === 0 ? 'At high' : `${r.fromHi.toFixed(1)}%`}</td>
                    <td className="num"><Change value={r.r1m} /></td>
                    <td className="num"><Change value={r.r3m} /></td>
                    <td className="num"><Change value={r.r1y} /></td>
                    <td className="num muted">{num(r.turnoverCr)}</td>
                    <td className="sigs">
                      {[...r.sig].sort((a, b) => Number(active.includes(a)) - Number(active.includes(b))).slice(0, 1).map((id) => <SignalChip key={id} id={id} />)}
                      {r.sig.length > 1 && <span className="more" title={r.sig.slice(1).map((id) => SCANS.find((s) => s.id === id)?.name).join(', ')}>+{r.sig.length - 1}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
