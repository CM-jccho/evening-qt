#!/bin/bash
# Local test run: preview build on 4179, then the E2E suite (and optionally the
# other gates passed as arguments). Kept on disk so the server and the checks run
# inside one shell session.
set -u
export PATH=/workspace/.local/node/bin:$PATH
cd /workspace/evening-qt || exit 1
npx vite preview --port 4179 --host 127.0.0.1 > /workspace/.tmp/preview.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4179/ || true)
  if [ "$code" = "200" ]; then break; fi
  sleep 0.5
done
echo "server: $code"
export BASE_URL=http://127.0.0.1:4179/
status=0
for gate in "$@"; do
  echo "=== $gate ==="
  python3 "tests/$gate.py" || status=1
done
kill $SRV 2>/dev/null
exit $status
