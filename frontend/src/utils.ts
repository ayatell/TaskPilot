// Local-time ISO date (YYYY-MM-DD). toISOString() would shift to UTC.
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const daysUntil = (s: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDate(s).getTime() - today.getTime()) / 86_400_000)
}

export const fmtTime = (minutesFromMidnight: number) => {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`