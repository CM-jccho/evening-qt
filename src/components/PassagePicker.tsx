import { useEffect, useRef, useState } from 'react'
import { Check, PencilLine } from 'lucide-react'
import { Dialog } from './Dialog'
import type { Lang } from '../lib/types'
import { translate } from '../i18n'
import type { PassageView } from './PassagePanel'

interface PassageItem extends PassageView {
  day: number
}

interface Props {
  open: boolean
  lang: Lang
  passages: PassageItem[]
  currentIndex: number
  custom: boolean
  fallback: PassageView
  onPick: (index: number) => void
  onSaveCustom: (passage: PassageView) => void
  onClearCustom: () => void
  onClose: () => void
}

export function PassagePicker({
  open,
  lang,
  passages,
  currentIndex,
  custom,
  fallback,
  onPick,
  onSaveCustom,
  onClearCustom,
  onClose,
}: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [form, setForm] = useState<PassageView>({ refKo: '', refEn: '', ko: '', en: '' })
  const [invalid, setInvalid] = useState(false)
  const listRef = useRef<HTMLUListElement | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  /* open the list at the passage tonight is using */
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      const list = listRef.current
      const active = activeRef.current
      if (!list || !active) return
      list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2)
    }, 40)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    setMode('list')
    setInvalid(false)
    setForm({
      refKo: fallback.refKo,
      refEn: fallback.refEn,
      ko: fallback.ko,
      en: fallback.en,
    })
  }, [open, fallback])

  const applyCustom = () => {
    if (!form.refKo.trim() && !form.refEn.trim()) {
      setInvalid(true)
      return
    }
    if (!form.ko.trim() && !form.en.trim()) {
      setInvalid(true)
      return
    }
    onSaveCustom({
      refKo: form.refKo.trim() || form.refEn.trim(),
      refEn: form.refEn.trim() || form.refKo.trim(),
      ko: form.ko.trim(),
      en: form.en.trim(),
    })
  }

  return (
    <Dialog
      open={open}
      title={mode === 'list' ? t('passageList.title') : t('editor.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      wide
    >
      {mode === 'list' ? (
        <>
          <p className="dialog-lead">{t('passageList.lead')}</p>
          <ul className="passage-list" ref={listRef}>
            {passages.map((item, index) => (
              <li key={item.day}>
                <button
                  type="button"
                  ref={index === currentIndex && !custom ? activeRef : undefined}
                  className={index === currentIndex && !custom ? 'passage-option passage-option-active' : 'passage-option'}
                  onClick={() => onPick(index)}
                >
                  <span className="passage-option-ref">{lang === 'ko' ? item.refKo : item.refEn}</span>
                  <span className="passage-option-text">{lang === 'ko' ? item.ko : item.en}</span>
                  {index === currentIndex && !custom ? (
                    <Check size={16} className="passage-option-check" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button type="button" className="button-quiet" onClick={() => setMode('edit')}>
              <PencilLine size={15} aria-hidden="true" />
              {t('passage.edit')}
            </button>
            {custom ? (
              <button type="button" className="button-quiet" onClick={onClearCustom}>
                {t('editor.reset')}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="dialog-lead">{t('editor.lead')}</p>
          <div className="editor-grid">
            <label className="field">
              <span className="field-label">{t('editor.refKo')}</span>
              <input
                className="field-input field-single"
                value={form.refKo}
                onChange={(e) => setForm({ ...form, refKo: e.target.value })}
                maxLength={80}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('editor.refEn')}</span>
              <input
                className="field-input field-single"
                value={form.refEn}
                onChange={(e) => setForm({ ...form, refEn: e.target.value })}
                maxLength={80}
              />
            </label>
            <label className="field editor-wide">
              <span className="field-label">{t('editor.ko')}</span>
              <textarea
                className="field-input"
                rows={3}
                value={form.ko}
                onChange={(e) => setForm({ ...form, ko: e.target.value })}
                maxLength={1200}
              />
            </label>
            <label className="field editor-wide">
              <span className="field-label">{t('editor.en')}</span>
              <textarea
                className="field-input"
                rows={3}
                value={form.en}
                onChange={(e) => setForm({ ...form, en: e.target.value })}
                maxLength={1600}
              />
            </label>
          </div>
          {invalid ? (
            <p className="dialog-note dialog-note-error" role="alert">
              {t('editor.invalid')}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="button-primary" onClick={applyCustom}>
              {t('editor.save')}
            </button>
            {custom ? (
              <button type="button" className="button-quiet" onClick={onClearCustom}>
                {t('editor.reset')}
              </button>
            ) : null}
            <button type="button" className="button-quiet" onClick={() => setMode('list')}>
              {t('passageList.fromList')}
            </button>
            <button type="button" className="button-quiet" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
