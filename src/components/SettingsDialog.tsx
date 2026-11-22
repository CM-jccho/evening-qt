import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Dialog } from './Dialog'
import { SyncSection } from './SyncSection'
import type { Lang, Theme } from '../lib/types'
import type { SyncApi } from '../lib/sync/useSync'
import { translate } from '../i18n'

interface Props {
  open: boolean
  lang: Lang
  theme: Theme
  names: [string, string]
  chime: boolean
  sync: SyncApi
  onNameChange: (index: 0 | 1, value: string) => void
  onTheme: (theme: Theme) => void
  onChime: (value: boolean) => void
  onExport: () => void
  onImportFile: (file: File) => void
  onReset: () => void
  onClose: () => void
}

export function SettingsDialog({
  open,
  lang,
  theme,
  names,
  chime,
  sync,
  onNameChange,
  onTheme,
  onChime,
  onExport,
  onImportFile,
  onReset,
  onClose,
}: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (open) setConfirmReset(false)
  }, [open])

  return (
    <Dialog open={open} title={t('settings.title')} closeLabel={t('common.close')} onClose={onClose}>
      <div className="setting-block">
        <h3 className="setting-title">{t('settings.names')}</h3>
        <div className="editor-grid">
          <label className="field">
            <span className="field-label">{t('settings.nameA')}</span>
            <input
              className="field-input field-single"
              value={names[0]}
              placeholder={t('settings.namePlaceholderA')}
              maxLength={16}
              onChange={(e) => onNameChange(0, e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t('settings.nameB')}</span>
            <input
              className="field-input field-single"
              value={names[1]}
              placeholder={t('settings.namePlaceholderB')}
              maxLength={16}
              onChange={(e) => onNameChange(1, e.target.value)}
            />
          </label>
        </div>
      </div>

      <SyncSection lang={lang} sync={sync} />

      <div className="setting-block">
        <h3 className="setting-title">{t('settings.appearance')}</h3>
        <div className="theme-choices" role="group" aria-label={t('settings.appearance')}>
          <button
            type="button"
            className="theme-choice theme-choice-lamp"
            aria-pressed={theme === 'lamp'}
            onClick={() => onTheme('lamp')}
          >
            <span className="theme-swatch theme-swatch-lamp" aria-hidden="true" />
            {t('theme.lamp')}
          </button>
          <button
            type="button"
            className="theme-choice theme-choice-paper"
            aria-pressed={theme === 'paper'}
            onClick={() => onTheme('paper')}
          >
            <span className="theme-swatch theme-swatch-paper" aria-hidden="true" />
            {t('theme.paper')}
          </button>
        </div>
        <label className="switch">
          <input type="checkbox" checked={chime} onChange={(e) => onChime(e.target.checked)} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-dot" />
          </span>
          <span className="switch-label">{t('timer.chime')}</span>
        </label>
      </div>

      <div className="setting-block">
        <h3 className="setting-title">{t('settings.backup')}</h3>
        <p className="dialog-lead">{t('settings.backupLead')}</p>
        <div className="dialog-actions dialog-actions-start">
          <button type="button" className="button-quiet" onClick={onExport}>
            <Download size={15} aria-hidden="true" />
            {t('archive.export')}
          </button>
          <button type="button" className="button-quiet" onClick={() => fileRef.current?.click()}>
            <Upload size={15} aria-hidden="true" />
            {t('archive.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label={t('archive.import')}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="setting-block setting-danger">
        {confirmReset ? (
          <>
            <p className="dialog-note dialog-note-error">{t('settings.resetConfirm')}</p>
            <div className="dialog-actions dialog-actions-start">
              <button
                type="button"
                className="button-danger"
                onClick={() => {
                  onReset()
                  setConfirmReset(false)
                }}
              >
                {t('settings.reset')}
              </button>
              <button type="button" className="button-quiet" onClick={() => setConfirmReset(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="button-quiet" onClick={() => setConfirmReset(true)}>
            {t('settings.reset')}
          </button>
        )}
      </div>
    </Dialog>
  )
}
