import type { DayRecord, PersonKey, Reflection, Store } from './types'
import { EMPTY_REFLECTION, emptyRecord } from './types'

export const STORAGE_KEY = 'evening_qt_v1'

export const defaultStore = (): Store => ({
  version: 1,
  settings: {
    names: ['', ''],
    lang: 'ko',
    theme: 'lamp',
    chime: false,
    demoSeen: false,
  },
  records: {},
})

function cleanReflection(value: unknown): Reflection {
  const v = (value ?? {}) as Partial<Reflection>
  return {
    gratitude: typeof v.gratitude === 'string' ? v.gratitude.slice(0, 2000) : '',
    meditation: typeof v.meditation === 'string' ? v.meditation.slice(0, 4000) : '',
    prayer: typeof v.prayer === 'string' ? v.prayer.slice(0, 3000) : '',
  }
}

export function cleanRecord(value: unknown): DayRecord {
  const v = (value ?? {}) as Partial<DayRecord>
  const rec: DayRecord = {
    a: cleanReflection(v.a),
    b: cleanReflection(v.b),
  }
  if (typeof v.index === 'number' && Number.isFinite(v.index)) rec.index = Math.abs(Math.floor(v.index)) % 31
  const c = v.custom as Record<string, unknown> | null | undefined
  if (c && typeof c.ko === 'string' && typeof c.en === 'string' && (c.ko.trim() || c.en.trim())) {
    rec.custom = {
      refKo: typeof c.refKo === 'string' ? c.refKo.slice(0, 80) : '',
      refEn: typeof c.refEn === 'string' ? c.refEn.slice(0, 80) : '',
      ko: c.ko.slice(0, 1200),
      en: c.en.slice(0, 1600),
    }
  }
  return rec
}

export function loadStore(): Store {
  const base = defaultStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Store>
    const store: Store = {
      version: 1,
      settings: {
        names: [
          typeof parsed.settings?.names?.[0] === 'string' ? parsed.settings.names[0].slice(0, 24) : '',
          typeof parsed.settings?.names?.[1] === 'string' ? parsed.settings.names[1].slice(0, 24) : '',
        ],
        lang: parsed.settings?.lang === 'en' ? 'en' : 'ko',
        theme: parsed.settings?.theme === 'paper' ? 'paper' : 'lamp',
        chime: Boolean(parsed.settings?.chime),
        demoSeen: Boolean(parsed.settings?.demoSeen),
      },
      records: {},
    }
    for (const [key, value] of Object.entries(parsed.records ?? {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) store.records[key] = cleanRecord(value)
    }
    return store
  } catch {
    return base
  }
}

export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export function ensureRecord(store: Store, key: string): DayRecord {
  if (!store.records[key]) store.records[key] = emptyRecord()
  return store.records[key]
}

/** A stable, human-meaningful backup file, readable by the same app. */
export function exportPayload(store: Store): string {
  return JSON.stringify(
    {
      app: 'evening-qt',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: store.settings,
      records: store.records,
    },
    null,
    2,
  )
}

export function importPayload(raw: string): Store | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Store> & { app?: string }
    if (parsed.app && parsed.app !== 'evening-qt') return null
    if (!parsed.records || typeof parsed.records !== 'object') return null
    const store = defaultStore()
    if (parsed.settings) {
      store.settings = {
        names: [
          typeof parsed.settings.names?.[0] === 'string' ? parsed.settings.names[0].slice(0, 24) : '',
          typeof parsed.settings.names?.[1] === 'string' ? parsed.settings.names[1].slice(0, 24) : '',
        ],
        lang: parsed.settings.lang === 'en' ? 'en' : 'ko',
        theme: parsed.settings.theme === 'paper' ? 'paper' : 'lamp',
        chime: Boolean(parsed.settings.chime),
        demoSeen: Boolean(parsed.settings.demoSeen),
      }
    }
    for (const [key, value] of Object.entries(parsed.records)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) store.records[key] = cleanRecord(value)
    }
    return store
  } catch {
    return null
  }
}

export function personSlot(rec: DayRecord | undefined, who: PersonKey): Reflection {
  if (!rec) return { ...EMPTY_REFLECTION }
  return { ...rec[who] }
}
