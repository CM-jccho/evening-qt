import { PencilLine, RefreshCw } from 'lucide-react'
import type { Lang } from '../lib/types'

export interface PassageView {
  refKo: string
  refEn: string
  ko: string
  en: string
}

interface Props {
  passage: PassageView
  lang: Lang
  custom: boolean
  labels: {
    another: string
    edit: string
    start: string
    fromYou: string
    rhythm: string
  }
  onAnother: () => void
  onEdit: () => void
  onStart: () => void
}

export function PassagePanel({ passage, lang, custom, labels, onAnother, onEdit, onStart }: Props) {
  const primaryRef = lang === 'ko' ? passage.refKo : passage.refEn
  const secondaryRef = lang === 'ko' ? passage.refEn : passage.refKo
  const primaryText = lang === 'ko' ? passage.ko : passage.en
  const secondaryText = lang === 'ko' ? passage.en : passage.ko
  const primaryLang = lang === 'ko' ? 'ko' : 'en'
  const secondaryLang = lang === 'ko' ? 'en' : 'ko'

  return (
    <section className="passage" aria-labelledby="passage-ref">
      <div className="passage-main">
        <div className="passage-meta">
          <h2 id="passage-ref" className="passage-ref" lang={primaryLang}>
            {primaryRef}
          </h2>
          <p className="passage-ref-alt" lang={secondaryLang}>
            {secondaryRef}
          </p>
          {custom ? <p className="passage-note">{labels.fromYou}</p> : null}
        </div>

        <blockquote className="verse">
          <p className="verse-primary" lang={primaryLang}>
            {primaryText}
          </p>
          <p className="verse-secondary" lang={secondaryLang}>
            {secondaryText}
          </p>
        </blockquote>
      </div>

      <div className="passage-side">
        <p className="passage-rhythm">{labels.rhythm}</p>
        <div className="passage-actions">
          <button type="button" className="button-primary" onClick={onStart}>
            {labels.start}
          </button>
          <button type="button" className="button-quiet" onClick={onAnother}>
            <RefreshCw size={15} aria-hidden="true" />
            {labels.another}
          </button>
          <button type="button" className="button-quiet" onClick={onEdit}>
            <PencilLine size={15} aria-hidden="true" />
            {labels.edit}
          </button>
        </div>
      </div>
    </section>
  )
}
