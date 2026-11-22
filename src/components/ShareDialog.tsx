import { Check, ChevronDown, Copy, Link2 } from 'lucide-react'
import { Dialog } from './Dialog'
import type { Lang } from '../lib/types'
import { translate } from '../i18n'
import type { SharePayload } from '../lib/share'
import { formatShort } from '../lib/date'

interface Props {
  open: boolean
  mode: 'share' | 'import'
  lang: Lang
  code: string
  copied: 'code' | 'link' | null
  importValue: string
  importError: boolean
  importPreview: SharePayload | null
  onCopy: (target: 'code' | 'link') => void
  onImportChange: (value: string) => void
  onApply: () => void
  onClose: () => void
}

export function ShareDialog({
  open,
  mode,
  lang,
  code,
  copied,
  importValue,
  importError,
  importPreview,
  onCopy,
  onImportChange,
  onApply,
  onClose,
}: Props) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(lang, key, vars)

  return (
    <Dialog
      open={open}
      title={mode === 'share' ? t('share.title') : t('share.importTitle')}
      closeLabel={t('common.close')}
      onClose={onClose}
    >
      {mode === 'share' ? (
        <>
          <p className="dialog-lead">{t('share.lead')}</p>
          <div className="dialog-actions dialog-actions-start">
            <button type="button" className="button-primary" onClick={() => onCopy('link')}>
              {copied === 'link' ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {copied === 'link' ? t('share.copied') : t('share.copyLink')}
            </button>
            <button type="button" className="button-quiet" onClick={() => onCopy('code')}>
              {copied === 'code' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied === 'code' ? t('share.copied') : t('share.copyCode')}
            </button>
          </div>
          <p className="dialog-hint">{t('share.copyHint')}</p>
          <details className="code-details">
            <summary>
              <ChevronDown size={15} className="code-chevron" aria-hidden="true" />
              {t('share.showCode')}
            </summary>
            <label className="visually-hidden" htmlFor="share-code">
              {t('share.showCode')}
            </label>
            <textarea
              id="share-code"
              className="code-box"
              value={code}
              readOnly
              rows={4}
              onFocus={(e) => e.currentTarget.select()}
            />
          </details>
        </>
      ) : (
        <>
          <p className="dialog-lead">{t('share.importLead')}</p>
          <label className="visually-hidden" htmlFor="import-code">
            {t('share.importTitle')}
          </label>
          <textarea
            id="import-code"
            className="code-box"
            value={importValue}
            rows={4}
            placeholder={t('share.importPlaceholder')}
            onChange={(e) => onImportChange(e.target.value)}
          />
          <p className="dialog-note" role="status">
            {importPreview
              ? t('share.importPreview', {
                  name: importPreview.n || t('name.defaultA'),
                  date: formatShort(importPreview.d, lang),
                  n: [importPreview.r.gratitude, importPreview.r.meditation, importPreview.r.prayer].filter((v) =>
                    v.trim(),
                  ).length,
                })
              : importError
                ? t('share.importInvalid')
                : ''}
          </p>
          <div className="dialog-actions">
            <button type="button" className="button-primary" onClick={onApply} disabled={!importPreview}>
              {t('share.importApply')}
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
