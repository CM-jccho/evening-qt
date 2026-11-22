import { useEffect, useState } from 'react'
import { CloudCheck, CloudOff, Link2, Plus } from 'lucide-react'
import type { Lang } from '../lib/types'
import { translate, type CopyKey } from '../i18n'
import type { SyncApi } from '../lib/sync/useSync'

interface Props {
  lang: Lang
  sync: SyncApi
}

export function SyncSection({ lang, sync }: Props) {
  const t = (key: CopyKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const connected = Boolean(sync.passphrase)

  useEffect(() => {
    if (!connected) setConfirmOff(false)
  }, [connected])

  const statusText = (() => {
    switch (sync.info.status) {
      case 'live':
        return t('sync.statusLive')
      case 'connecting':
        return t('sync.statusConnecting')
      case 'offline':
        return t('sync.statusOffline')
      case 'error':
        return t('sync.statusError')
      default:
        return t('sync.statusConnecting')
    }
  })()

  const checkedAt = (() => {
    if (!sync.info.lastSyncedAt) return ''
    const minutes = Math.max(0, Math.round((Date.now() - sync.info.lastSyncedAt) / 60_000))
    const when = minutes < 1 ? t('sync.justNow') : t('sync.minutesAgo', { n: minutes })
    return t('sync.lastSynced', { when })
  })()

  const submit = async () => {
    setMessage(null)
    const error = await sync.connect(draft)
    if (error === 'sync-passphrase-short') setMessage(t('sync.short'))
    else if (error) setMessage(t('sync.failed'))
    else setDraft('')
  }

  /* 동기화 서버가 설정되지 않은 빌드에서는 아무 것도 내보이지 않는다(이 기기 저장만) */
  if (!sync.available) return null

  if (connected) {
    const Live = sync.info.status === 'live' ? CloudCheck : CloudOff
    return (
      <div className="setting-block">
        <h3 className="setting-title">{t('sync.title')}</h3>
        <p className="sync-status" role="status" data-state={sync.info.status}>
          <Live size={16} aria-hidden="true" />
          <span>{statusText}</span>
          {checkedAt ? <span className="sync-status-when">{checkedAt}</span> : null}
        </p>
        <p className="dialog-lead">{t('sync.connectedLead')}</p>
        <div className="dialog-actions dialog-actions-start">
          <button type="button" className="button-quiet" onClick={() => void sync.copyInviteLink()}>
            <Link2 size={15} aria-hidden="true" />
            {t('sync.copyLink')}
          </button>
        </div>
        <p className="sync-note">{t('sync.linkNote')}</p>
        {confirmOff ? (
          <div className="sync-confirm">
            <p className="dialog-note dialog-note-error">{t('sync.confirmDisconnect')}</p>
            <div className="dialog-actions dialog-actions-start">
              <button
                type="button"
                className="button-quiet button-quiet-danger"
                onClick={() => {
                  sync.disconnect()
                  setConfirmOff(false)
                }}
              >
                {t('sync.disconnect')}
              </button>
              <button type="button" className="button-quiet" onClick={() => setConfirmOff(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="sync-off" onClick={() => setConfirmOff(true)}>
            {t('sync.disconnect')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="setting-block">
      <h3 className="setting-title">{t('sync.title')}</h3>
      <p className="dialog-lead">{t('sync.lead')}</p>
      <label className="field">
        <span className="field-label">{t('sync.passLabel')}</span>
        <input
          className="field-input field-single"
          type="text"
          value={draft}
          placeholder={t('sync.passPlaceholder')}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) {
              event.preventDefault()
              void submit()
            }
          }}
        />
      </label>
      <div className="dialog-actions dialog-actions-start">
        <button type="button" className="button-quiet" disabled={sync.busy || !draft.trim()} onClick={() => void submit()}>
          <Plus size={15} aria-hidden="true" />
          {sync.busy ? t('sync.busy') : t('sync.connect')}
        </button>
      </div>
      {message ? <p className="dialog-note dialog-note-error">{message}</p> : null}
      <p className="sync-note">{t('sync.note')}</p>
      <p className="sync-note">{t('sync.guide')}</p>
    </div>
  )
}
