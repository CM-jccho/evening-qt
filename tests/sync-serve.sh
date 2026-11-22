#!/bin/bash
# 부부 동기화 E2E: 테스트용 Supabase 흉내 서버 + 미리보기 서버를 함께 띄운다.
# 실서비스에 대고 돌릴 때는 SYNC_LIVE=1 SYNC_URL=https://<project>.supabase.co 로 실행한다.
set -u
export PATH=/workspace/.local/node/bin:$PATH
cd /workspace/evening-qt || exit 1

PORT="${SYNC_PORT:-54321}"
FAKE=""
if [ "${SYNC_LIVE:-0}" != "1" ]; then
  python3 tests/fake-supabase.py "$PORT" > /workspace/.tmp/fake-supabase.log 2>&1 &
  FAKE=$!
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/health" && break
    sleep 0.5
  done
fi

npx vite preview --port 4179 --host 127.0.0.1 > /workspace/.tmp/preview.log 2>&1 &
SRV=$!
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4179/ || true)
  [ "$code" = "200" ] && break
  sleep 0.5
done
echo "preview: $code"

export BASE_URL=http://127.0.0.1:4179/
export SYNC_URL="${SYNC_URL:-http://127.0.0.1:$PORT}"
status=0
python3 tests/sync-e2e.py || status=1

kill $SRV $FAKE 2>/dev/null
exit $status
