import { useEffect, useState } from 'react'
import type { Pivots, Trend } from './scans.ts'

export interface Row {
  s: string
  name: string
  industry: string
  close: number
  prevClose: number
  chg: number
  vol: number
  volRatio: number | null
  turnoverCr: number
  rsi: number | null
  adx: number | null
  atrPct: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
  hi52: number
  lo52: number
  fromHi: number
  fromLo: number
  r1w: number | null
  r1m: number | null
  r3m: number | null
  r6m: number | null
  r1y: number | null
  trend: Trend | null
  piv: Pivots
  volBoom: number | null
  vol5: number | null
  rs: number | null
  sig: string[]
  spark: number[]
  adj: number
}

export interface ScanFile {
  asOf: string
  generated: string
  universe: string
  count: number
  rows: Row[]
}

export interface Sector {
  name: string
  n: number
  chg: number | null
  r1w: number | null
  r1m: number | null
  r3m: number | null
  r1y: number | null
  above200: number
}

export interface MarketFile {
  asOf: string
  t: number[]
  above200: (number | null)[]
  above50: (number | null)[]
  adv: number[]
  dec: number[]
  newHighs: number[]
  newLows: number[]
  sectors: Sector[]
}

export interface CorpEvent {
  d: number
  type: 'SPLIT' | 'BONUS' | 'ADJ'
  label: string
  f: number
  src: 'feed' | 'inferred'
}

export interface History {
  s: string
  name: string
  industry: string
  t: number[] // yyyymmdd
  o: number[]
  h: number[]
  l: number[]
  c: number[]
  v: number[]
  events: CorpEvent[]
  dividends: { d: number; label: string }[]
}

const cache = new Map<string, Promise<unknown>>()

function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
      if (!r.ok) throw new Error(`${file}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return cache.get(file) as Promise<T>
}

export const fileKey = (symbol: string) => symbol.replace(/[^A-Z0-9]/g, '_')

type State<T> = { data: T | null; error: string | null }

function useFile<T>(file: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null })
  useEffect(() => {
    if (!file) return
    let live = true
    setState({ data: null, error: null })
    load<T>(file).then(
      (data) => live && setState({ data, error: null }),
      (err) => live && setState({ data: null, error: String(err.message ?? err) }),
    )
    return () => {
      live = false
    }
  }, [file])
  return state
}

export const useScan = () => useFile<ScanFile>('scan.json')
export const useMarket = () => useFile<MarketFile>('market.json')
export const useHistory = (symbol: string) => useFile<History>(`h/${fileKey(symbol)}.json`)

// yyyymmdd -> 'yyyy-mm-dd', the string form lightweight-charts takes as a business day.
export const isoDay = (d: number) => {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
