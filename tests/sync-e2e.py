#!/usr/bin/env python3
"""부부 자동 동기화 E2E.

빌드에 박힌 SYNC 주소로 실제 왕복을 확인한다. 실서비스(Supabase)든
tests/fake-supabase.py 든 같은 코드로 돈다.

    BASE_URL=http://127.0.0.1:4179/ SYNC_URL=http://127.0.0.1:54321 python3 tests/sync-e2e.py
"""
import json
import os
import random
import string
import sys
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

os.environ["LD_LIBRARY_PATH"] = (
    "/workspace/.local/chromelibs/usr/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs:" + os.environ.get("LD_LIBRARY_PATH", "")
)

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:4179/")
SYNC_URL = os.environ["SYNC_URL"].rstrip("/")
KEY = "evening_qt_v1"
SYNC_KEY = "evening_qt_sync_v1"

results = []
console_errors = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(("PASS  " if condition else "FAIL  ") + name + (f" | {detail}" if detail else ""))


def passphrase():
    return "테스트부부" + "".join(random.choice(string.ascii_lowercase) for _ in range(8))


def rest_rows(room_hash=None):
    query = "select=room_hash,day,payload,updated_at"
    if room_hash:
        query += "&room_hash=eq." + urllib.parse.quote(room_hash)
    url = f"{SYNC_URL}/rest/v1/qt_rooms?{query}"
    request = urllib.request.Request(url, headers={"apikey": "test"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_text(page, text, timeout=6000):
    try:
        page.wait_for_function(
            """([needle]) => {
                const areas = Array.from(document.querySelectorAll('textarea'))
                return areas.some((area) => area.value.includes(needle))
            }""",
            arg=[text],
            timeout=timeout,
        )
        return True
    except Exception:
        return False


def field_value(page, field_id):
    return page.eval_on_selector(f"#{field_id}", "el => el.value")


def open_settings(page):
    page.get_by_role("button", name="설정").click()
    page.wait_for_selector("dialog[open]", timeout=4000)


def connect(page, phrase):
    open_settings(page)
    page.get_by_label("부부 암호").fill(phrase)
    page.get_by_role("button", name="연결하기").click()


def connect_and_wait(page, phrase):
    connect(page, phrase)
    page.wait_for_selector(".sync-status[data-state='live']", timeout=15000)


def close_dialog(page):
    page.get_by_role("button", name="닫기").first.click()
    page.wait_for_timeout(200)


def new_page(context, label):
    page = context.new_page()
    page.on("console", lambda m: console_errors.append(f"{label}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"{label}: {e}"))
    return page


def run():
    phrase = passphrase()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx_a = browser.new_context(viewport={"width": 1280, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
        ctx_b = browser.new_context(viewport={"width": 390, "height": 844})
        page_a = new_page(ctx_a, "A")
        page_b = new_page(ctx_b, "B")

        # ---------- 1. 연결 전 ----------
        page_a.goto(BASE, wait_until="networkidle")
        page_a.evaluate(f"localStorage.clear()")
        page_a.reload(wait_until="networkidle")
        page_a.wait_for_timeout(500)
        check("연결 전 푸터는 기기 저장만 안내", "서버로 보내지 않습니다" in page_a.inner_text("footer"))
        open_settings(page_a)
        check("설정에 부부 자동 동기화 섹션이 있다", page_a.get_by_text("부부 자동 동기화").count() > 0)

        # ---------- 2. 짧은 암호 ----------
        page_a.get_by_label("부부 암호").fill("짧")
        page_a.get_by_role("button", name="연결하기").click()
        page_a.wait_for_timeout(500)
        check("짧은 암호는 거절하고 이유를 알린다", "암호가 조금 짧" in page_a.inner_text("dialog[open]"))
        check("짧은 암호로는 연결되지 않는다", page_a.locator(".sync-status").count() == 0)

        # ---------- 3. 연결 ----------
        page_a.get_by_label("부부 암호").fill(phrase)
        page_a.get_by_role("button", name="연결하기").click()
        page_a.wait_for_selector(".sync-status[data-state='live']", timeout=15000)
        check("연결하면 동기화 중 상태", page_a.inner_text(".sync-status").startswith("동기화 중"))
        page_a.get_by_role("button", name="닫기").first.click()
        page_a.wait_for_timeout(300)
        check("연결 후 푸터가 암호화 동기화를 안내", "암호로 잠긴 채" in page_a.inner_text("footer"))
        check("연결 후 헤더에 동기화 표시", page_a.get_by_role("button", name="부부 자동 동기화").count() == 1)

        # ---------- 4. 초대 링크 ----------
        open_settings(page_a)
        page_a.get_by_role("button", name="상대에게 보낼 연결 링크 복사").click()
        page_a.wait_for_timeout(300)
        link = page_a.evaluate("navigator.clipboard.readText()")
        check("연결 링크에 #sync= 가 들어 있다", "#sync=qts1." in link, link[:60])
        close_dialog(page_a)

        page_b.goto(link, wait_until="networkidle")
        page_b.wait_for_timeout(2500)
        check("초대 링크로 연 폰이 자동 연결", page_b.get_by_role("button", name="부부 자동 동기화").count() == 1)
        check("주소창에서 초대 값이 지워진다", "#sync=" not in page_b.url, page_b.url)

        # ---------- 5. 한쪽에서 적으면 다른 쪽에 나타난다 ----------
        page_a.fill("#a-gratitude", "오늘은 퇴근길에 빵을 샀다")
        check("A가 적은 글이 B 화면에 나타난다", wait_text(page_b, "퇴근길에 빵을 샀다"), field_value(page_b, "a-gratitude"))
        page_b.fill("#b-prayer", "남편의 다음 한 주가 가볍기를")
        check("B가 적은 글이 A 화면에 나타난다", wait_text(page_a, "남편의 다음 한 주가 가볍기를"), field_value(page_a, "b-prayer"))

        # ---------- 6. 두 사람이 동시에 적어도 서로 덮지 않는다 ----------
        page_a.fill("#a-meditation", "A의 묵상: 시편 23편")
        page_b.fill("#b-meditation", "B의 묵상: 잠언 3장")
        page_a.wait_for_timeout(2500)
        check("A 묵상이 B에 그대로", "A의 묵상: 시편 23편" in field_value(page_b, "a-meditation"), field_value(page_b, "a-meditation"))
        check("B 묵상이 A에 그대로", "B의 묵상: 잠언 3장" in field_value(page_a, "b-meditation"), field_value(page_a, "b-meditation"))
        check("A 칸이 B 칸 글을 덮지 않았다", "B의 묵상" not in field_value(page_a, "a-meditation"))

        # ---------- 7. 서버에는 암호문만 ----------
        room = page_a.evaluate(f"JSON.parse(localStorage.getItem('{SYNC_KEY}')).roomHash")
        rows = rest_rows(room)
        today_rows = [row for row in rows if row["day"] != "settings"]
        payloads = " ".join(row["payload"] for row in rows)
        check("서버에 방 이름과 날짜 줄이 올라갔다", len(today_rows) >= 1, f"{len(rows)} rows")
        check("방 이름은 43자 해시", len(room) == 43, str(len(room)))
        check("서버 저장값에 평문이 없다", "퇴근길에 빵을 샀다" not in payloads and "가볍기를" not in payloads)
        check("암호문은 base64url 덩어리", all((" " not in row["payload"]) and len(row["payload"]) > 40 for row in rows))

        # ---------- 8. 새로고침해도 남는다 ----------
        page_b.reload(wait_until="networkidle")
        page_b.wait_for_timeout(2500)
        check("B를 새로고침해도 A의 글이 남는다", "퇴근길에 빵을 샀다" in field_value(page_b, "a-gratitude"), field_value(page_b, "a-gratitude"))
        check("B의 자기 글도 남는다", "잠언 3장" in field_value(page_b, "b-meditation"))

        # ---------- 8b. 다시 열어도 스스로 이어진다 ----------
        page_a.reload(wait_until="networkidle")
        page_a.wait_for_timeout(2500)
        check("앱을 다시 열어도 저장된 암호로 스스로 이어진다", page_a.get_by_role("button", name="부부 자동 동기화").count() == 1)
        open_settings(page_a)
        page_a.wait_for_selector(".sync-status[data-state='live']", timeout=15000)
        close_dialog(page_a)

        # ---------- 8c. 영문 화면에도 새 문구가 있다 ----------
        page_a.get_by_role("button", name="English").click()
        page_a.wait_for_timeout(500)
        page_a.locator('button[aria-label="Settings"]').click()
        page_a.wait_for_selector("dialog[open]", timeout=4000)
        dialog_text = page_a.inner_text("dialog[open]")
        check("영문 설정에 동기화 문구가 번역되어 있다", "Couple sync" in dialog_text and "sync." not in dialog_text, dialog_text[:80].replace("\n", " / "))
        page_a.get_by_role("button", name="Close").first.click()
        page_a.get_by_role("button", name="한국어").click()
        page_a.wait_for_timeout(600)

        # ---------- 9. 기존 기록이 처음 연결 때 올라간다 ----------
        ctx_c = browser.new_context(viewport={"width": 1280, "height": 900})
        page_c = new_page(ctx_c, "C")
        page_c.goto(BASE, wait_until="networkidle")
        page_c.evaluate("localStorage.clear()")
        page_c.reload(wait_until="networkidle")
        page_c.wait_for_timeout(400)
        page_c.fill("#a-gratitude", "연결 전에 적어 둔 기도")
        page_c.wait_for_timeout(800)
        phrase_c = passphrase()
        connect_and_wait(page_c, phrase_c)
        page_c.wait_for_timeout(2000)
        room_c = page_c.evaluate(f"JSON.parse(localStorage.getItem('{SYNC_KEY}')).roomHash")
        rows_c = rest_rows(room_c)
        joined = " ".join(row["payload"] for row in rows_c)
        check("연결 전 기록도 올라간다(암호문으로)", len(rows_c) >= 1 and "연결 전에" not in joined, f"{len(rows_c)} rows")

        # 다른 암호를 쓴 폰과는 섞이지 않는다
        ctx_d = browser.new_context(viewport={"width": 1280, "height": 900})
        page_d = new_page(ctx_d, "D")
        page_d.goto(BASE, wait_until="networkidle")
        page_d.evaluate("localStorage.clear()")
        page_d.reload(wait_until="networkidle")
        connect_and_wait(page_d, passphrase())
        page_d.wait_for_timeout(1500)
        check("다른 암호의 폰에는 A의 글이 보이지 않는다", "퇴근길에 빵을 샀다" not in field_value(page_d, "a-gratitude"))

        # ---------- 9b. 두 폰에 이미 있던 기록을 잇는다 ----------
        from datetime import date

        today = date.today().isoformat()
        phrase_pair = passphrase()

        def seed(page, text):
            page.goto(BASE, wait_until="networkidle")
            page.evaluate("localStorage.clear()")
            page.evaluate(
                """([key, day, text]) => {
                    localStorage.setItem(key, JSON.stringify({
                        version: 1,
                        settings: { names: ['재철', '은혜'], lang: 'ko', theme: 'lamp', chime: false, demoSeen: true },
                        records: { [day]: { a: { gratitude: text, meditation: '', prayer: '' },
                                            b: { gratitude: '', meditation: '', prayer: '' } } },
                    }))
                }""",
                [KEY, today, text],
            )
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(400)

        ctx_e = browser.new_context(viewport={"width": 1280, "height": 900})
        page_e = new_page(ctx_e, "E")
        seed(page_e, "아내 폰에만 있던 기도")
        connect_and_wait(page_e, phrase_pair)
        page_e.wait_for_timeout(2000)

        ctx_f = browser.new_context(viewport={"width": 1280, "height": 900})
        page_f = new_page(ctx_f, "F")
        seed(page_f, "남편 폰에만 있던 감사")
        connect_and_wait(page_f, phrase_pair)
        page_f.wait_for_timeout(3000)
        page_e.wait_for_timeout(2000)
        value_f = field_value(page_f, "a-gratitude")
        value_e = field_value(page_e, "a-gratitude")
        check("두 폰에 따로 있던 글이 모두 남는다(새 폰)", "남편 폰에만 있던 감사" in value_f and "아내 폰에만 있던 기도" in value_f, value_f.replace("\n", " / "))
        check("두 폰에 따로 있던 글이 모두 남는다(먼저 잇던 폰)", "남편 폰에만 있던 감사" in value_e and "아내 폰에만 있던 기도" in value_e, value_e.replace("\n", " / "))

        # ---------- 10. 샘플 모드에서는 올리지 않는다 ----------
        page_a.reload(wait_until="networkidle")
        page_a.wait_for_timeout(1200)
        before = {row["day"]: row["payload"] for row in rest_rows(room)}
        if page_a.get_by_role("button", name="샘플 보기").count():
            page_a.get_by_role("button", name="샘플 보기").click()
        page_a.wait_for_timeout(300)
        page_a.fill("#a-gratitude", "샘플 모드에서 쓴 글은 올라가면 안 된다")
        page_a.wait_for_timeout(2500)
        after = {row["day"]: row["payload"] for row in rest_rows(room)}
        check("샘플 모드에서는 서버 값이 바뀌지 않는다", before == after)
        check("샘플 모드 글은 상대 화면에도 안 간다", "올라가면 안 된다" not in field_value(page_b, "a-gratitude"))
        if page_a.get_by_role("button", name="샘플 그만 보기").count():
            page_a.get_by_role("button", name="샘플 그만 보기").click()
            page_a.wait_for_timeout(300)

        # ---------- 11. 연결을 끊으면 올리지 않는다 ----------
        open_settings(page_a)
        page_a.get_by_role("button", name="이 기기에서 동기화 끊기").first.click()
        page_a.wait_for_timeout(400)
        page_a.get_by_role("button", name="이 기기에서 동기화 끊기").last.click()
        page_a.wait_for_timeout(600)
        page_a.get_by_role("button", name="닫기").first.click()
        page_a.wait_for_timeout(300)
        check("연결을 끊으면 헤더 표시가 사라진다", page_a.get_by_role("button", name="부부 자동 동기화").count() == 0)
        check("연결을 끊으면 푸터도 기기 저장으로 돌아간다", "서버로 보내지 않습니다" in page_a.inner_text("footer"))
        before = {row["day"]: row["payload"] for row in rest_rows(room)}
        page_a.fill("#a-gratitude", "끊은 뒤에 쓴 글")
        page_a.wait_for_timeout(2000)
        after = {row["day"]: row["payload"] for row in rest_rows(room)}
        check("연결을 끊은 뒤에는 올라가지 않는다", before == after)
        check("연결을 끊어도 이 기기 기록은 남는다", "끊은 뒤에 쓴 글" in field_value(page_a, "a-gratitude"))

        # ---------- 12. 다시 연결하면 이어서 합쳐진다 ----------
        connect_and_wait(page_a, phrase)
        page_a.wait_for_timeout(2500)
        check("다시 연결하면 상대 글이 돌아온다", "남편의 다음 한 주가 가볍기를" in field_value(page_a, "b-prayer"), field_value(page_a, "b-prayer"))
        check("끊은 동안 쓴 내 글도 올라가 상대에게 간다", wait_text(page_b, "끊은 뒤에 쓴 글", timeout=8000), field_value(page_b, "a-gratitude"))

        # ---------- 13. 콘솔 ----------
        real_errors = [e for e in console_errors if "favicon" not in e and "net::ERR" not in e]
        check("콘솔 오류 없음", len(real_errors) == 0, " | ".join(real_errors[:3]))

        browser.close()


if __name__ == "__main__":
    run()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("FAILED: " + ", ".join(failed))
        sys.exit(1)
