-- 밤의 묵상 (Selah) · 부부 자동 동기화 테이블
-- Supabase Dashboard → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하면 끝납니다.
--
-- 저장되는 것은 세 가지뿐입니다.
--   room_hash : 부부 암호를 SHA-256 한 43자 (암호 자체는 서버에 오지 않습니다)
--   day       : 날짜(2026-11-22) 또는 'settings'
--   payload   : 이 기기에서 AES-GCM-256 으로 잠근 암호문 (서버는 내용을 읽지 못합니다)

create table if not exists public.qt_rooms (
  room_hash text not null check (char_length(room_hash) between 20 and 64),
  day text not null check (day = 'settings' or day ~ '^\d{4}-\d{2}-\d{2}$'),
  payload text not null check (char_length(payload) between 16 and 200000),
  updated_at timestamptz not null default now(),
  primary key (room_hash, day)
);

alter table public.qt_rooms enable row level security;

-- 앱은 로그인 없이(anon 키) 방 이름을 아는 사람만 읽고 쓰는 구조입니다.
-- 내용은 모두 암호문이므로, 이 정책으로 새는 것은 암호문과 방 이름의 개수뿐입니다.
drop policy if exists "qt_rooms read" on public.qt_rooms;
create policy "qt_rooms read" on public.qt_rooms
  for select to anon, authenticated using (true);

drop policy if exists "qt_rooms insert" on public.qt_rooms;
create policy "qt_rooms insert" on public.qt_rooms
  for insert to anon, authenticated with check (true);

drop policy if exists "qt_rooms update" on public.qt_rooms;
create policy "qt_rooms update" on public.qt_rooms
  for update to anon, authenticated using (true) with check (true);

-- 지우기는 열지 않습니다(앱도 지우지 않습니다). 상대가 지운 글이 아니라
-- 두 사람의 기록이 실수로 사라지는 쪽이 더 큰 문제이기 때문입니다.

-- Realtime 이 UPDATE/INSERT 의 전체 줄을 실어 보내도록 한다
alter table public.qt_rooms replica identity full;

-- Realtime 발행 목록에 이 표를 넣는다(이미 들어 있으면 건너뛴다)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qt_rooms'
  ) then
    alter publication supabase_realtime add table public.qt_rooms;
  end if;
end $$;
