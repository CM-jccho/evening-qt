import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { DayRecord, Lang } from '../lib/types'
import { isRecordEmpty } from '../lib/types'
import { formatDate, formatMonth, formatShort, monthCells, parseKey, weekdayLabels } from '../lib/date'
import { translate } from '../i18n'

interface Props {
  lang: Lang
  records: Record<string, DayRecord>
  selected: string
  onOpenDate: (key: string) => void
}

export function Archive({ lang, records, selected, onOpenDate }: Props) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)
  const initial = parseKey(selected)
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [query, setQuery] = useState('')

  const recorded = useMemo(
    () =>
      Object.entries(records)
        .filter(([, rec]) => !isRecordEmpty(rec))
        .map(([key]) => key)
        .sort()
        .reverse(),
    [records],
  )

  const monthList = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
    return recorded.filter((key) => key.startsWith(prefix))
  }, [recorded, cursor])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return monthList
    return recorded.filter((key) => {
      if (key.includes(q)) return true
      if (formatDate(key, lang).toLowerCase().includes(q)) return true
      if (formatShort(key, lang).toLowerCase().includes(q)) return true
      const rec = records[key]
      return [rec.a, rec.b].some((side) =>
        [side.gratitude, side.meditation, side.prayer].some((text) => text.toLowerCase().includes(q)),
      )
    })
  }, [query, recorded, monthList, lang, records])

  const cells = monthCells(cursor.year, cursor.month)
  const todayCell = new Date()
  const todayStr = `${todayCell.getFullYear()}-${String(todayCell.getMonth() + 1).padStart(2, '0')}-${String(
    todayCell.getDate(),
  ).padStart(2, '0')}`

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  const snippet = (key: string): string => {
    const rec = records[key]
    const first = rec.a.gratitude.trim() || rec.b.gratitude.trim() || rec.a.meditation.trim() || rec.b.meditation.trim()
    return first.length > 56 ? `${first.slice(0, 56)}…` : first
  }

  return (
    <section className="archive" aria-labelledby="archive-title">
      <details className="archive-details">
        <summary className="archive-summary">
          <h2 id="archive-title" className="section-title">
            {t('archive.title')}
          </h2>
          <span className="archive-summary-count">{t('archive.toggle', { n: recorded.length })}</span>
          <ChevronDown size={18} className="archive-chevron" aria-hidden="true" />
        </summary>

        <div className="archive-content">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">{t('archive.search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('archive.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="month-bar">
            <button type="button" className="icon-button" onClick={() => shiftMonth(-1)} aria-label={t('archive.prevMonth')}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <p className="month-label">{formatMonth(cursor.year, cursor.month, lang)}</p>
            <button type="button" className="icon-button" onClick={() => shiftMonth(1)} aria-label={t('archive.nextMonth')}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="month-grid">
            {weekdayLabels(lang).map((label, i) => (
              <span key={`${label}-${i}`} className="month-weekday">
                {label}
              </span>
            ))}
            {cells.map((key, i) => {
              if (!key) return <span key={`blank-${i}`} className="month-cell month-cell-blank" />
              const day = parseKey(key).getDate()
              const has = recorded.includes(key)
              const isSelected = key === selected
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'month-cell',
                    has ? 'month-cell-has' : '',
                    key === todayStr ? 'month-cell-today' : '',
                    isSelected ? 'month-cell-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onOpenDate(key)}
                  aria-label={formatDate(key, lang)}
                  aria-pressed={isSelected}
                >
                  <span>{day}</span>
                  {has ? <span className="month-dot" aria-hidden="true" /> : null}
                </button>
              )
            })}
          </div>

          <ul className="archive-list">
            {results.length === 0 ? (
              <li className="archive-empty">{query ? t('archive.noResult') : t('archive.empty')}</li>
            ) : (
              results.slice(0, 8).map((key) => (
                <li key={key} className="archive-row">
                  <button type="button" className="archive-open" onClick={() => onOpenDate(key)}>
                    <span className="archive-date">{formatShort(key, lang)}</span>
                    <span className="archive-snippet">{snippet(key) || t('archive.open')}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </details>
    </section>
  )
}
