import type { DayRecord, Lang } from './types'
import { isRecordEmpty } from './types'
import { passageIndexFor } from './date'
import { demoPastRecords } from './demo'

/** One earlier year's entry for the month-day being read. */
export interface PastEntry {
  key: string
  year: number
  /** how many years before the page's date: 1 last year, 2 the year before */
  ago: number
  record: DayRecord
  /** filled from the sample layer, never from the saved store */
  sample: boolean
}

export interface PastPassage {
  refKo: string
  refEn: string
  ko: string
  en: string
}

const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_YEARS = 3

/** The month and day of a dated page, `11-22`. */
export function monthDay(key: string): string {
  return key.slice(5)
}

/**
 * Every earlier year in the record that shares this page's month and day,
 * newest year first. A page viewed in an earlier year shows only what came
 * before it, so the same day never looks backwards into a future entry.
 */
export function sameDayInPast(records: Record<string, DayRecord>, viewDate: string): PastEntry[] {
  if (!KEY_PATTERN.test(viewDate)) return []
  const md = monthDay(viewDate)
  const year = Number(viewDate.slice(0, 4))
  return Object.entries(records)
    .filter(([key, rec]) => {
      if (key === viewDate || !KEY_PATTERN.test(key) || !key.endsWith(`-${md}`)) return false
      const entryYear = Number(key.slice(0, 4))
      return entryYear < year && !isRecordEmpty(rec)
    })
    .map(([key, record]) => ({
      key,
      year: Number(key.slice(0, 4)),
      ago: year - Number(key.slice(0, 4)),
      record,
      sample: false,
    }))
    .sort((left, right) => right.key.localeCompare(left.key))
    .slice(0, MAX_YEARS)
}

/** The sample layer's answer to the same question, kept out of the store. */
export function sampleSameDayInPast(viewDate: string, lang: Lang): PastEntry[] {
  if (!KEY_PATTERN.test(viewDate)) return []
  const md = monthDay(viewDate)
  const year = Number(viewDate.slice(0, 4))
  return demoPastRecords(viewDate, lang)
    .map(({ year: pastYear, record }) => ({
      key: `${pastYear}-${md}`,
      year: pastYear,
      ago: year - pastYear,
      record,
      sample: true,
    }))
    .slice(0, MAX_YEARS)
}

/** The passage a page used: one the reader typed, one they chose, or the day's own. */
export function recordPassage(
  record: DayRecord,
  key: string,
  list: PastPassage[],
): PastPassage {
  if (record.custom && (record.custom.ko.trim() || record.custom.en.trim())) {
    return { refKo: record.custom.refKo, refEn: record.custom.refEn, ko: record.custom.ko, en: record.custom.en }
  }
  const index = record.index ?? passageIndexFor(key)
  return list[index % list.length] ?? list[0]
}
