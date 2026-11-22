import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncConfig } from './config'

export interface SyncRow {
  room_hash: string
  day: string
  payload: string
  updated_at?: string
}

/** 서버에 오가는 것은 방 이름(해시), 날짜 칸 이름, 암호문뿐이다 */
export class RemoteClient {
  private client: SupabaseClient
  private table: string

  constructor(client: SupabaseClient, table: string) {
    this.client = client
    this.table = table
  }

  async pull(roomHash: string, days?: string[]): Promise<SyncRow[]> {
    let query = this.client
      .from(this.table)
      .select('room_hash,day,payload,updated_at')
      .eq('room_hash', roomHash)
    if (days && days.length) query = query.in('day', days)
    const { data, error } = await query.limit(2000)
    if (error) throw new Error(error.message)
    return (data ?? []) as SyncRow[]
  }

  async push(row: SyncRow): Promise<void> {
    const { error } = await this.client
      .from(this.table)
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'room_hash,day' })
    if (error) throw new Error(error.message)
  }

  subscribe(roomHash: string, onRow: (row: SyncRow) => void, onState: (live: boolean) => void): () => void {
    const channel = this.client
      .channel(`qt:${roomHash}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: this.table, filter: `room_hash=eq.${roomHash}` },
        (message) => {
          const row = (message.new ?? {}) as Partial<SyncRow>
          if (typeof row.day !== 'string' || typeof row.payload !== 'string') return
          onRow({ room_hash: roomHash, day: row.day, payload: row.payload })
        },
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') onState(true)
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') onState(false)
      })
    return () => {
      void this.client.removeChannel(channel)
    }
  }

  disconnect(): void {
    void this.client.removeAllChannels()
  }
}

/** 만든 클라이언트는 동기화를 켤 때만 내려받는다(첫 화면 무게를 늘리지 않는다) */
export async function openRemote(config: SyncConfig): Promise<RemoteClient> {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 4 } },
  })
  return new RemoteClient(client, config.table)
}
