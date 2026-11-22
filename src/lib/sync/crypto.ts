/**
 * 부부 암호 하나로 방 이름과 열쇠를 만든다. 서버에는 방 이름과 암호문만 오가고,
 * 암호와 열쇠는 이 기기 밖으로 나가지 않는다.
 *
 *   방 이름 = SHA-256("evening-qt/room/v1\n" + 정리한 암호)  → base64url 43자
 *   열쇠    = PBKDF2-SHA256(정리한 암호, salt = "evening-qt/key/v1\n" + 방 이름, 210,000회)
 *   암호문  = AES-GCM-256(iv 12바이트 + ciphertext), AAD = 방 이름 + "|" + 칸 이름
 */

const APP_SALT = 'evening-qt/key/v1\n'
const ROOM_PREFIX = 'evening-qt/room/v1\n'
export const PASS_MIN = 6
export const PBKDF2_ROUNDS = 210_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface RoomKey {
  /** base64url 43자, 테이블의 room_hash */
  roomHash: string
  key: CryptoKey
}

/** 대소문자·앞뒤 공백·겹친 공백·자모 표기 차이를 없애 두 폰이 같은 방을 만들게 한다 */
export function normalizePassphrase(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function passphraseReady(raw: string): boolean {
  return normalizePassphrase(raw).length >= PASS_MIN
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function deriveRoom(passphrase: string): Promise<RoomKey> {
  const normalized = normalizePassphrase(passphrase)
  const roomDigest = await crypto.subtle.digest('SHA-256', encoder.encode(ROOM_PREFIX + normalized))
  const roomHash = toBase64Url(new Uint8Array(roomDigest))
  const base = await crypto.subtle.importKey('raw', encoder.encode(normalized), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(APP_SALT + roomHash),
      iterations: PBKDF2_ROUNDS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return { roomHash, key }
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function additionalData(roomHash: string, context: string): ArrayBuffer {
  return bufferOf(encoder.encode(`evening-qt/payload/v1|${roomHash}|${context}`))
}

export async function encryptJson(key: CryptoKey, roomHash: string, context: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = encoder.encode(JSON.stringify(value))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bufferOf(iv), additionalData: additionalData(roomHash, context) },
    key,
    bufferOf(plain),
  )
  const wrapped = new Uint8Array(iv.length + sealed.byteLength)
  wrapped.set(iv, 0)
  wrapped.set(new Uint8Array(sealed), iv.length)
  return toBase64Url(wrapped)
}

/** 읽지 못한 암호문(다른 암호, 깨진 값, 다른 칸)은 null로 돌려준다 */
export async function decryptJson<T = unknown>(
  key: CryptoKey,
  roomHash: string,
  context: string,
  payload: string,
): Promise<T | null> {
  try {
    const wrapped = fromBase64Url(payload)
    if (wrapped.length < 13) return null
    const iv = bufferOf(wrapped.subarray(0, 12))
    const body = bufferOf(wrapped.subarray(12))
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(roomHash, context) },
      key,
      body,
    )
    return JSON.parse(decoder.decode(plain)) as T
  } catch {
    return null
  }
}
