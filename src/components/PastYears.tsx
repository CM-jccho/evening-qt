import { ArrowUpRight } from 'lucide-react'
import type { DayRecord, Lang, PersonKey, Reflection } from '../lib/types'
import { translate } from '../i18n'
import { recordPassage, type PastEntry, type PastPassage } from '../lib/past'
import { formatShort } from '../lib/date'

interface Props {
  entries: PastEntry[]
  lang: Lang
  names: [string, string]
  viewDate: string
  sample: boolean
  passages: PastPassage[]
  onOpen: (key: string) => void
}

const FIELDS: (keyof Reflection)[] = ['gratitude', 'meditation', 'prayer']
const SIDES: PersonKey[] = ['a', 'b']
const FIELD_LABEL = {
  gratitude: 'past.field.gratitude',
  meditation: 'past.field.meditation',
  prayer: 'past.field.prayer',
} as const

export function PastYears({ entries, lang, names, viewDate, sample, passages, onOpen }: Props) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)

  const reading = (record: DayRecord, who: PersonKey) =>
    FIELDS.map((field) => ({ field, text: record[who][field].trim() })).filter((item) => item.text)

  return (
    <section className="past" aria-labelledby="past-title">
      <div className="section-head">
        <h2 id="past-title" className="section-title">
          {t('past.title', { date: formatShort(viewDate, lang) })}
        </h2>
        <p className="section-lead">{t('past.lead')}</p>
      </div>

      {entries.length === 0 ? (
        <p className="past-empty">{t('past.empty')}</p>
      ) : (
        <>
          <ol className="past-list">
            {entries.map((entry) => {
              const passage = recordPassage(entry.record, entry.key, passages)
              const primaryRef = lang === 'ko' ? passage.refKo : passage.refEn
              const secondaryRef = lang === 'ko' ? passage.refEn : passage.refKo
              return (
                <li className="past-year" key={entry.key}>
                  <div className="past-head">
                    <h3 className="past-year-number">{entry.year}</h3>
                    <p className="past-ago">{entry.ago === 1 ? t('past.agoOne') : t('past.ago', { n: entry.ago })}</p>
                    {!sample ? (
                      <button type="button" className="button-quiet past-open" onClick={() => onOpen(entry.key)}>
                        {t('past.open')}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>

                  <div className="past-body">
                    {primaryRef || secondaryRef ? (
                      <p className="past-ref">
                        <span lang={lang === 'ko' ? 'ko' : 'en'}>{primaryRef}</span>
                        {secondaryRef ? <span className="past-ref-alt">{secondaryRef}</span> : null}
                      </p>
                    ) : null}

                    <div className="past-cols">
                      {SIDES.map((who, index) => {
                        const fields = reading(entry.record, who)
                        if (fields.length === 0) return null
                        return (
                          <div className="past-col" key={who}>
                            <p className="past-name">{names[index]}</p>
                            {fields.map(({ field, text }) => (
                              <div className="past-field" key={field}>
                                <p className="past-field-label">{t(FIELD_LABEL[field])}</p>
                                <p className="past-field-text">{text}</p>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          {sample ? <p className="past-note">{t('past.sampleNote')}</p> : null}
        </>
      )}
    </section>
  )
}
