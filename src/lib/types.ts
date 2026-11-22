export type Lang = 'ko' | 'en'
export type Theme = 'lamp' | 'paper'
export type PersonKey = 'a' | 'b'

export interface Reflection {
  gratitude: string
  meditation: string
  prayer: string
}

export interface CustomPassage {
  refKo: string
  refEn: string
  ko: string
  en: string
}

export interface DayRecord {
  a: Reflection
  b: Reflection
  /** index into the curated list, when the reader chose another passage */
  index?: number
  /** a passage the reader typed or edited for this date */
  custom?: CustomPassage | null
}

export interface Settings {
  /** an empty string means "use the language default" (남편/아내, Husband/Wife) */
  names: [string, string]
  lang: Lang
  theme: Theme
  chime: boolean
  demoSeen: boolean
}

export interface Store {
  version: 1
  settings: Settings
  records: Record<string, DayRecord>
}

export const EMPTY_REFLECTION: Reflection = { gratitude: '', meditation: '', prayer: '' }

export function emptyRecord(): DayRecord {
  return { a: { ...EMPTY_REFLECTION }, b: { ...EMPTY_REFLECTION } }
}

export function isRecordEmpty(rec: DayRecord | undefined): boolean {
  if (!rec) return true
  const fields = [rec.a, rec.b]
  return fields.every((f) => !f.gratitude.trim() && !f.meditation.trim() && !f.prayer.trim()) && !rec.custom
}
