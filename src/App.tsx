import { useEffect, useMemo, useRef, useState } from 'react'
import { useScan } from './lib/data.ts'
import { day } from './lib/format.ts'
import { stockHref, useRoute, useTheme, useWatchlist } from './lib/store.ts'
import { About } from './pages/About.tsx'
import { Market } from './pages/Market.tsx'
import { Screener } from './pages/Screener.tsx'
import { Stock } from './pages/Stock.tsx'

// The mark: a carrier pigeon, the original way to get a signal delivered.
// Keep the shapes in step with public/favicon.svg.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="logo-tile" />
      <path className="logo-bird" d="M7.2 21.6C7 15.6 11.6 11.4 17 11.6c1-2.9 3.4-4.4 5.9-3.9 1.6.3 2.7 1.3 3.2 2.7l2.4 1-2.5.9c-.2 5.8-4.6 10.500-10.800 10.500H9.400L5 25.200z" />
      <path className="logo-wing" d="M11.200 19.800c1.100-3.300 4.100-5.100 7.600-4.500-.500 3.700-3.600 5.900-7.600 4.500z" />
      <circle className="logo-eye" cx="22.6" cy="10.900" r="1" />
    </svg>
  )
}

function Search() {
  const scan = useScan()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const needle = q.trim().toUpperCase()
    if (!needle || !scan.data) return []
    const rows = scan.data.rows
    // Symbols that start with the query first, then symbols and names that contain it.
    const starts = rows.filter((r) => r.s.startsWith(needle))
    const rest = rows.filter((r) => !r.s.startsWith(needle) && (r.s.includes(needle) || r.name.toUpperCase().includes(needle)))
    return [...starts, ...rest].slice(0, 8)
  }, [q, scan.data])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const pick = (symbol: string) => {
    window.location.hash = stockHref(symbol)
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        placeholder="Search stocks  /"
        aria-label="Search stocks"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, matches.length - 1))
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
          else if (e.key === 'Enter' && matches[cursor]) pick(matches[cursor].s)
          else if (e.key === 'Escape') input.current?.blur()
          else return
          e.preventDefault()
        }}
      />
      {open && q.trim() && (
        <ul className="search-menu" role="listbox">
          {matches.length === 0 && <li className="none">No stock in the Nifty 500 matches “{q.trim()}”.</li>}
          {matches.map((r, i) => (
            <li key={r.s} role="option" aria-selected={i === cursor} className={i === cursor ? 'on' : ''} onMouseDown={() => pick(r.s)} onMouseEnter={() => setCursor(i)}>
              <b>{r.s}</b>
              <span>{r.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function App() {
  const route = useRoute()
  const [theme, toggleTheme] = useTheme()
  const scan = useScan()
  const watch = useWatchlist()
  const page = route.path[0] ?? 'market'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path.join('/')])

  const link = (id: string, label: string) => (
    <a href={`#/${id}`} className={page === id ? 'on' : ''} aria-current={page === id ? 'page' : undefined}>
      {label}
    </a>
  )

  return (
    <>
      <nav className="nav">
        <a className="brand" href="#/market">
          <Logo />
          PigeonAI
        </a>
        <div className="nav-links">
          {link('market', 'Market')}
          {link('screener', 'Screener')}
          {link('watchlist', `Watchlist${watch.list.length ? ` ${watch.list.length}` : ''}`)}
          {link('about', 'About')}
        </div>
        <Search />
        {scan.data && <span className="asof" title="End-of-day data. Prices are not live.">Close of {day(scan.data.asOf)}</span>}
        <button className="theme" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </nav>

      <main>
        {page === 'stock' && route.path[1] ? (
          <Stock key={route.path[1]} symbol={route.path[1]} theme={theme} />
        ) : page === 'screener' ? (
          <Screener route={route} />
        ) : page === 'watchlist' ? (
          <Screener route={route} watchOnly />
        ) : page === 'about' ? (
          <About />
        ) : (
          <Market theme={theme} />
        )}
      </main>

      <footer className="foot">
        <p>
          For information and education only. Not investment advice, and not from a SEBI-registered adviser or research
          analyst. End-of-day data from the NSE MCP server; it may be delayed or contain errors. <a href="#/about">Read the full disclaimer</a>
        </p>
      </footer>
    </>
  )
}
