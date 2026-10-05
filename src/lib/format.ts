const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const price = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '–' : inr.format(x))

export const pct = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}%`

export const num = (x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? '–' : digits ? x.toFixed(digits) : int.format(x)

// Indian units: lakh (1e5) and crore (1e7).
export function volume(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return '–'
  if (x >= 1e7) return `${(x / 1e7).toFixed(2)} Cr`
  if (x >= 1e5) return `${(x / 1e5).toFixed(2)} L`
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)} K`
  return String(x)
}

export const crore = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? '–' : `₹${x >= 100 ? int.format(x) : x.toFixed(1)} Cr`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Accepts 'yyyy-mm-dd' or yyyymmdd.
export function day(d: string | number) {
  const s = String(d).replaceAll('-', '')
  return `${Number(s.slice(6, 8))} ${MONTHS[Number(s.slice(4, 6)) - 1]} ${s.slice(0, 4)}`
}

export const sign = (x: number | null | undefined) => (x == null || !Number.isFinite(x) || x === 0 ? 'flat' : x > 0 ? 'up' : 'down')
