import { adx, atr, bollinger, ema, macd, pctReturn, rollMax, rollMin, rsi, sma } from './indicators.ts'

export type Bias = 'bull' | 'bear' | 'neutral'

export interface ScanDef {
  id: string
  name: string
  group: 'Breakouts' | 'Trend' | 'Momentum' | 'Volume' | 'Volatility' | 'Candles'
  bias: Bias
  desc: string
  // Column this scan had in the original Google Sheet scanner, where it came from there.
  sheet?: string
}

// The catalogue of scans. Those with a `sheet` field are the columns of the original
// Google Sheet scanner (2021), rebuilt here on split/bonus-adjusted prices. The sheet
// published values, not formulas, so each rule was worked back from the rows it flagged;
// the thresholds are this project's reading of them. The rest are additions.
export const SCANS: ScanDef[] = [
  { id: 'hi52', name: 'New 52-week high', group: 'Breakouts', bias: 'bull', sheet: '52w Breached!', desc: 'Today’s high exceeded the highest high of the previous 252 sessions.' },
  { id: 'hi52Close', name: 'Strong 52-week high', group: 'Breakouts', bias: 'bull', sheet: '52w Momentum Breach', desc: 'Closed above the previous 52-week high, not just touched it intraday.' },
  { id: 'near52', name: 'Near 52-week high', group: 'Breakouts', bias: 'bull', sheet: 'Near 52w H/L', desc: 'Close is within 2% of the 52-week high without making a new one today.' },
  { id: 'pv20', name: 'PV breakout', group: 'Breakouts', bias: 'bull', sheet: 'PV Breakout', desc: 'Price and volume together: highest close in 20 sessions on at least 2× the 20-day average volume.' },
  { id: 'pv2m', name: '2-month PV breakout', group: 'Breakouts', bias: 'bull', sheet: '2MPV Breakout', desc: 'Highest close in two months (42 sessions) on at least 2× the 20-day average volume.' },
  { id: 'brk20', name: '20-day breakout on volume', group: 'Breakouts', bias: 'bull', desc: 'Close above the prior 20-session high with volume at least 1.5× the 20-day average.' },
  { id: 'brk50', name: '50-day closing high', group: 'Breakouts', bias: 'bull', desc: 'Close above the highest high of the previous 50 sessions.' },
  { id: 'pivR2', name: 'Closed above pivot R2', group: 'Breakouts', bias: 'bull', desc: 'Closed above the second resistance of the floor pivots drawn from yesterday’s high, low and close.' },
  { id: 'lo52', name: 'New 52-week low', group: 'Breakouts', bias: 'bear', sheet: '52w Breached!', desc: 'Today’s low undercut the lowest low of the previous 252 sessions.' },
  { id: 'lo52Close', name: 'Strong 52-week low', group: 'Breakouts', bias: 'bear', sheet: '52w Momentum Breach', desc: 'Closed below the previous 52-week low.' },
  { id: 'nearLo52', name: 'Near 52-week low', group: 'Breakouts', bias: 'bear', sheet: 'Near 52w H/L', desc: 'Close is within 2% of the 52-week low without making a new one today.' },
  { id: 'bd20', name: '20-day breakdown on volume', group: 'Breakouts', bias: 'bear', desc: 'Close below the prior 20-session low with volume at least 1.5× the 20-day average.' },
  { id: 'pivS2', name: 'Closed below pivot S2', group: 'Breakouts', bias: 'bear', desc: 'Closed below the second support of the floor pivots drawn from yesterday’s high, low and close.' },

  { id: 'template', name: 'Trend template', group: 'Trend', bias: 'bull', desc: 'Close > 50 DMA > 150 DMA > 200 DMA, 200 DMA rising for a month, within 25% of the 52-week high, at least 30% above the 52-week low, RS rating ≥ 70.' },
  { id: 'trendBull', name: 'Bullish stack', group: 'Trend', bias: 'bull', sheet: 'Price Trend', desc: 'Price > SMA 20 > SMA 50.' },
  { id: 'up20', name: 'Rose above SMA 20', group: 'Trend', bias: 'bull', sheet: 'Moving Average Crossovers', desc: 'Closed above the 20-day average after closing at or below it the session before.' },
  { id: 'streakUp', name: '3-day up streak', group: 'Trend', bias: 'bull', sheet: '3 day streak!', desc: 'Three consecutive higher closes.' },
  { id: 'uptrend', name: 'Strong uptrend (ADX)', group: 'Trend', bias: 'bull', desc: 'Close > 50 DMA > 200 DMA with ADX above 25 and +DI above −DI.' },
  { id: 'golden', name: 'Golden cross', group: 'Trend', bias: 'bull', sheet: 'Moving Average Crossovers', desc: '50 DMA crossed above the 200 DMA within the last 5 sessions.' },
  { id: 'up200', name: 'Reclaimed 200 DMA', group: 'Trend', bias: 'bull', desc: 'Closed above the 200 DMA after closing below it the session before.' },
  { id: 'pull20', name: 'Pullback to 20 EMA', group: 'Trend', bias: 'bull', desc: 'In an uptrend (close > 50 DMA > 200 DMA), the low touched the 20 EMA and the close held above it.' },
  { id: 'trendBear', name: 'Bearish stack', group: 'Trend', bias: 'bear', sheet: 'Price Trend', desc: 'SMA 50 > SMA 20 > Price.' },
  { id: 'dn20', name: 'Dropped below SMA 20', group: 'Trend', bias: 'bear', sheet: 'Moving Average Crossovers', desc: 'Closed below the 20-day average after closing at or above it the session before.' },
  { id: 'streakDn', name: '3-day down streak', group: 'Trend', bias: 'bear', sheet: '3 day streak!', desc: 'Three consecutive lower closes.' },
  { id: 'death', name: 'Death cross', group: 'Trend', bias: 'bear', sheet: 'Moving Average Crossovers', desc: '50 DMA crossed below the 200 DMA within the last 5 sessions.' },
  { id: 'dn200', name: 'Lost 200 DMA', group: 'Trend', bias: 'bear', desc: 'Closed below the 200 DMA after closing above it the session before.' },
  { id: 'downtrend', name: 'Strong downtrend (ADX)', group: 'Trend', bias: 'bear', desc: 'Close < 50 DMA < 200 DMA with ADX above 25 and −DI above +DI.' },

  { id: 'macdUp', name: 'MACD bullish crossover', group: 'Momentum', bias: 'bull', desc: 'MACD line (12, 26) crossed above its 9-period signal line today.' },
  { id: 'rsiOS', name: 'RSI oversold', group: 'Momentum', bias: 'neutral', desc: 'RSI(14) below 30.' },
  { id: 'rsiOB', name: 'RSI overbought', group: 'Momentum', bias: 'neutral', desc: 'RSI(14) above 70.' },
  { id: 'macdDn', name: 'MACD bearish crossover', group: 'Momentum', bias: 'bear', desc: 'MACD line (12, 26) crossed below its 9-period signal line today.' },

  { id: 'volBoom', name: 'Volume boom', group: 'Volume', bias: 'neutral', sheet: 'Volume Boom', desc: 'Volume at least 2× the previous session’s.' },
  { id: 'vol5', name: 'Beats 5-day average volume', group: 'Volume', bias: 'neutral', sheet: 'Beats 5D Avg Vol!', desc: 'Volume at least 1.5× the average of the previous five sessions.' },
  { id: 'volSurge', name: 'Volume surge (3×)', group: 'Volume', bias: 'neutral', desc: 'Volume at least 3× the 20-day average.' },
  { id: 'volHi', name: 'Highest volume in a year', group: 'Volume', bias: 'neutral', desc: 'Today’s volume is the highest of the last 252 sessions.' },
  { id: 'accum', name: 'Up on volume', group: 'Volume', bias: 'bull', desc: 'Closed up at least 2% with volume at least 2× the 20-day average.' },
  { id: 'distrib', name: 'Down on volume', group: 'Volume', bias: 'bear', desc: 'Closed down at least 2% with volume at least 2× the 20-day average.' },

  { id: 'nr4', name: 'NR4', group: 'Volatility', bias: 'neutral', sheet: 'NR4', desc: 'Today’s high–low range is the narrowest of the last 4 sessions.' },
  { id: 'nr7', name: 'NR7', group: 'Volatility', bias: 'neutral', sheet: 'NR7', desc: 'Today’s high–low range is the narrowest of the last 7 sessions.' },
  { id: 'squeeze', name: 'Bollinger squeeze', group: 'Volatility', bias: 'neutral', desc: 'Bollinger band width (20, 2) is at its tightest in 120 sessions.' },
  { id: 'nr4Up', name: 'NR4 +ve breakout', group: 'Volatility', bias: 'bull', sheet: 'NR4 Breakout', desc: 'Yesterday was an NR4 day and today closed above its high.' },
  { id: 'nr7Up', name: 'NR7 +ve breakout', group: 'Volatility', bias: 'bull', sheet: 'NR7 Breakout', desc: 'Yesterday was an NR7 day and today closed above its high.' },
  { id: 'nr4Dn', name: 'NR4 −ve breakout', group: 'Volatility', bias: 'bear', sheet: 'NR4 Breakout', desc: 'Yesterday was an NR4 day and today closed below its low.' },
  { id: 'nr7Dn', name: 'NR7 −ve breakout', group: 'Volatility', bias: 'bear', sheet: 'NR7 Breakout', desc: 'Yesterday was an NR7 day and today closed below its low.' },
  { id: 'hulkyUp', name: 'Hulky gain', group: 'Volatility', bias: 'bull', sheet: 'Hulky Gainers/Losers', desc: 'An outsized up day: range at least 2× the 100-day average range, closing higher.' },
  { id: 'hulkyDn', name: 'Hulky loss', group: 'Volatility', bias: 'bear', sheet: 'Hulky Gainers/Losers', desc: 'An outsized down day: range at least 2× the 100-day average range, closing lower.' },
  { id: 'wide', name: 'Wide-range day', group: 'Volatility', bias: 'neutral', desc: 'Today’s range is at least 2× the 14-day ATR.' },

  { id: 'inside', name: 'Inside bar', group: 'Candles', bias: 'neutral', desc: 'Today’s high and low sit inside yesterday’s range.' },
  { id: 'gapUp', name: 'Gap up', group: 'Candles', bias: 'bull', desc: 'Today’s low stayed above yesterday’s high.' },
  { id: 'revUp', name: 'Bullish reversal', group: 'Candles', bias: 'bull', sheet: 'Bullish/Bearish Reversal', desc: 'Three red candles in a row, then a green candle that closes above the previous candle’s open.' },
  { id: 'revDn', name: 'Bearish reversal', group: 'Candles', bias: 'bear', sheet: 'Bullish/Bearish Reversal', desc: 'Three green candles in a row, then a red candle that closes below the previous candle’s open.' },
  { id: 'engulf', name: 'Bullish engulfing', group: 'Candles', bias: 'bull', desc: 'A down day followed by an up day whose body engulfs the previous body.' },
  { id: 'gapDn', name: 'Gap down', group: 'Candles', bias: 'bear', desc: 'Today’s high stayed below yesterday’s low.' },
]

export const SCAN_BY_ID: Record<string, ScanDef> = Object.fromEntries(SCANS.map((s) => [s.id, s]))

// The sheet's "Price Trend" column: where price sits relative to its 20- and 50-day averages.
export const TRENDS = {
  bull: 'Bullish: Price > SMA 20 > SMA 50',
  mbull: 'Mildly bullish: Price > SMA 50 > SMA 20',
  nup: 'Neutral: SMA 20 > Price > SMA 50',
  ndn: 'Neutral: SMA 50 > Price > SMA 20',
  mbear: 'Mildly bearish: SMA 20 > SMA 50 > Price',
  bear: 'Bearish: SMA 50 > SMA 20 > Price',
} as const
export type Trend = keyof typeof TRENDS

export interface Pivots {
  p: number
  r1: number
  r2: number
  s1: number
  s2: number
}

// Classic floor pivots from one session's high, low and close, for use in the next.
export function pivots(h: number, l: number, c: number): Pivots {
  const p = (h + l + c) / 3
  return { p, r1: 2 * p - l, r2: p + (h - l), s1: 2 * p - h, s2: p - (h - l) }
}

export interface Bars {
  o: number[]
  h: number[]
  l: number[]
  c: number[]
  v: number[]
}

export interface Snapshot {
  close: number
  prevClose: number
  chg: number // % change on the day
  vol: number
  volRatio: number // today's volume / 20-day average
  turnoverCr: number // 20-day average traded value, ₹ crore
  rsi: number
  adx: number
  atrPct: number
  sma20: number
  sma50: number
  sma200: number
  hi52: number
  lo52: number
  fromHi: number // % below the 52-week high (≤ 0)
  fromLo: number // % above the 52-week low (≥ 0)
  r1w: number
  r1m: number
  r3m: number
  r6m: number
  r1y: number
  trend: Trend | null
  piv: Pivots // levels for the next session
  volBoom: number // today's volume / previous session's
  vol5: number // today's volume / 5-day average
  rsRaw: number // weighted return used to rank relative strength
  signals: string[]
}

const round = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null)

// Evaluate every indicator and scan at the last bar. Needs at least ~30 bars to say anything.
export function snapshot(b: Bars): Snapshot | null {
  const n = b.c.length
  if (n < 30) return null
  const i = n - 1
  const { o, h, l, c, v } = b

  const s20 = sma(c, 20)
  const s50 = sma(c, 50)
  const s150 = sma(c, 150)
  const s200 = sma(c, 200)
  const e20 = ema(c, 20)
  const r = rsi(c, 14)
  const m = macd(c)
  const a = adx(h, l, c, 14)
  const at = atr(h, l, c, 14)
  const bb = bollinger(c, 20, 2)
  const v20 = sma(v, 20)

  const win = Math.min(252, n - 1)
  const priorHi = rollMax(h, win, true)[i]
  const priorLo = rollMin(l, win, true)[i]
  const hi52 = Math.max(priorHi, h[i])
  const lo52 = Math.min(priorLo, l[i])
  const hi20 = rollMax(h, 20, true)[i]
  const lo20 = rollMin(l, 20, true)[i]
  const hi50 = rollMax(h, 50, true)[i]

  const chg = (c[i] / c[i - 1] - 1) * 100
  // Volume ratio compares today with the average of the previous 20 sessions.
  const volRatio = v20[i - 1] > 0 ? v[i] / v20[i - 1] : NaN
  const fullYear = n > 252

  const sig: string[] = []
  const on = (id: string, cond: boolean) => cond && sig.push(id)

  on('hi52', fullYear && h[i] > priorHi)
  on('near52', fullYear && h[i] <= priorHi && c[i] >= hi52 * 0.98)
  on('nearLo52', fullYear && l[i] >= priorLo && c[i] <= lo52 * 1.02)
  on('hi52Close', fullYear && c[i] > priorHi)
  on('lo52Close', fullYear && c[i] < priorLo)
  on('pv20', c[i] > rollMax(c, 20, true)[i] && volRatio >= 2)
  on('pv2m', c[i] > rollMax(c, 42, true)[i] && volRatio >= 2)
  const prevPiv = pivots(h[i - 1], l[i - 1], c[i - 1])
  on('pivR2', c[i] > prevPiv.r2)
  on('pivS2', c[i] < prevPiv.s2)
  on('brk20', c[i] > hi20 && volRatio >= 1.5)
  on('brk50', c[i] > hi50)
  on('lo52', fullYear && l[i] < priorLo)
  on('bd20', c[i] < lo20 && volRatio >= 1.5)

  const stacked = c[i] > s50[i] && s50[i] > s200[i]
  const trend: Trend | null =
    !Number.isFinite(s50[i]) ? null
    : c[i] > s20[i] && s20[i] > s50[i] ? 'bull'
    : c[i] > s50[i] && s50[i] > s20[i] ? 'mbull'
    : s20[i] > c[i] && c[i] > s50[i] ? 'nup'
    : s50[i] > c[i] && c[i] > s20[i] ? 'ndn'
    : s20[i] > s50[i] && s50[i] > c[i] ? 'mbear'
    : s50[i] > s20[i] && s20[i] > c[i] ? 'bear'
    : null
  on('trendBull', trend === 'bull')
  on('trendBear', trend === 'bear')
  on('up20', c[i] > s20[i] && c[i - 1] <= s20[i - 1])
  on('dn20', c[i] < s20[i] && c[i - 1] >= s20[i - 1])
  on('streakUp', c[i] > c[i - 1] && c[i - 1] > c[i - 2] && c[i - 2] > c[i - 3])
  on('streakDn', c[i] < c[i - 1] && c[i - 1] < c[i - 2] && c[i - 2] < c[i - 3])
  on('uptrend', stacked && a.adx[i] > 25 && a.plusDI[i] > a.minusDI[i])
  on('downtrend', c[i] < s50[i] && s50[i] < s200[i] && a.adx[i] > 25 && a.minusDI[i] > a.plusDI[i])
  let golden = false
  let death = false
  for (let k = i; k > i - 5 && k > 0; k--) {
    if (s50[k] > s200[k] && s50[k - 1] <= s200[k - 1]) golden = true
    if (s50[k] < s200[k] && s50[k - 1] >= s200[k - 1]) death = true
  }
  on('golden', golden)
  on('death', death)
  on('up200', c[i] > s200[i] && c[i - 1] <= s200[i - 1])
  on('dn200', c[i] < s200[i] && c[i - 1] >= s200[i - 1])
  on('pull20', stacked && l[i] <= e20[i] && c[i] > e20[i] && c[i - 1] > e20[i - 1])

  on('macdUp', m.line[i] > m.signal[i] && m.line[i - 1] <= m.signal[i - 1])
  on('macdDn', m.line[i] < m.signal[i] && m.line[i - 1] >= m.signal[i - 1])
  on('rsiOS', r[i] < 30)
  on('rsiOB', r[i] > 70)

  const v5 = sma(v, 5)
  const volBoom = v[i - 1] > 0 ? v[i] / v[i - 1] : NaN
  const vol5 = v5[i - 1] > 0 ? v[i] / v5[i - 1] : NaN
  on('volBoom', volBoom >= 2)
  on('vol5', vol5 >= 1.5)
  on('volSurge', volRatio >= 3)
  on('volHi', fullYear && v[i] > rollMax(v, 252, true)[i])
  on('accum', chg >= 2 && volRatio >= 2)
  on('distrib', chg <= -2 && volRatio >= 2)

  const range = h.map((x, k) => x - l[k])
  const min3 = rollMin(range, 3, true)
  const min6 = rollMin(range, 6, true)
  on('nr4', range[i] > 0 && range[i] < min3[i])
  on('nr7', range[i] > 0 && range[i] < min6[i])
  // A narrow-range day is a coiled spring; the breakout is the next close beyond its range.
  const nr4Yesterday = range[i - 1] > 0 && range[i - 1] < min3[i - 1]
  const nr7Yesterday = range[i - 1] > 0 && range[i - 1] < min6[i - 1]
  on('nr4Up', nr4Yesterday && c[i] > h[i - 1])
  on('nr4Dn', nr4Yesterday && c[i] < l[i - 1])
  on('nr7Up', nr7Yesterday && c[i] > h[i - 1])
  on('nr7Dn', nr7Yesterday && c[i] < l[i - 1])
  let avgRange = 0
  const span = Math.min(100, i)
  for (let k = i - span; k < i; k++) avgRange += range[k]
  avgRange /= span
  on('hulkyUp', range[i] >= 2 * avgRange && chg > 0)
  on('hulkyDn', range[i] >= 2 * avgRange && chg < 0)
  const width = bb.upper.map((u, k) => (u - bb.lower[k]) / bb.mid[k])
  on('squeeze', n > 140 && width[i] <= rollMin(width, 120, true)[i])
  on('wide', range[i] >= 2 * at[i - 1])

  on('inside', h[i] < h[i - 1] && l[i] > l[i - 1])
  on('gapUp', l[i] > h[i - 1])
  on('gapDn', h[i] < l[i - 1])
  const red = (k: number) => c[k] < o[k]
  const green = (k: number) => c[k] > o[k]
  on('revUp', red(i - 1) && red(i - 2) && red(i - 3) && green(i) && c[i] > o[i - 1])
  on('revDn', green(i - 1) && green(i - 2) && green(i - 3) && red(i) && c[i] < o[i - 1])
  on('engulf', c[i - 1] < o[i - 1] && c[i] > o[i] && c[i] >= o[i - 1] && o[i] <= c[i - 1])

  const r3m = pctReturn(c, 63)
  const r6m = pctReturn(c, 126)
  const r9m = pctReturn(c, 189)
  const r1y = pctReturn(c, 252)
  // Double weight on the latest quarter; needs a full year of history to be ranked.
  const rsRaw = 2 * r3m + r6m + r9m + r1y

  // Trend template is finished by the pipeline once RS ratings exist; flag the price part here.
  const template =
    c[i] > s50[i] && s50[i] > s150[i] && s150[i] > s200[i] && s200[i] > s200[i - 21] &&
    c[i] >= hi52 * 0.75 && c[i] >= lo52 * 1.3 && fullYear
  on('template', template)

  let turnover = 0
  for (let k = Math.max(0, n - 20); k < n; k++) turnover += c[k] * v[k]
  turnover /= Math.min(20, n) * 1e7

  return {
    close: c[i],
    prevClose: c[i - 1],
    chg: round(chg)!,
    vol: v[i],
    volRatio: round(volRatio)!,
    turnoverCr: round(turnover, 1)!,
    rsi: round(r[i], 1)!,
    adx: round(a.adx[i], 1)!,
    atrPct: round((at[i] / c[i]) * 100)!,
    sma20: round(s20[i])!,
    sma50: round(s50[i])!,
    sma200: round(s200[i])!,
    hi52: round(hi52)!,
    lo52: round(lo52)!,
    fromHi: round((c[i] / hi52 - 1) * 100, 1)!,
    fromLo: round((c[i] / lo52 - 1) * 100, 1)!,
    r1w: round(pctReturn(c, 5), 1)!,
    r1m: round(pctReturn(c, 21), 1)!,
    r3m: round(r3m, 1)!,
    r6m: round(r6m, 1)!,
    r1y: round(r1y, 1)!,
    trend,
    piv: (({ p, r1, r2, s1, s2 }) => ({ p: round(p)!, r1: round(r1)!, r2: round(r2)!, s1: round(s1)!, s2: round(s2)!}))(pivots(h[i], l[i], c[i])),
    volBoom: round(volBoom)!,
    vol5: round(vol5)!,
    rsRaw,
    signals: sig,
  }
}
