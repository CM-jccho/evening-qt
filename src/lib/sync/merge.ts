import type { CustomPassage, DayRecord, Reflection } from '../types'
import { emptyRecord } from '../types'

/**
 * 두 폰이 같은 날을 같이 적을 때 서로의 칸을 덮어쓰지 않도록, 글은 칸(사람)과
 * 항목 단위로 나누고 항목마다 마지막으로 고친 시각(t)을 함께 둔다.
 * 합치는 규칙은 하나다: 시각이 더 나중인 글이 남는다. 시각이 같으면 이 기기 글이
 * 남고, 그 글을 한 번 더 올려 두 폰이 같은 값으로 모이게 한다.
 */

export type FieldName = keyof Reflection
export const FIELDS: FieldName[] = ['gratitude', 'meditation', 'prayer']

export interface Stamped<T> {
  v: T
  t: number
}

export interface FieldTimes {
  gratitude: number
  meditation: number
  prayer: number
}

export interface DayTimes {
  a: FieldTimes
  b: FieldTimes
  index: number
  custom: number
}

export interface SyncDayPayload {
  v: 1
  a: Partial<Record<FieldName, Stamped<string>>>
  b: Partial<Record<FieldName, Stamped<string>>>
  index?: Stamped<number | null>
  custom?: Stamped<CustomPassage | null>
}

export interface SyncNamesPayload {
  v: 1
  names: [Stamped<string>, Stamped<string>]
}

export function emptyFieldTimes(): FieldTimes {
  return { gratitude: 0, meditation: 0, prayer: 0 }
}

export function emptyDayTimes(): DayTimes {
  return { a: emptyFieldTimes(), b: emptyFieldTimes(), index: 0, custom: 0 }
}

function cleanTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function stampText(value: unknown): Stamped<string> | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Partial<Stamped<unknown>>
  if (typeof s.v !== 'string') return null
  return { v: s.v.slice(0, 4000), t: cleanTime(s.t) }
}

function cleanCustom(value: unknown): CustomPassage | null {
  if (!value || typeof value !== 'object') return null
  const c = value as Partial<CustomPassage>
  if (typeof c.ko !== 'string' || typeof c.en !== 'string') return null
  if (!c.ko.trim() && !c.en.trim()) return null
  return {
    refKo: typeof c.refKo === 'string' ? c.refKo.slice(0, 80) : '',
    refEn: typeof c.refEn === 'string' ? c.refEn.slice(0, 80) : '',
    ko: c.ko.slice(0, 1200),
    en: c.en.slice(0, 1600),
  }
}

/** 서버에서 온 값은 믿지 않고 필요한 모양만 남긴다 */
export function sanitizeDayPayload(raw: unknown): SyncDayPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<SyncDayPayload>
  if (p.v !== 1) return null
  const out: SyncDayPayload = { v: 1, a: {}, b: {} }
  for (const who of ['a', 'b'] as const) {
    const side = p[who] as Partial<Record<FieldName, unknown>> | undefined
    if (!side || typeof side !== 'object') continue
    for (const field of FIELDS) {
      const stamp = stampText(side[field])
      if (stamp) out[who][field] = stamp
    }
  }
  if (p.index && typeof p.index === 'object') {
    const s = p.index as Partial<Stamped<unknown>>
    const t = cleanTime(s.t)
    if (t) out.index = { v: typeof s.v === 'number' && Number.isFinite(s.v) ? Math.floor(s.v) % 31 : null, t }
  }
  if (p.custom && typeof p.custom === 'object') {
    const s = p.custom as Partial<Stamped<unknown>>
    const t = cleanTime(s.t)
    if (t) {
      const custom = s.v === null ? null : cleanCustom(s.v)
      out.custom = { v: custom, t }
    }
  }
  return out
}

export function sanitizeNamesPayload(raw: unknown): SyncNamesPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<SyncNamesPayload>
  if (p.v !== 1 || !Array.isArray(p.names)) return null
  const first = stampText(p.names[0])
  const second = stampText(p.names[1])
  if (!first || !second) return null
  return { v: 1, names: [{ v: first.v.slice(0, 24), t: first.t }, { v: second.v.slice(0, 24), t: second.t }] }
}

export interface TextChoice {
  value: string
  t: number
  fromRemote: boolean
  push: boolean
}

type TextMode = 'field' | 'label'

/**
 * 처음 잇는 폰은 자기 기록에 시각이 없다. 그때 상대 줄이 비어 있으면 내 글을 지키고,
 * 둘 다 적혀 있으면 한쪽을 지우지 않고 두 글을 이어 붙인다(둘 중 하나가 다른 하나를
 * 이미 담고 있으면 담긴 쪽을 쓴다). 그 뒤로는 시각만으로 판단한다.
 */
function chooseTextFirst(remote: Stamped<string> | undefined, localValue: string, rt: number): TextChoice | null {
  const rv = typeof remote?.v === 'string' ? remote.v : ''
  const mine = localValue.trim()
  if (!mine) return { value: rv, t: rt, fromRemote: true, push: false }
  if (!rv.trim()) return { value: localValue, t: rt, fromRemote: false, push: true }
  if (mine === rv.trim()) return { value: rv, t: rt, fromRemote: false, push: false }
  if (rv.includes(mine)) return { value: rv, t: rt, fromRemote: true, push: false }
  if (mine.includes(rv.trim())) return { value: localValue, t: rt + 1, fromRemote: false, push: true }
  return { value: `${mine}\n\n${rv.trim()}`, t: rt + 1, fromRemote: true, push: true }
}

function chooseText(
  remote: Stamped<string> | undefined,
  localValue: string,
  localT: number,
  mode: TextMode = 'field',
): TextChoice {
  const rt = cleanTime(remote?.t)
  const rv = typeof remote?.v === 'string' ? remote.v : ''
  if (localT === 0 && rt > 0 && mode === 'field') {
    const first = chooseTextFirst(remote, localValue, rt)
    if (first) return first
  }
  if (rt > localT) return { value: rv, t: rt, fromRemote: true, push: false }
  if (rt < localT) return { value: localValue, t: localT, fromRemote: false, push: localT > 0 }
  if (rv === localValue) return { value: localValue, t: localT, fromRemote: false, push: false }
  return { value: localValue, t: localT, fromRemote: false, push: true }
}

interface OptionalChoice<T> {
  value: T | undefined
  t: number
  changed: boolean
  push: boolean
}

function chooseOptional<T>(
  remote: Stamped<T | null> | undefined,
  localValue: T | undefined,
  localT: number,
  same: (a: T | undefined, b: T | undefined) => boolean,
): OptionalChoice<T> {
  const rt = cleanTime(remote?.t)
  const hasRemote = Boolean(remote && rt > 0)
  const remoteValue = hasRemote ? ((remote?.v ?? null) as T | null) : undefined
  const normalizedRemote: T | undefined = remoteValue === null ? undefined : remoteValue
  if (hasRemote && rt > localT) {
    return { value: normalizedRemote, t: rt, changed: !same(localValue, normalizedRemote), push: false }
  }
  if (hasRemote && rt < localT) {
    return { value: localValue, t: localT, changed: false, push: true }
  }
  if (hasRemote && rt === localT) {
    if (same(localValue, normalizedRemote)) return { value: localValue, t: localT, changed: false, push: false }
    return { value: localValue, t: localT, changed: false, push: true }
  }
  return { value: localValue, t: localT, changed: false, push: false }
}

function sameCustom(a: CustomPassage | undefined, b: CustomPassage | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.ko === b.ko && a.en === b.en && a.refKo === b.refKo && a.refEn === b.refEn
}

export interface DayMergeResult {
  record: DayRecord
  times: DayTimes
  changed: boolean
  /** 이 기기에 더 새로운 글이 있어 한 번 더 올려야 한다 */
  push: boolean
}

export function mergeDay(local: DayRecord | undefined, times: DayTimes | undefined, remote: SyncDayPayload): DayMergeResult {
  const record = local ? { ...local, a: { ...local.a }, b: { ...local.b } } : emptyRecord()
  const nextTimes = times
    ? { a: { ...times.a }, b: { ...times.b }, index: times.index, custom: times.custom }
    : emptyDayTimes()
  let changed = false
  let push = false

  for (const who of ['a', 'b'] as const) {
    for (const field of FIELDS) {
      const choice = chooseText(remote[who][field], record[who][field], nextTimes[who][field])
      if (choice.fromRemote && choice.value !== record[who][field]) {
        record[who] = { ...record[who], [field]: choice.value }
        changed = true
      }
      nextTimes[who][field] = choice.t
      if (choice.push) push = true
    }
  }

  const indexChoice = chooseOptional<number>(
    remote.index,
    record.index,
    nextTimes.index,
    (a, b) => (a ?? null) === (b ?? null),
  )
  if (indexChoice.changed) {
    if (indexChoice.value === undefined) delete record.index
    else record.index = indexChoice.value
    changed = true
  }
  nextTimes.index = indexChoice.t
  if (indexChoice.push) push = true

  const customChoice = chooseOptional<CustomPassage>(
    remote.custom,
    record.custom ?? undefined,
    nextTimes.custom,
    sameCustom,
  )
  if (customChoice.changed) {
    record.custom = customChoice.value ?? null
    changed = true
  }
  nextTimes.custom = customChoice.t
  if (customChoice.push) push = true

  return { record, times: nextTimes, changed, push }
}

export function buildDayPayload(record: DayRecord | undefined, times: DayTimes | undefined): SyncDayPayload {
  const t = times ?? emptyDayTimes()
  const payload: SyncDayPayload = { v: 1, a: {}, b: {} }
  for (const who of ['a', 'b'] as const) {
    for (const field of FIELDS) {
      const value = record?.[who][field] ?? ''
      const stamp = t[who][field]
      if (!stamp && !value.trim()) continue
      payload[who][field] = { v: value, t: stamp }
    }
  }
  if (t.index > 0 || typeof record?.index === 'number') {
    payload.index = { v: typeof record?.index === 'number' ? record.index : null, t: t.index }
  }
  if (t.custom > 0 || record?.custom) {
    payload.custom = { v: record?.custom ?? null, t: t.custom }
  }
  return payload
}

export function emptyPayload(): SyncDayPayload {
  return { v: 1, a: {}, b: {} }
}

export function dayHasContent(record: DayRecord | undefined): boolean {
  if (!record) return false
  return FIELDS.some((field) => record.a[field].trim() || record.b[field].trim()) || Boolean(record.custom)
}

export interface NamesMergeResult {
  names: [string, string]
  times: [number, number]
  changed: boolean
  push: boolean
}

export function mergeNames(
  remote: SyncNamesPayload | undefined,
  local: [string, string],
  localTimes: [number, number],
): NamesMergeResult {
  const names: [string, string] = [local[0], local[1]]
  const times: [number, number] = [localTimes[0] ?? 0, localTimes[1] ?? 0]
  let changed = false
  let push = false
  for (const index of [0, 1] as const) {
    const choice = chooseText(remote?.names[index], local[index], times[index])
    if (choice.fromRemote && choice.value !== names[index]) {
      names[index] = choice.value
      changed = true
    }
    times[index] = choice.t
    if (choice.push) push = true
  }
  return { names, times, changed, push }
}
