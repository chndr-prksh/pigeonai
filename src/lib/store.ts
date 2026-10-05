import { useEffect, useState, useSyncExternalStore } from 'react'

// --- Hash routing: #/screener?scans=hi52,volSurge --------------------------------

export interface Route {
  path: string[]
  query: URLSearchParams
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [p, q = ''] = raw.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const stockHref = (symbol: string) => `#/stock/${encodeURIComponent(symbol)}`

export function screenerHref(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return `#/screener${s ? `?${s}` : ''}`
}

// --- Small persisted stores ------------------------------------------------------

function persisted<T>(key: string, initial: T) {
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) value = JSON.parse(raw)
  } catch {
    // Storage can be unavailable (private mode); the app still works for the session.
  }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // see above
      }
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

const watch = persisted<string[]>('watchlist', [])

export function useWatchlist() {
  const list = useSyncExternalStore(watch.subscribe, watch.get)
  const toggle = (symbol: string) =>
    watch.set(list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol])
  return { list, toggle, has: (s: string) => list.includes(s) }
}

export type Theme = 'light' | 'dark'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || systemTheme())
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem('theme', next)
    } catch {
      // not persisted, still applied
    }
    setTheme(next)
  }
  return [theme, toggle]
}

// Chart colours per theme. Canvas charts cannot read CSS variables, so they live here
// and mirror the tokens in styles.css.
export const CHART_COLORS = {
  dark: {
    bg: '#161615', text: '#c3c2b7', grid: '#262624', border: '#33332f', crosshair: '#6f6e66',
    up: '#199e70', down: '#e66767', upSoft: 'rgba(25,158,112,0.45)', downSoft: 'rgba(230,103,103,0.45)',
    s1: '#3987e5', s2: '#d95926', s3: '#9085e9', s4: '#c98500', band: '#8a897f', marker: '#c3c2b7',
  },
  light: {
    bg: '#ffffff', text: '#52514e', grid: '#efeeea', border: '#dddbd3', crosshair: '#98968c',
    up: '#12946a', down: '#d43d3c', upSoft: 'rgba(18,148,106,0.4)', downSoft: 'rgba(212,61,60,0.4)',
    s1: '#2a78d6', s2: '#eb6834', s3: '#4a3aa7', s4: '#b97d00', band: '#8a887e', marker: '#52514e',
  },
} as const

export type ChartColors = (typeof CHART_COLORS)[Theme]
