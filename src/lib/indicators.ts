// Technical indicators over plain number arrays. Outputs are aligned to the input;
// positions without enough history are NaN. Shared by the data pipeline and the charts.

export type Series = number[]

const nan = (n: number): Series => new Array(n).fill(NaN)

export function sma(x: Series, p: number): Series {
  const out = nan(x.length)
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    sum += x[i]
    if (i >= p) sum -= x[i - p]
    if (i >= p - 1) out[i] = sum / p
  }
  return out
}

export function ema(x: Series, p: number): Series {
  const out = nan(x.length)
  if (x.length < p) return out
  const k = 2 / (p + 1)
  let prev = 0
  for (let i = 0; i < p; i++) prev += x[i]
  prev /= p
  out[p - 1] = prev
  for (let i = p; i < x.length; i++) {
    prev = x[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// Wilder's smoothing (RMA), seeded with a simple average of the first p valid values.
function rma(x: Series, p: number, start: number): Series {
  const out = nan(x.length)
  if (x.length < start + p) return out
  let prev = 0
  for (let i = start; i < start + p; i++) prev += x[i]
  prev /= p
  out[start + p - 1] = prev
  for (let i = start + p; i < x.length; i++) {
    prev = (prev * (p - 1) + x[i]) / p
    out[i] = prev
  }
  return out
}

export function rsi(close: Series, p = 14): Series {
  const n = close.length
  const gain = nan(n)
  const loss = nan(n)
  for (let i = 1; i < n; i++) {
    const d = close[i] - close[i - 1]
    gain[i] = d > 0 ? d : 0
    loss[i] = d < 0 ? -d : 0
  }
  const ag = rma(gain, p, 1)
  const al = rma(loss, p, 1)
  return ag.map((g, i) => (isNaN(g) ? NaN : al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i])))
}

export function macd(close: Series, fast = 12, slow = 26, signal = 9) {
  const ef = ema(close, fast)
  const es = ema(close, slow)
  const line = ef.map((v, i) => v - es[i])
  const first = line.findIndex((v) => !isNaN(v))
  const sig = nan(close.length)
  if (first >= 0) {
    const s = ema(line.slice(first), signal)
    for (let i = 0; i < s.length; i++) sig[first + i] = s[i]
  }
  const hist = line.map((v, i) => v - sig[i])
  return { line, signal: sig, hist }
}

export function trueRange(high: Series, low: Series, close: Series): Series {
  return high.map((h, i) =>
    i === 0 ? h - low[i] : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])),
  )
}

export function atr(high: Series, low: Series, close: Series, p = 14): Series {
  return rma(trueRange(high, low, close), p, 1)
}

export function adx(high: Series, low: Series, close: Series, p = 14) {
  const n = close.length
  const plusDM = nan(n)
  const minusDM = nan(n)
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1]
    const down = low[i - 1] - low[i]
    plusDM[i] = up > down && up > 0 ? up : 0
    minusDM[i] = down > up && down > 0 ? down : 0
  }
  const tr = rma(trueRange(high, low, close), p, 1)
  const pdm = rma(plusDM, p, 1)
  const mdm = rma(minusDM, p, 1)
  const plusDI = pdm.map((v, i) => (100 * v) / tr[i])
  const minusDI = mdm.map((v, i) => (100 * v) / tr[i])
  const dx = plusDI.map((v, i) => {
    const s = v + minusDI[i]
    return s === 0 ? 0 : (100 * Math.abs(v - minusDI[i])) / s
  })
  const first = dx.findIndex((v) => !isNaN(v))
  const out = first < 0 ? nan(n) : rma(dx, p, first)
  return { adx: out, plusDI, minusDI }
}

export function bollinger(close: Series, p = 20, mult = 2) {
  const mid = sma(close, p)
  const upper = nan(close.length)
  const lower = nan(close.length)
  for (let i = p - 1; i < close.length; i++) {
    let s = 0
    for (let j = i - p + 1; j <= i; j++) s += (close[j] - mid[i]) ** 2
    const sd = Math.sqrt(s / p)
    upper[i] = mid[i] + mult * sd
    lower[i] = mid[i] - mult * sd
  }
  return { mid, upper, lower }
}

// Rolling max / min over the previous p values, optionally excluding the current bar.
export function rollMax(x: Series, p: number, excludeCurrent = false): Series {
  const out = nan(x.length)
  const off = excludeCurrent ? 1 : 0
  for (let i = p - 1 + off; i < x.length; i++) {
    let m = -Infinity
    for (let j = i - off - p + 1; j <= i - off; j++) if (x[j] > m) m = x[j]
    out[i] = m
  }
  return out
}

export function rollMin(x: Series, p: number, excludeCurrent = false): Series {
  const out = nan(x.length)
  const off = excludeCurrent ? 1 : 0
  for (let i = p - 1 + off; i < x.length; i++) {
    let m = Infinity
    for (let j = i - off - p + 1; j <= i - off; j++) if (x[j] < m) m = x[j]
    out[i] = m
  }
  return out
}

// Percent change over `bars` trading days, measured at the last bar.
export function pctReturn(close: Series, bars: number): number {
  const n = close.length
  if (n <= bars) return NaN
  return (close[n - 1] / close[n - 1 - bars] - 1) * 100
}
