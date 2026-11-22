#!/usr/bin/env python3
"""Checks the built `dist` the way GitHub Pages will serve it: from a sub-folder.

GitHub Pages serves this repository at https://<user>.github.io/evening-qt/, so the
build has to work when every asset sits one directory down. This copies `dist` into
`<tmp>/site/evening-qt/`, serves that folder over HTTP and reads the page with
Playwright: every request answers 200, the app renders, the past-years block works
and the console stays empty.

    python3 tests/deploy-path.py
"""
import functools
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import threading
import time
from datetime import date

from playwright.sync_api import sync_playwright

os.environ["LD_LIBRARY_PATH"] = (
    "/workspace/.local/chromelibs/usr/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs:" + os.environ.get("LD_LIBRARY_PATH", "")
)

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ROOT = "/workspace/.tmp/site"
SUB = "evening-qt"
OUT = "/workspace/browser"
KEY = "evening_qt_v1"
PORT = 4180
results = []
errors = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f" | {detail}" if detail else ""))


def serve():
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(os.path.join(ROOT, SUB))
    shutil.copytree(os.path.join(PROJECT, "dist"), os.path.join(ROOT, SUB), dirs_exist_ok=True)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            return

    handler = functools.partial(Quiet, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def run():
    httpd = serve()
    base = f"http://127.0.0.1:{PORT}/{SUB}/"
    today = date.today()
    mm_dd = today.strftime("%m-%d")
    seed = {
        "version": 1,
        "settings": {"names": ["재철", "은혜"], "lang": "ko", "theme": "lamp", "chime": False, "demoSeen": True},
        "records": {
            today.isoformat(): {
                "a": {"gratitude": "오늘의 감사", "meditation": "오늘의 묵상", "prayer": ""},
                "b": {"gratitude": "", "meditation": "", "prayer": ""},
            },
            f"{today.year - 1}-{mm_dd}": {
                "a": {"gratitude": "", "meditation": "작년 오늘의 묵상", "prayer": ""},
                "b": {"gratitude": "", "meditation": "", "prayer": "작년 오늘의 기도"},
            },
        },
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        responses = []
        page.on("response", lambda r: responses.append((r.url, r.status)))

        page.goto(base, wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seed, ensure_ascii=False))})")
        page.reload(wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(900)

        check("하위 경로에서 열린다", page.locator(".wordmark-ko").inner_text().strip() == "밤의 묵상")
        check("페이지 제목", "밤의 묵상" in page.title(), page.title())
        bad = [(url, code) for url, code in responses if code >= 400]
        check("모든 요청 200", not bad, str(bad[:3]))
        scripts = [url for url, _ in responses if "/assets/" in url]
        check("자산이 하위 경로에서 온다", bool(scripts) and all(f"/{SUB}/assets/" in u for u in scripts), str(scripts[:2]))
        check("앱이 렌더된다", page.locator("h1").count() == 1 and page.locator(".verse-primary").count() == 1)
        check("지난 기록 섹션", page.locator(".past-year").count() == 1)
        check("지난 기록 내용", "작년 오늘의 묵상" in page.locator(".past").inner_text())
        check("콘솔 오류 없음", not errors, str(errors[:3]))

        # 동기화 청크처럼 나중에 불러오는 자산도 하위 경로에서 온다
        if os.environ.get("SYNC_CHECK") == "1":
            page.get_by_role("button", name="설정").click()
            page.wait_for_selector("dialog[open]")
            page.get_by_label("부부 암호").fill("하위경로 확인용 부부 암호")
            page.get_by_role("button", name="연결하기").click()
            try:
                page.wait_for_selector(".sync-status[data-state='live']", timeout=15000)
            except Exception:
                pass
            page.wait_for_timeout(1500)
            chunks = [url for url, _ in responses if "/assets/dist-" in url]
            check("동기화 청크가 하위 경로에서 온다", bool(chunks) and all(f"/{SUB}/assets/" in u for u in chunks), str(chunks[:2]))
            check("하위 경로에서도 동기화가 붙는다", page.locator(".sync-status[data-state='live']").count() == 1)
            page.get_by_role("button", name="닫기").first.click()

        page.locator(".past").scroll_into_view_if_needed()
        page.evaluate("window.scrollBy(0, -72)")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/evening-qt-v2-pages-subpath.png")
        browser.close()

    httpd.shutdown()
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} deploy-path checks passed")
    return passed, len(results)


if __name__ == "__main__":
    ok, total = run()
    raise SystemExit(0 if ok == total else 1)
