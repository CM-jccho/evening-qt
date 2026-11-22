import type { DayRecord, PersonKey, Reflection } from './types'
import { EMPTY_REFLECTION } from './types'

export const SHARE_PREFIX = 'SELAH1-'

export interface SharePayload {
  v: 1
  d: string
  n: string
  s: 0 | 1
  r: Reflection
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(code: string): string {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function buildShareCode(rec: DayRecord, who: PersonKey, name: string, date: string): string {
  const payload: SharePayload = {
    v: 1,
    d: date,
    n: name.slice(0, 24),
    s: who === 'a' ? 0 : 1,
    r: {
      gratitude: rec[who].gratitude.slice(0, 2000),
      meditation: rec[who].meditation.slice(0, 4000),
      prayer: rec[who].prayer.slice(0, 3000),
    },
  }
  return SHARE_PREFIX + toBase64Url(JSON.stringify(payload))
}

export function buildShareLink(code: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#selah=${code}`
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function parseShareInput(input: string): SharePayload | null {
  let text = input.trim()
  if (!text) return null
  const hashAt = text.indexOf('#selah=')
  if (hashAt >= 0) text = text.slice(hashAt + 7)
  text = text.split(/\s+/)[0]
  if (text.startsWith(SHARE_PREFIX)) text = text.slice(SHARE_PREFIX.length)
  if (!/^[A-Za-z0-9_-]{12,}$/.test(text)) return null

  try {
    const parsed = JSON.parse(fromBase64Url(text)) as Partial<SharePayload>
    if (parsed.v !== 1) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.d ?? '')) return null
    if (parsed.s !== 0 && parsed.s !== 1) return null
    const r = parsed.r ?? ({} as Partial<Reflection>)
    const reflection: Reflection = {
      gratitude: cleanText(r.gratitude, 2000),
      meditation: cleanText(r.meditation, 4000),
      prayer: cleanText(r.prayer, 3000),
    }
    if (!reflection.gratitude.trim() && !reflection.meditation.trim() && !reflection.prayer.trim()) return null
    return {
      v: 1,
      d: parsed.d as string,
      n: cleanText(parsed.n, 24),
      s: parsed.s as 0 | 1,
      r: reflection,
    }
  } catch {
    return null
  }
}

export function shareFilledCount(r: Reflection): number {
  return [r.gratitude, r.meditation, r.prayer].filter((v) => v.trim()).length
}

export const EMPTY_SHARE_REFLECTION = EMPTY_REFLECTION
