export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function todayKey(): string {
  return dateKey(new Date())
}

export function addDays(key: string, delta: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + delta)
  return dateKey(d)
}

const KO_WEEK = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const EN_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EN_MONTH = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatDate(key: string, lang: 'ko' | 'en'): string {
  const d = parseKey(key)
  if (lang === 'ko') {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_WEEK[d.getDay()]}`
  }
  return `${EN_WEEK[d.getDay()]}, ${EN_MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatShort(key: string, lang: 'ko' | 'en'): string {
  const d = parseKey(key)
  if (lang === 'ko') return `${d.getMonth() + 1}월 ${d.getDate()}일`
  return `${EN_MONTH[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

export function formatMonth(year: number, month: number, lang: 'ko' | 'en'): string {
  if (lang === 'ko') return `${year}년 ${month + 1}월`
  return `${EN_MONTH[month]} ${year}`
}

export function weekdayLabels(lang: 'ko' | 'en'): string[] {
  return lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
}

/** Sunday-first cells for a month, with nulls before the first day. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)))
  return cells
}

export function passageIndexFor(key: string): number {
  const d = parseKey(key)
  return (d.getDate() - 1) % 31
}

export function isEvening(): boolean {
  const h = new Date().getHours()
  return h >= 17 || h < 4
}
