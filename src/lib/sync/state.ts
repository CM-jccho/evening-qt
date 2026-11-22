import type { DayTimes } from './merge'

export const SYNC_KEY = 'evening_qt_sync_v1'

export interface SyncSaved {
  version: 1
  passphrase: string
  roomHash: string
  /** 날짜마다 항목별로 마지막으로 고친 시각 */
  times: Record<string, DayTimes>
  nameTimes: [number, number]
}

function cleanFieldTimes(value: unknown): DayTimes | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const side = (raw: unknown) => {
    const s = (raw ?? {}) as Record<string, unknown>
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)
    return { gratitude: num(s.gratitude), meditation: num(s.meditation), prayer: num(s.prayer) }
  }
  return {
    a: side(v.a),
    b: side(v.b),
    index: typeof v.index === 'number' && v.index > 0 ? Math.floor(v.index) : 0,
    custom: typeof v.custom === 'number' && v.custom > 0 ? Math.floor(v.custom) : 0,
  }
}

export function loadSync(): SyncSaved | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncSaved>
    if (parsed.version !== 1) return null
    /* 끊어 둔 기록은 암호 없이 시간만 남긴다(다시 이을 때 시각을 이어 쓰려고) */
    if (typeof parsed.passphrase !== 'string') return null
    if (typeof parsed.roomHash !== 'string' || parsed.roomHash.length < 20) return null
    const times: Record<string, DayTimes> = {}
    for (const [day, value] of Object.entries(parsed.times ?? {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const clean = cleanFieldTimes(value)
      if (clean) times[day] = clean
    }
    const names = Array.isArray(parsed.nameTimes) ? parsed.nameTimes : [0, 0]
    return {
      version: 1,
      passphrase: parsed.passphrase.trim(),
      roomHash: parsed.roomHash,
      times,
      nameTimes: [
        typeof names[0] === 'number' && names[0] > 0 ? Math.floor(names[0]) : 0,
        typeof names[1] === 'number' && names[1] > 0 ? Math.floor(names[1]) : 0,
      ],
    }
  } catch {
    return null
  }
}

export function saveSync(state: SyncSaved | null): void {
  try {
    if (!state) {
      localStorage.removeItem(SYNC_KEY)
      return
    }
    localStorage.setItem(SYNC_KEY, JSON.stringify(state))
  } catch {
    /* 사생활 모드처럼 저장이 막힌 곳에서는 동기화만 쉰다 */
  }
}
