import { MessageSquareText, Share2 } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import type { DayRecord, Lang, PersonKey, Reflection } from '../lib/types'
import { translate } from '../i18n'

interface Props {
  record: DayRecord
  names: [string, string]
  lang: Lang
  onNameChange: (index: 0 | 1, value: string) => void
  onField: (who: PersonKey, field: keyof Reflection, value: string) => void
  onShare: (who: PersonKey) => void
  onImport: () => void
}

const FIELDS: (keyof Reflection)[] = ['gratitude', 'meditation', 'prayer']

export function ReflectionSpread({ record, names, lang, onNameChange, onField, onShare, onImport }: Props) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)

  const columns: { who: PersonKey; index: 0 | 1 }[] = [
    { who: 'a', index: 0 },
    { who: 'b', index: 1 },
  ]

  return (
    <section className="spread" id="reflection" aria-labelledby="spread-title">
      <div className="section-head">
        <h2 id="spread-title" className="section-title">
          {t('spread.title')}
        </h2>
        <p className="section-lead">{t('spread.hint')}</p>
      </div>

      <div className="spread-grid">
        {columns.map(({ who, index }, position) => (
          <div className={position === 0 ? 'spread-column spread-column-first' : 'spread-column'} key={who}>
            <div className="column-head">
              <label className="visually-hidden" htmlFor={`name-${who}`}>
                {index === 0 ? t('a11y.nameA') : t('a11y.nameB')}
              </label>
              <input
                id={`name-${who}`}
                className="name-input"
                value={names[index]}
                placeholder={index === 0 ? t('settings.namePlaceholderA') : t('settings.namePlaceholderB')}
                maxLength={16}
                onChange={(e) => onNameChange(index, e.target.value)}
              />
              <span className="column-rule" aria-hidden="true" />
            </div>

            {FIELDS.map((field) => (
              <AutoTextarea
                key={field}
                id={`${who}-${field}`}
                label={t(`field.${field}` as 'field.gratitude' | 'field.meditation' | 'field.prayer')}
                value={record[who][field]}
                placeholder={t(`placeholder.${field}` as 'placeholder.gratitude' | 'placeholder.meditation' | 'placeholder.prayer')}
                onChange={(value) => onField(who, field, value)}
                maxLength={field === 'meditation' ? 4000 : 2000}
              />
            ))}

            <button type="button" className="button-quiet share-button" onClick={() => onShare(who)}>
              <Share2 size={15} aria-hidden="true" />
              {t('share.column')}
            </button>
          </div>
        ))}
      </div>

      <div className="spread-foot">
        <button type="button" className="button-quiet" onClick={onImport}>
          <MessageSquareText size={15} aria-hidden="true" />
          {t('share.import')}
        </button>
        <p className="foot-hint">{t('spread.footHint')}</p>
      </div>
    </section>
  )
}
