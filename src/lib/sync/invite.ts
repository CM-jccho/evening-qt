import { fromBase64Url, toBase64Url } from './crypto'

/**
 * 연결 링크: 지금 주소 뒤에 `#sync=qts1.<부부 암호>`를 붙인다.
 * # 뒤의 값은 서버로 보내지 않고, 링크를 연 폰이 그 자리에서 암호를 읽어 방에 들어간다.
 * 링크를 아는 사람은 두 사람의 기록을 열 수 있으므로 두 사람만 있는 대화에 보낸다.
 */
const PREFIX = 'qts1.'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function buildInviteLink(passphrase: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#sync=${PREFIX}${toBase64Url(encoder.encode(passphrase.trim()))}`
}

export function parseInvite(hash: string): string | null {
  const at = hash.indexOf('#sync=')
  if (at < 0) return null
  let value = hash.slice(at + 6).trim()
  value = value.split('&')[0]
  if (!value.startsWith(PREFIX)) return null
  value = value.slice(PREFIX.length)
  if (!/^[A-Za-z0-9_-]{8,}$/.test(value)) return null
  try {
    return decoder.decode(fromBase64Url(value))
  } catch {
    return null
  }
}
