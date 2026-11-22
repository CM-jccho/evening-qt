#!/usr/bin/env python3
"""테스트용 작은 Supabase 흉내 서버.

실제 프로젝트를 열기 전에, 앱의 REST 업로드와 Realtime 구독이 정말 왕복하는지
이 기기 안에서 확인하기 위한 것이다. PostgREST의 쓰는 부분(select·upsert)과
Supabase Realtime의 Phoenix 프로토콜(phx_join · phx_reply · postgres_changes)만
흉내 낸다. 배포되는 앱에는 쓰이지 않는다.

    python3 tests/fake-supabase.py 54321
"""
import asyncio
import json
import sys
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# (room_hash, day) -> row
ROWS: dict[tuple[str, str], dict] = {}
# websocket -> list of (topic, change_id, room_hash)
SUBS: dict[WebSocket, list[tuple[str, int, str]]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def matches(value: str, pattern: str) -> bool:
    """eq.xxx 와 in.(a,b) 만 지원한다."""
    if pattern.startswith("eq."):
        return value == pattern[3:]
    if pattern.startswith("in.(") and pattern.endswith(")"):
        items = [item.strip().strip('"') for item in pattern[4:-1].split(",")]
        return value in items
    return True


@app.get("/rest/v1/{table}")
async def select_rows(table: str, request: Request):
    rows = [dict(row) for (room_hash, _day), row in ROWS.items() if room_hash]
    for key, pattern in request.query_params.items():
        if key in {"select", "limit", "order", "offset"}:
            continue
        if key == "room_hash":
            rows = [row for row in rows if matches(row["room_hash"], pattern)]
        elif key == "day":
            rows = [row for row in rows if matches(row["day"], pattern)]
    limit = request.query_params.get("limit")
    if limit and limit.isdigit():
        rows = rows[: int(limit)]
    return rows


@app.post("/rest/v1/{table}")
async def upsert_rows(table: str, request: Request):
    body = await request.json()
    rows = body if isinstance(body, list) else [body]
    written = []
    for row in rows:
        key = (row["room_hash"], row["day"])
        existed = key in ROWS
        stored = {
            "room_hash": row["room_hash"],
            "day": row["day"],
            "payload": row["payload"],
            "updated_at": row.get("updated_at") or now_iso(),
        }
        ROWS[key] = stored
        written.append(stored)
        await broadcast(stored, "UPDATE" if existed else "INSERT")
    return written


@app.delete("/rest/v1/{table}")
async def delete_rows(table: str):
    ROWS.clear()
    return []


async def broadcast(row: dict, kind: str):
    """realtime-js는 [join_ref, ref, topic, event, payload] 배열로 주고받는다."""
    message_data = {
        "schema": "public",
        "table": "qt_rooms",
        "commit_timestamp": now_iso(),
        "type": kind,
        "errors": None,
        "columns": [
            {"name": "room_hash", "type": "text"},
            {"name": "day", "type": "text"},
            {"name": "payload", "type": "text"},
            {"name": "updated_at", "type": "timestamptz"},
        ],
        "record": row,
        "old_record": None,
    }
    for socket, subs in list(SUBS.items()):
        for topic, change_id, room_hash in subs:
            if row["room_hash"] != room_hash:
                continue
            payload = {"ids": [change_id], "data": message_data}
            try:
                await socket.send_text(json.dumps([None, None, topic, "postgres_changes", payload]))
            except Exception:
                SUBS.pop(socket, None)


@app.websocket("/realtime/v1/websocket")
async def realtime(socket: WebSocket):
    await socket.accept()
    SUBS[socket] = []
    try:
        while True:
            raw = await socket.receive_text()
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                continue
            messages = parsed if isinstance(parsed, list) and parsed and isinstance(parsed[0], list) else [parsed]
            for message in messages:
                if isinstance(message, list):
                    await handle_message(socket, message)
    except WebSocketDisconnect:
        pass
    finally:
        SUBS.pop(socket, None)


async def send_reply(socket: WebSocket, join_ref, ref, topic: str, payload: dict):
    await socket.send_text(json.dumps([join_ref, ref, topic, "phx_reply", payload]))


async def handle_message(socket: WebSocket, frame: list):
    padded = (frame + [None, None, None, None, None])[:5]
    join_ref, ref, topic, event, payload = padded
    topic = topic or ""

    if event == "phx_join":
        config = (payload or {}).get("config") or {}
        changes = config.get("postgres_changes") or []
        reply_changes = []
        for index, change in enumerate(changes):
            change_id = 1000 + (abs(hash((topic, index))) % 90000)
            filter_text = change.get("filter") or ""
            room_hash = ""
            if filter_text.startswith("room_hash=eq."):
                room_hash = filter_text[len("room_hash=eq.") :]
            SUBS.setdefault(socket, []).append((topic, change_id, room_hash))
            reply_changes.append({**change, "id": change_id})
        await send_reply(
            socket,
            join_ref,
            ref,
            topic,
            {"status": "ok", "response": {"postgres_changes": reply_changes}},
        )
    elif event == "phx_leave":
        await send_reply(socket, join_ref, ref, topic, {"status": "ok", "response": {}})
        SUBS[socket] = [item for item in SUBS.get(socket, []) if item[0] != topic]
    else:
        await send_reply(socket, join_ref, ref, topic, {"status": "ok", "response": {}})


@app.get("/health")
async def health():
    return {"ok": True, "rows": len(ROWS)}


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54321
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
