import type { DayRecord, Store } from '../types'
import { syncConfigured, type SyncConfig } from './config'
import { decryptJson, deriveRoom, encryptJson, passphraseReady, type RoomKey } from './crypto'
import {
  FIELDS,
  buildDayPayload,
  dayHasContent,
  emptyDayTimes,
  mergeDay,
  mergeNames,
  sanitizeDayPayload,
  sanitizeNamesPayload,
  type SyncDayPayload,
  type SyncNamesPayload,
} from './merge'
import { openRemote, type RemoteClient, type SyncRow } from './remote'
import { loadSync, saveSync, type SyncSaved } from './state'

/**
 * 두 폰을 잇는 부분. 하는 일은 셋뿐이다.
 *  1. 이 기기에서 글이 바뀌면 그 항목의 시각을 새로 찍고 800ms 뒤 암호화해 올린다.
 *  2. 상대가 올린 줄이 오면(실시간) 풀어서 이 기기 기록에 합친다.
 *  3. 올리기 전에 그 날 줄을 한 번 더 받아 합쳐, 상대가 더 나중에 쓴 글을 되돌리지 않는다.
 * 샘플(데모) 모드에서는 어떤 경우에도 올리지 않는다.
 */

export type SyncStatus = 'off' | 'connecting' | 'live' | 'offline' | 'error'

export interface SyncInfo {
  status: SyncStatus
  lastSyncedAt: number | null
  roomHash: string | null
  error: string | null
}

/** 화면 쪽에 알려 줄 바뀐 내용만 담는다(사용자가 그사이 친 글을 덮지 않도록) */
export interface StorePatch {
  records?: Record<string, DayRecord>
  names?: [string, string]
}

export interface SyncHandlers {
  readStore: () => Store
  applyPatch: (patch: StorePatch) => void
  onInfo: (info: SyncInfo) => void
}

const SETTINGS_DAY = 'settings'
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const PUSH_DELAY = 800
const PULL_EVERY = 60_000
const RETRY_STEPS = [4_000, 12_000, 40_000]

interface ParsedRow {
  day: string
  dayPayload?: SyncDayPayload
  namesPayload?: SyncNamesPayload
}

export function applyPatchToStore(store: Store, patch: StorePatch): Store {
  return {
    ...store,
    records: patch.records ? { ...store.records, ...patch.records } : store.records,
    settings: patch.names ? { ...store.settings, names: patch.names } : store.settings,
  }
}

export class SyncEngine {
  private config: SyncConfig
  private handlers: SyncHandlers
  private key: RoomKey | null = null
  private saved: SyncSaved | null = null
  private remote: RemoteClient | null = null
  private baseline: Store | null = null
  private dirty = new Set<string>()
  private namesDirty = false
  private pushTimer: number | null = null
  private retryTimer: number | null = null
  private retryIndex = 0
  private pullTimer: number | null = null
  private unsubscribe: (() => void) | null = null
  private lifecycle = false
  private status: SyncStatus = 'off'
  private paused = false
  private lastSyncedAt: number | null = null
  private error: string | null = null
  private connecting: Promise<void> | null = null
  private started = false

  constructor(config: SyncConfig, handlers: SyncHandlers) {
    this.config = config
    this.handlers = handlers
  }

  info(): SyncInfo {
    return {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      roomHash: this.saved?.roomHash ?? null,
      error: this.error,
    }
  }

  get passphrase(): string | null {
    return this.saved?.passphrase ?? null
  }

  get available(): boolean {
    return syncConfigured(this.config)
  }

  get roomHash(): string | null {
    return this.saved?.roomHash ?? null
  }

  /* ───────────────────────── 켜고 끄기 ───────────────────────── */

  /** 앱을 열 때 저장된 부부 암호가 있으면 조용히 다시 잇는다 */
  async resume(): Promise<void> {
    if (this.started || !this.available) return
    this.started = true
    this.attachLifecycle()
    const saved = loadSync()
    if (!saved) {
      this.setStatus('off')
      return
    }
    /* 끊어 둔 기기: 암호는 지웠지만 항목별 시각은 이어 쓴다 */
    this.saved = saved
    if (!saved.passphrase) {
      this.setStatus('off')
      return
    }
    try {
      await this.connect(saved.passphrase)
    } catch (error) {
      this.fail(error)
    }
  }

  async connect(passphrase: string): Promise<void> {
    if (!this.available) throw new Error('sync-not-configured')
    const clean = passphrase.trim()
    if (!passphraseReady(clean)) throw new Error('sync-passphrase-short')
    if (this.connecting) {
      try {
        await this.connecting
      } catch {
        /* 앞선 시도가 실패해도 새 암호로 다시 시도한다 */
      }
    }
    this.connecting = this.connectInner(clean)
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async connectInner(clean: string): Promise<void> {
    this.stopWork()
    this.error = null
    this.setStatus('connecting')
    this.baseline = this.handlers.readStore()

    const room = await deriveRoom(clean)
    const previous = loadSync()
    const sameRoom = previous?.roomHash === room.roomHash
    this.key = room
    this.saved = {
      version: 1,
      passphrase: clean,
      roomHash: room.roomHash,
      times: sameRoom ? { ...(previous?.times ?? {}) } : {},
      nameTimes: sameRoom ? [previous?.nameTimes[0] ?? 0, previous?.nameTimes[1] ?? 0] : [0, 0],
    }
    saveSync(this.saved)

    try {
      this.remote = await openRemote(this.config)
      const rows = await this.remote.pull(room.roomHash)
      await this.applyRows(rows)
      this.prepareFirstUpload(rows)
      this.attachRealtime()
      this.startTimers()
      this.setStatus('live')
      this.schedulePush(0)
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  disconnect(): void {
    this.stopWork()
    /* 암호는 지우고, 이 방의 항목별 시각만 남겨 다시 이을 때 이어 쓴다 */
    if (this.saved) {
      this.saved = { ...this.saved, passphrase: '' }
      saveSync(this.saved)
    }
    this.key = null
    this.baseline = null
    this.error = null
    this.lastSyncedAt = null
    this.setStatus('off')
  }

  /** 타이머와 실시간 구독만 멈춘다(저장된 암호는 남긴다) */
  private stopWork(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.remote?.disconnect()
    this.remote = null
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer)
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    if (this.pullTimer !== null) window.clearInterval(this.pullTimer)
    this.pushTimer = null
    this.retryTimer = null
    this.pullTimer = null
    this.dirty.clear()
    this.namesDirty = false
  }

  /* ───────────────────────── 이 기기의 변화 ───────────────────────── */

  observe(store: Store): void {
    const before = this.baseline
    this.baseline = store
    if (!this.saved || this.paused) return
    const now = Date.now()
    let touched = false
    const days = new Set([...Object.keys(before?.records ?? {}), ...Object.keys(store.records)])
    for (const day of days) {
      if (!DAY_RE.test(day)) continue
      const prev = before?.records[day]
      const next = store.records[day]
      if (sameRecord(prev, next)) continue
      const times = this.saved.times[day] ?? emptyDayTimes()
      let dayTouched = false
      for (const who of ['a', 'b'] as const) {
        for (const field of FIELDS) {
          if ((prev?.[who][field] ?? '') === (next?.[who][field] ?? '')) continue
          times[who][field] = bump(times[who][field], now)
          dayTouched = true
        }
      }
      if ((prev?.index ?? null) !== (next?.index ?? null)) {
        times.index = bump(times.index, now)
        dayTouched = true
      }
      if (!sameCustom(prev?.custom, next?.custom)) {
        times.custom = bump(times.custom, now)
        dayTouched = true
      }
      if (dayTouched) {
        this.saved.times[day] = times
        this.dirty.add(day)
        touched = true
      }
    }

    const prevNames = before?.settings.names
    const nextNames = store.settings.names
    if (prevNames && (prevNames[0] !== nextNames[0] || prevNames[1] !== nextNames[1])) {
      const nameTimes: [number, number] = [this.saved.nameTimes[0], this.saved.nameTimes[1]]
      for (const index of [0, 1] as const) {
        if ((prevNames[index] ?? '') !== (nextNames[index] ?? '')) {
          nameTimes[index] = bump(nameTimes[index], now)
        }
      }
      this.saved.nameTimes = nameTimes
      this.namesDirty = true
      touched = true
    }

    if (touched) {
      this.persist()
      this.schedulePush()
    }
  }

  /** 샘플(데모) 모드 동안에는 절대 올리지 않는다 */
  setPaused(paused: boolean): void {
    const was = this.paused
    this.paused = paused
    if (paused) {
      if (this.pushTimer !== null) window.clearTimeout(this.pushTimer)
      this.pushTimer = null
    } else if (was) {
      this.baseline = this.handlers.readStore()
      this.schedulePush()
    }
  }

  /* ───────────────────────── 올리기 ───────────────────────── */

  private schedulePush(delay = PUSH_DELAY): void {
    if (!this.saved || !this.key || this.paused) return
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer)
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null
      void this.flush()
    }, delay)
  }

  private async flush(): Promise<void> {
    if (!this.remote || !this.key || !this.saved || this.paused) return
    const days = [...this.dirty]
    const sendNames = this.namesDirty
    if (!days.length && !sendNames) return
    this.dirty.clear()
    this.namesDirty = false

    try {
      /* 상대가 방금 쓴 글이 있으면 먼저 합쳐 두고 올린다 */
      if (days.length) {
        const fresh = await this.remote.pull(this.saved.roomHash, days)
        await this.applyRows(fresh, { quiet: true })
      }
      const store = this.handlers.readStore()
      const roomHash = this.saved.roomHash
      for (const day of days) {
        const record = store.records[day]
        if (!dayHasContent(record)) {
          this.dirty.delete(day)
          continue
        }
        const payload = buildDayPayload(record, this.saved.times[day])
        const sealed = await encryptJson(this.key.key, roomHash, day, payload)
        await this.remote.push({ room_hash: roomHash, day, payload: sealed })
        this.dirty.delete(day)
      }
      if (sendNames) {
        const payload: SyncNamesPayload = {
          v: 1,
          names: [
            { v: store.settings.names[0], t: this.saved.nameTimes[0] },
            { v: store.settings.names[1], t: this.saved.nameTimes[1] },
          ],
        }
        const sealed = await encryptJson(this.key.key, roomHash, SETTINGS_DAY, payload)
        await this.remote.push({ room_hash: roomHash, day: SETTINGS_DAY, payload: sealed })
      }
      this.persist()
      this.retryIndex = 0
      this.lastSyncedAt = Date.now()
      if (this.status !== 'live') this.setStatus('live')
      else this.emit()
    } catch (error) {
      for (const day of days) this.dirty.add(day)
      if (sendNames) this.namesDirty = true
      this.error = error instanceof Error ? error.message : String(error)
      this.setStatus('offline')
      this.scheduleRetry()
    }
    if (this.dirty.size || this.namesDirty) this.schedulePush()
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    const delay = RETRY_STEPS[Math.min(this.retryIndex, RETRY_STEPS.length - 1)]
    this.retryIndex += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      void this.flush()
    }, delay)
  }

  /* ───────────────────────── 받기 ───────────────────────── */

  private async applyRows(rows: SyncRow[], options: { quiet?: boolean } = {}): Promise<boolean> {
    if (!this.key || !this.saved) return false
    const roomHash = this.saved.roomHash
    const parsed: ParsedRow[] = []
    for (const row of rows) {
      if (row.day === SETTINGS_DAY) {
        const value = await decryptJson<unknown>(this.key.key, roomHash, SETTINGS_DAY, row.payload)
        const namesPayload = sanitizeNamesPayload(value)
        if (namesPayload) parsed.push({ day: SETTINGS_DAY, namesPayload })
        continue
      }
      if (!DAY_RE.test(row.day)) continue
      const value = await decryptJson<unknown>(this.key.key, roomHash, row.day, row.payload)
      const dayPayload = sanitizeDayPayload(value)
      if (dayPayload) parsed.push({ day: row.day, dayPayload })
    }
    if (!parsed.length) return false

    const store = this.handlers.readStore()
    const records: Record<string, DayRecord> = {}
    let names: [string, string] = [store.settings.names[0], store.settings.names[1]]
    let namesChanged = false
    let changed = false
    let timesChanged = false

    for (const row of parsed) {
      if (row.namesPayload) {
        const merged = mergeNames(row.namesPayload, names, this.saved.nameTimes)
        this.saved.nameTimes = merged.times
        timesChanged = true
        if (merged.changed) {
          names = merged.names
          namesChanged = true
        }
        if (merged.push) this.namesDirty = true
        continue
      }
      if (!row.dayPayload) continue
      const result = mergeDay(records[row.day] ?? store.records[row.day], this.saved.times[row.day], row.dayPayload)
      this.saved.times[row.day] = result.times
      timesChanged = true
      if (result.changed) {
        records[row.day] = result.record
        changed = true
      }
      if (result.push) this.dirty.add(row.day)
    }

    if (changed || namesChanged) {
      const patch: StorePatch = {
        ...(changed ? { records } : {}),
        ...(namesChanged ? { names } : {}),
      }
      this.handlers.applyPatch(patch)
      this.baseline = applyPatchToStore(store, patch)
    }
    if (timesChanged) this.persist()
    this.lastSyncedAt = Date.now()
    if (!options.quiet) {
      if (this.dirty.size || this.namesDirty) this.schedulePush()
      this.emit()
    }
    return changed || namesChanged
  }

  private async pullNow(): Promise<void> {
    if (!this.remote || !this.saved || this.paused) return
    try {
      const rows = await this.remote.pull(this.saved.roomHash)
      await this.applyRows(rows)
      if (this.status === 'offline') this.setStatus('live')
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.setStatus('offline')
    }
  }

  /** 처음 연결할 때 이 기기에만 있던 기록에 시각을 붙여 올릴 준비를 한다 */
  private prepareFirstUpload(rows: SyncRow[]): void {
    if (!this.saved) return
    const store = this.handlers.readStore()
    const remoteDays = new Set(rows.map((row) => row.day))
    const now = Date.now()
    let changed = false
    for (const [day, record] of Object.entries(store.records)) {
      if (!DAY_RE.test(day) || !dayHasContent(record)) continue
      const times = this.saved.times[day] ?? emptyDayTimes()
      let touched = false
      for (const who of ['a', 'b'] as const) {
        for (const field of FIELDS) {
          if (record[who][field].trim() && times[who][field] === 0) {
            times[who][field] = now
            touched = true
          }
        }
      }
      if (typeof record.index === 'number' && times.index === 0) {
        times.index = now
        touched = true
      }
      if (record.custom && times.custom === 0) {
        times.custom = now
        touched = true
      }
      if (touched) this.saved.times[day] = times
      if (touched || !remoteDays.has(day)) {
        this.dirty.add(day)
        changed = true
      }
    }
    if (changed) this.persist()
  }

  private attachRealtime(): void {
    if (!this.remote || !this.saved) return
    const roomHash = this.saved.roomHash
    this.unsubscribe = this.remote.subscribe(
      roomHash,
      (row) => {
        void this.applyRows([row])
      },
      (live) => {
        if (live) {
          if (this.status === 'offline') this.setStatus('live')
        } else if (this.status === 'live') {
          this.setStatus('offline')
        }
      },
    )
  }

  private startTimers(): void {
    if (this.pullTimer !== null) window.clearInterval(this.pullTimer)
    this.pullTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void this.pullNow()
    }, PULL_EVERY)
  }

  private attachLifecycle(): void {
    if (this.lifecycle || typeof window === 'undefined') return
    this.lifecycle = true
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.pullNow()
    }
    const onOnline = () => {
      void this.pullNow()
      this.schedulePush(0)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onVisible)
  }

  /* ───────────────────────── 상태 ───────────────────────── */

  private persist(): void {
    if (this.saved) saveSync(this.saved)
  }

  private setStatus(status: SyncStatus): void {
    this.status = status
    this.emit()
  }

  private emit(): void {
    this.handlers.onInfo(this.info())
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error)
    this.setStatus('error')
  }
}

function bump(previous: number, now: number): number {
  return Math.max(now, previous + 1)
}

function sameRecord(a: DayRecord | undefined, b: DayRecord | undefined): boolean {
  if (!a || !b) return !a && !b
  for (const who of ['a', 'b'] as const) {
    for (const field of FIELDS) {
      if (a[who][field] !== b[who][field]) return false
    }
  }
  if ((a.index ?? null) !== (b.index ?? null)) return false
  return sameCustom(a.custom, b.custom)
}

function sameCustom(a: DayRecord['custom'], b: DayRecord['custom']): boolean {
  if (!a || !b) return !a && !b
  return a.ko === b.ko && a.en === b.en && a.refKo === b.refKo && a.refEn === b.refEn
}
