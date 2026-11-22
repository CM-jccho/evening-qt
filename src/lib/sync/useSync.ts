import { useCallback, useEffect, useRef, useState } from 'react'
import type { Store } from '../types'
import type { CopyKey } from '../../i18n'
import { SYNC_CONFIG } from './config'
import { SyncEngine, type StorePatch, type SyncInfo } from './engine'
import { passphraseReady } from './crypto'
import { buildInviteLink, parseInvite } from './invite'

export interface SyncApi {
  available: boolean
  info: SyncInfo
  passphrase: string | null
  busy: boolean
  connect: (passphrase: string) => Promise<string | null>
  acceptInvite: (code: string) => Promise<string | null>
  disconnect: () => void
  setPaused: (paused: boolean) => void
  copyInviteLink: () => Promise<boolean>
}

interface Options {
  store: Store
  applyPatch: (patch: StorePatch) => void
  onToast: (key: CopyKey) => void
}

/** 앱 하나에 동기화 엔진 하나(새로 그려져도 연결을 다시 만들지 않는다) */
let shared: SyncEngine | null = null

export function useSync({ store, applyPatch, onToast }: Options): SyncApi {
  const storeRef = useRef(store)
  storeRef.current = store
  const patchRef = useRef(applyPatch)
  patchRef.current = applyPatch
  const toastRef = useRef(onToast)
  toastRef.current = onToast

  const [info, setInfo] = useState<SyncInfo>({
    status: 'off',
    lastSyncedAt: null,
    roomHash: null,
    error: null,
  })
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const engineRef = useRef<SyncEngine | null>(null)
  if (!engineRef.current) {
    if (!shared) {
      shared = new SyncEngine(SYNC_CONFIG, {
        readStore: () => storeRef.current,
        applyPatch: (patch) => patchRef.current(patch),
        onInfo: (next) => setInfo(next),
      })
    }
    engineRef.current = shared
  }
  const engine = engineRef.current

  /* 이 기기에서 글이 바뀔 때마다 알린다 */
  useEffect(() => {
    engine.observe(store)
  }, [engine, store])

  useEffect(() => {
    let alive = true
    if (!engine.available) return
    void engine.resume().then(() => {
      if (alive) setPassphrase(engine.passphrase)
    })
    return () => {
      alive = false
    }
  }, [engine])

  const connect = useCallback(
    async (raw: string) => {
      if (!engine.available) return 'sync-not-configured'
      const clean = raw.trim()
      if (!passphraseReady(clean)) return 'sync-passphrase-short'
      setBusy(true)
      try {
        await engine.connect(clean)
        setPassphrase(engine.passphrase)
        toastRef.current('sync.connected')
        return null
      } catch (error) {
        return error instanceof Error ? error.message : 'sync-failed'
      } finally {
        setBusy(false)
      }
    },
    [engine],
  )

  const acceptInvite = useCallback(
    async (code: string) => {
      const pass = parseInvite(code)
      if (!pass) return 'sync-invite-invalid'
      return connect(pass)
    },
    [connect],
  )

  const disconnect = useCallback(() => {
    engine.disconnect()
    setPassphrase(null)
    toastRef.current('sync.disconnected')
  }, [engine])

  const setPaused = useCallback(
    (paused: boolean) => {
      engine.setPaused(paused)
    },
    [engine],
  )

  const copyInviteLink = useCallback(async () => {
    const pass = engine.passphrase
    if (!pass) return false
    const link = buildInviteLink(pass)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const area = document.createElement('textarea')
      area.value = link
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    toastRef.current('sync.linkCopied')
    return true
  }, [engine])

  return {
    available: engine.available,
    info,
    passphrase,
    busy,
    connect,
    acceptInvite,
    disconnect,
    setPaused,
    copyInviteLink,
  }
}
