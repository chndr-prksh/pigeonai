// Builds the site's data from the NSE MCP server.
//
//   npm run data                       incremental refresh of the whole universe
//   npm run data -- --limit 40         first 40 symbols only (quick local run)
//   npm run data -- --symbols TCS,INFY
//   npm run data -- --refill           retry history older than what is cached
//   npm run data -- --offline          rebuild from the cache, no network
//
// Raw bars are cached in .cache/raw. The first run pays for the backfill (about a dozen
// calls per symbol, throttled, roughly an hour for 500). After that a daily run is about
// a hundred calls: bulk quotes for the new session plus a weekly corporate-actions check.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BlockedError, McpClient, NSE_HISTORY, pool } from './mcp.ts'
import { adjust, findEvents, latestContinuous, type AdjEvent, type FeedAction, type RawBar } from './adjust.ts'
import { snapshot, type Snapshot } from '../src/lib/scans.ts'
import { sma } from '../src/lib/indicators.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, '.cache/raw')
const OUT = path.join(ROOT, 'public/data')
const HISTORY_YEARS = 5

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
// --refill walks back again from the oldest cached bar, for when NSE restores missing history.
const REFILL = args.includes('--refill')
// --offline rebuilds the site data from the cache without touching the network.
const OFFLINE = args.includes('--offline')
// Two workers, at most two request starts a second. See BlockedError for why.
const CONCURRENCY = Number(flag('concurrency') ?? 2)
const GAP_MS = Number(flag('gap') ?? 500)

interface Stock {
  symbol: string
  name: string
  industry: string
}

interface Cached {
  symbol: string
  bars: RawBar[]
  complete: boolean // backfill reached the start of available history
  actions: FeedAction[]
  actionsAt: string
}

// Symbols such as M&M and BAJAJ-AUTO are not safe file names everywhere.
export const fileKey = (symbol: string) => symbol.replace(/[^A-Z0-9]/g, '_')
const today = () => new Date().toISOString().slice(0, 10)

async function loadUniverse(): Promise<Stock[]> {
  const csv = await readFile(path.join(ROOT, 'pipeline/universe.csv'), 'utf8')
  const stocks: Stock[] = []
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    // Company Name,Industry,Symbol,Series,ISIN Code (names never contain commas in this file)
    const [name, industry, symbol] = line.split(',')
    if (symbol) stocks.push({ symbol: symbol.trim(), name: name.trim().replace(/ Ltd\.?$/, ''), industry: industry.trim() })
  }
  return stocks
}

async function readCache(symbol: string): Promise<Cached> {
  const file = path.join(CACHE, `${fileKey(symbol)}.json`)
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'))
  return { symbol, bars: [], complete: false, actions: [], actionsAt: '' }
}

function merge(existing: RawBar[], incoming: any[]): RawBar[] {
  const byDate = new Map(existing.map((b) => [b.d, b]))
  for (const r of incoming) {
    if (!(r.close > 0 && r.open > 0)) continue
    // A symbol can print in more than one series on a day; the main-board EQ row wins.
    if (byDate.has(r.date) && r.series !== 'EQ') continue
    byDate.set(r.date, { d: r.date, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume })
  }
  return [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1))
}

const cutoffDate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - HISTORY_YEARS)
  return d.toISOString().slice(0, 10)
}

const saveCache = (cache: Cached) => writeFile(path.join(CACHE, `${fileKey(cache.symbol)}.json`), JSON.stringify(cache))

// The cheap daily path: one get_bulk_quote call covers 50 symbols. A quote is appended
// only when its previous close matches our last bar, which proves no session was missed.
// Returns the symbols that still need a history call.
async function refreshFromQuotes(mcp: McpClient, caches: Map<string, Cached>): Promise<string[]> {
  const ready = [...caches.values()].filter((c) => c.complete && c.bars.length).map((c) => c.symbol)
  const pending = new Set([...caches.keys()].filter((s) => !ready.includes(s)))
  for (let i = 0; i < ready.length; i += 50) {
    const batch = ready.slice(i, i + 50)
    const res = await mcp.call('get_bulk_quote', { symbols: batch })
    const quotes = new Map<string, any>((res.quotes ?? []).map((q: any) => [q.symbol, q]))
    for (const symbol of batch) {
      const cache = caches.get(symbol)!
      const q = quotes.get(symbol)
      const last = cache.bars.at(-1)!
      if (!q || !(q.close > 0 && q.open > 0)) pending.add(symbol)
      else if (q.date === last.d) continue
      else if (q.date > last.d && Math.abs(q.prev_close - last.c) < 0.011) {
        cache.bars.push({ d: q.date, o: q.open, h: q.high, l: q.low, c: q.close, v: q.volume })
        await saveCache(cache)
      } else pending.add(symbol)
    }
  }
  return [...pending]
}

// The expensive path: walk the history three months per call. Used for the first
// backfill and for any symbol the quotes could not bring up to date.
async function refreshFromHistory(mcp: McpClient, cache: Cached) {
  const { symbol } = cache
  const cutoff = cutoffDate()

  const fetchChunk = async (endDate: string, months: number) => {
    const res = await mcp.call('get_stock_history', { symbol, months, endDate })
    if (res.error) return null
    cache.bars = merge(cache.bars, res.data ?? [])
    return res as { from_date: string; next_end_date?: string; trading_days: number }
  }

  const hadBars = cache.bars.length > 0
  const lastDate = cache.bars.at(-1)?.d
  const staleDays = lastDate ? (Date.now() - Date.parse(lastDate)) / 864e5 : Infinity
  let res = await fetchChunk('today', staleDays > 25 ? 3 : 1)

  if (!cache.complete) {
    // Walk backwards from the oldest bar we hold until the server has nothing older.
    let end = res?.next_end_date
    if (hadBars) {
      const oldest = new Date(Date.parse(cache.bars[0].d) - 864e5).toISOString().slice(0, 10)
      if (!end || oldest < end) end = oldest
    }
    while (end && end > cutoff) {
      res = await fetchChunk(end, 3)
      if (!res || !res.trading_days) break
      end = res.next_end_date
    }
    cache.complete = true
  }
  await saveCache(cache)
}

// Corporate actions change rarely and gap detection covers what the feed misses, so each
// symbol is re-read about once a week, spread across the week to keep daily runs small.
function actionsDue(cache: Cached): boolean {
  if (!cache.actionsAt) return true
  const dayIndex = Math.floor(Date.now() / 864e5)
  const hash = [...cache.symbol].reduce((h, ch) => h + ch.charCodeAt(0), 0)
  return (dayIndex + hash) % 7 === 0 && cache.actionsAt !== today()
}

async function refreshActions(mcp: McpClient, cache: Cached) {
  const ca = await mcp.call('get_corporate_actions', { symbol: cache.symbol, fromDate: cutoffDate(), toDate: today() })
  // The feed's window slides, so keep events we have already seen.
  const seen = new Map(cache.actions.map((a) => [a.exDate + a.purpose, a]))
  for (const a of ca.actions ?? []) seen.set(a.exDate + a.purpose, a)
  cache.actions = [...seen.values()]
  cache.actionsAt = today()
  await saveCache(cache)
}

const r2 = (x: number) => Math.round(x * 100) / 100
const dayNum = (d: string) => Number(d.replaceAll('-', ''))

interface Built {
  stock: Stock
  bars: RawBar[]
  events: AdjEvent[]
  snap: Snapshot | null
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(path.join(OUT, 'h'), { recursive: true })

  let universe = await loadUniverse()
  const only = flag('symbols')?.split(',')
  if (only) universe = universe.filter((s) => only.includes(s.symbol))
  const limit = flag('limit')
  if (limit) universe = universe.slice(0, Number(limit))

  const mcp = new McpClient(NSE_HISTORY, GAP_MS)
  const caches = new Map<string, Cached>()
  for (const stock of universe) {
    const cache = await readCache(stock.symbol)
    if (REFILL) cache.complete = false
    caches.set(stock.symbol, cache)
  }

  const failed: string[] = []
  if (!OFFLINE) {
    const started = Date.now()
    const progress = (label: string, done: number, total: number) =>
      console.log(`${label} ${done}/${total} · ${mcp.calls} calls · ${Math.round((Date.now() - started) / 1000)}s`)
    try {
      const pending = await refreshFromQuotes(mcp, caches)
      console.log(`quotes: ${universe.length - pending.length} symbols up to date, ${pending.length} need history`)
      let done = 0
      await pool(pending, CONCURRENCY, async (symbol) => {
        try {
          await refreshFromHistory(mcp, caches.get(symbol)!)
        } catch (err) {
          if (err instanceof BlockedError) throw err
          failed.push(symbol)
          console.error(`  ${symbol}: ${(err as Error).message}`)
        }
        if (++done % 25 === 0 || done === pending.length) progress('history', done, pending.length)
      })
      const due = [...caches.values()].filter((c) => c.bars.length && actionsDue(c))
      done = 0
      await pool(due, CONCURRENCY, async (cache) => {
        try {
          await refreshActions(mcp, cache)
        } catch (err) {
          if (err instanceof BlockedError) throw err
          // A cross-check only; gap detection still runs without it.
        }
        if (++done % 50 === 0 || done === due.length) progress('corporate actions', done, due.length)
      })
    } catch (err) {
      if (!(err instanceof BlockedError)) throw err
      // Publishing a half-refreshed universe would mix two trading days, so stop here.
      // What was fetched is cached; the next run resumes from it.
      const have = [...caches.values()].filter((c) => c.complete).length
      console.error(`\n${err.message}\n${have}/${universe.length} symbols are cached. Re-run later to continue, or build what is cached with --offline.`)
      process.exit(2)
    }
  }

  const built: Built[] = []
  for (const stock of universe) {
    const cache = caches.get(stock.symbol)!
    if (!cache.bars.length) {
      if (!OFFLINE && !failed.includes(stock.symbol)) failed.push(stock.symbol)
      continue
    }
    const raw = latestContinuous(cache.bars)
    const events = findEvents(raw, cache.actions)
    const bars = adjust(raw, events)
    const snap = snapshot({ o: bars.map((b) => b.o), h: bars.map((b) => b.h), l: bars.map((b) => b.l), c: bars.map((b) => b.c), v: bars.map((b) => b.v) })
    built.push({ stock, bars, events, snap })
    const dividends = cache.actions
      .filter((a) => a.actionType === 'DIVIDEND' && a.exDate >= raw[0].d)
      .map((a) => ({ d: dayNum(a.exDate), label: a.purpose }))
    await writeFile(
      path.join(OUT, 'h', `${fileKey(stock.symbol)}.json`),
      JSON.stringify({
        s: stock.symbol,
        name: stock.name,
        industry: stock.industry,
        t: bars.map((b) => dayNum(b.d)),
        o: bars.map((b) => r2(b.o)),
        h: bars.map((b) => r2(b.h)),
        l: bars.map((b) => r2(b.l)),
        c: bars.map((b) => r2(b.c)),
        v: bars.map((b) => b.v),
        events: events.map((e) => ({ ...e, d: dayNum(e.d) })),
        dividends,
      }),
    )
  }

  if (!built.length) {
    console.error('No cached data to build from. Run without --offline first.')
    process.exit(1)
  }

  // The market's last session is the latest date most symbols share; anything older is
  // suspended or delisted and stays out of the scan so stale signals never show as today's.
  const lastDates = built.map((b) => b.bars.at(-1)!.d).sort()
  const asOf = lastDates[Math.floor(lastDates.length / 2)] ?? today()
  const live = built.filter((b) => b.snap && b.bars.at(-1)!.d === asOf)

  // Relative-strength rating: percentile rank (1-99) of the weighted return across the universe.
  const ranked = live.filter((b) => Number.isFinite(b.snap!.rsRaw)).sort((a, b) => a.snap!.rsRaw - b.snap!.rsRaw)
  const rs = new Map(ranked.map((b, i) => [b.stock.symbol, Math.max(1, Math.min(99, Math.round(((i + 1) / ranked.length) * 99)))]))

  const rows = live
    .map(({ stock, bars, snap, events }) => {
      const s = snap!
      const rating = rs.get(stock.symbol) ?? null
      const signals = s.signals.filter((id) => id !== 'template' || (rating ?? 0) >= 70)
      const { rsRaw: _rsRaw, signals: _signals, ...rest } = s
      return {
        s: stock.symbol,
        name: stock.name,
        industry: stock.industry,
        ...rest,
        rs: rating,
        sig: signals,
        spark: bars.slice(-30).map((b) => r2(b.c)),
        adj: events.length,
      }
    })
    .sort((a, b) => a.s.localeCompare(b.s))

  await writeFile(
    path.join(OUT, 'scan.json'),
    JSON.stringify({ asOf, generated: new Date().toISOString(), universe: 'Nifty 500', count: rows.length, rows }),
  )

  await writeFile(path.join(OUT, 'market.json'), JSON.stringify(buildMarket(built, rows, asOf)))

  const adjusted = built.filter((b) => b.events.length)
  console.log(
    `\nAs of ${asOf}: ${rows.length} stocks scanned, ${adjusted.length} adjusted for splits/bonuses ` +
      `(${adjusted.reduce((n, b) => n + b.events.filter((e) => e.src === 'inferred').length, 0)} events inferred from price gaps), ` +
      `${failed.length} missing${failed.length ? ': ' + failed.join(', ') : ''}.`,
  )
  if (!OFFLINE && failed.length > universe.length * 0.2) process.exit(1)
}

// Breadth through time and sector roll-ups, all from the adjusted series.
function buildMarket(built: Built[], rows: any[], asOf: string) {
  const DAYS = 500
  const dates = [...new Set(built.flatMap((b) => b.bars.slice(-DAYS).map((x) => x.d)))].sort().slice(-DAYS)
  const pos = new Map(dates.map((d, i) => [d, i]))
  const zero = () => new Array(dates.length).fill(0)
  const n200 = zero(), a200 = zero(), n50 = zero(), a50 = zero(), adv = zero(), dec = zero(), nh = zero(), nl = zero()

  for (const { bars } of built) {
    const c = bars.map((b) => b.c)
    const s200 = sma(c, 200)
    const s50 = sma(c, 50)
    let hi = -Infinity
    let lo = Infinity
    const window: number[] = []
    for (let i = 0; i < bars.length; i++) {
      // 52-week extremes on closes, compared against the prior 252 sessions.
      if (window.length === 252) {
        hi = Math.max(...window)
        lo = Math.min(...window)
      }
      const k = pos.get(bars[i].d)
      if (k !== undefined) {
        if (!isNaN(s200[i])) { n200[k]++; if (c[i] > s200[i]) a200[k]++ }
        if (!isNaN(s50[i])) { n50[k]++; if (c[i] > s50[i]) a50[k]++ }
        if (i > 0) { if (c[i] > c[i - 1]) adv[k]++; else if (c[i] < c[i - 1]) dec[k]++ }
        if (window.length === 252) { if (c[i] > hi) nh[k]++; else if (c[i] < lo) nl[k]++ }
      }
      window.push(c[i])
      if (window.length > 252) window.shift()
    }
  }

  const pct = (a: number[], n: number[]) => a.map((x, i) => (n[i] ? Math.round((x / n[i]) * 1000) / 10 : null))

  const groups = new Map<string, any[]>()
  for (const r of rows) groups.set(r.industry, [...(groups.get(r.industry) ?? []), r])
  const median = (xs: number[]) => {
    const v = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
    if (!v.length) return null
    const m = v.length >> 1
    return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 10) / 10
  }
  const sectors = [...groups.entries()]
    .map(([name, rs]) => ({
      name,
      n: rs.length,
      chg: median(rs.map((r) => r.chg)),
      r1w: median(rs.map((r) => r.r1w)),
      r1m: median(rs.map((r) => r.r1m)),
      r3m: median(rs.map((r) => r.r3m)),
      r1y: median(rs.map((r) => r.r1y)),
      above200: Math.round((rs.filter((r) => r.close > r.sma200).length / rs.filter((r) => r.sma200 !== null).length) * 100),
    }))
    .sort((a, b) => (b.r1m ?? -999) - (a.r1m ?? -999))

  return {
    asOf,
    t: dates.map(dayNum),
    above200: pct(a200, n200),
    above50: pct(a50, n50),
    adv,
    dec,
    newHighs: nh,
    newLows: nl,
    sectors,
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
