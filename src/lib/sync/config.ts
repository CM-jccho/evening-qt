/**
 * 부부 동기화가 붙는 곳. 실제 주소와 anon 공개 키는 프로젝트를 만든 뒤 채운다.
 * anon 키는 공개되어도 되는 키이고, service_role 키는 어떤 경우에도 넣지 않는다.
 * 이 값이 비어 있으면 앱은 지금처럼 이 기기에만 저장하고 동기화 UI도 숨긴다.
 */
export interface SyncConfig {
  url: string
  anonKey: string
  table: string
}

/* ↓↓↓ Supabase 프로젝트를 만든 뒤 이 두 줄만 채우면 된다 (anon 키는 공개 키) ↓↓↓ */
const PROJECT_URL = '' // 예: 'https://abcdefghijklm.supabase.co'
const PROJECT_KEY = '' // Settings → API 의 anon public key

/* 테스트 서버나 다른 프로젝트로 돌려 볼 때는 빌드할 때 VITE_SYNC_URL·VITE_SYNC_KEY 로 바꾼다 */
const ENV_URL = (import.meta.env.VITE_SYNC_URL as string | undefined)?.trim() ?? ''
const ENV_KEY = (import.meta.env.VITE_SYNC_KEY as string | undefined)?.trim() ?? ''

export const SYNC_CONFIG: SyncConfig = {
  url: ENV_URL || PROJECT_URL,
  anonKey: ENV_KEY || PROJECT_KEY,
  table: 'qt_rooms',
}

export function syncConfigured(config: SyncConfig = SYNC_CONFIG): boolean {
  const url = config.url
  const remote = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url)
  return (remote || local) && config.anonKey.length > 20
}
