#!/usr/bin/env python3
"""Playwright end-to-end run for 밤의 묵상 (evening-qt).

Runs against a dev or preview server:
    BASE_URL=http://127.0.0.1:4179/ python3 tests/e2e.py
"""
import base64
import json
import os
import tempfile
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

os.environ["LD_LIBRARY_PATH"] = (
    "/workspace/.local/chromelibs/usr/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs:" + os.environ.get("LD_LIBRARY_PATH", "")
)

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:4179/")
KEY = "evening_qt_v1"
OUT = "/workspace/browser"
HERE = os.path.dirname(os.path.abspath(__file__))
PASSAGES = json.load(open(os.path.join(HERE, "..", "src", "data", "passages.json"), encoding="utf-8"))

results = []
errors = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(("PASS  " if condition else "FAIL  ") + name + (f" | {detail}" if detail else ""))


def ko_date(d):
    week = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
    return f"{d.year}년 {d.month}월 {d.day}일 {week[d.weekday()]}"


def storage(page):
    raw = page.evaluate(f"localStorage.getItem('{KEY}')")
    return json.loads(raw) if raw else None


def wait_saved(page):
    page.wait_for_timeout(650)


def clean_page(page):
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(700)


def settle(page):
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(500)


def run():
    today = date.today()
    today_key = today.isoformat()
    yesterday = today - timedelta(days=1)
    expected = PASSAGES[(today.day - 1) % 31]

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- 1. first visit ----------
        page.goto(BASE, wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        settle(page)

        check("첫 방문: 샘플 안내가 보인다", page.locator(".sample-bar").is_visible())
        check("첫 방문: 제목이 하나다", page.locator("h1").count() == 1)
        check("첫 방문: 날짜가 오늘이다", ko_date(today) in page.locator(".date-main").inner_text())
        check("말씀: 날짜에 맞는 구절", page.locator(".passage-ref").first.inner_text().strip() == expected["refKo"], expected["refKo"])
        check("말씀: 한글 본문 일치", expected["ko"][:24] in page.locator(".verse-primary").inner_text())
        check("말씀: 영문 병기", expected["en"][:30] in page.locator(".verse-secondary").inner_text())
        check("말씀: 영문 표기 병기", expected["refEn"] in page.locator(".passage-ref-alt").inner_text())

        box = page.locator(".passage-actions").bounding_box()
        check("1280x800 안에 행동 버튼이 모두 보인다", box is not None and box["y"] + box["height"] <= 800, str(box))

        page.get_by_role("button", name="그냥 시작").click()
        page.wait_for_timeout(700)
        check("샘플 안내 닫힘", page.locator(".sample-bar").count() == 0)
        store = storage(page)
        check("샘플 안내 상태 저장", store["settings"]["demoSeen"] is True)

        # ---------- 2. writing and persistence ----------
        page.locator("#a-gratitude").fill("따뜻한 저녁을 함께 먹은 일")
        page.locator("#a-meditation").fill("평강은 조용한 데서 온다")
        page.locator("#a-prayer").fill("서로의 하루를 위해")
        page.locator("#b-gratitude").fill("남편이 끓여 준 차")
        page.locator("#b-meditation").fill("같은 말씀에서 다른 위로")
        page.locator("#b-prayer").fill("내일의 잠을 위해")
        wait_saved(page)
        store = storage(page)
        rec = store["records"][today_key]
        check("저장: 감사 기록", rec["a"]["gratitude"] == "따뜻한 저녁을 함께 먹은 일")
        check("저장: 두 사람 모두", rec["b"]["prayer"] == "내일의 잠을 위해")
        check("저장 상태 표시", page.locator(".save-state").inner_text().strip().endswith("저장됨"))

        page.reload(wait_until="networkidle")
        settle(page)
        check("새로고침 뒤 기록 유지", page.locator("#a-gratitude").input_value() == "따뜻한 저녁을 함께 먹은 일")

        # ---------- 3. names ----------
        page.locator(".name-input").nth(0).fill("재철")
        page.locator(".name-input").nth(1).fill("은혜")
        wait_saved(page)
        store = storage(page)
        check("이름 저장", store["settings"]["names"] == ["재철", "은혜"])
        page.reload(wait_until="networkidle")
        settle(page)
        check("이름 새로고침 유지", page.locator(".name-input").nth(1).input_value() == "은혜")

        # ---------- 4. another passage ----------
        first_ref = page.locator(".passage-ref").first.inner_text().strip()
        page.get_by_role("button", name="말씀 바꾸기").click()
        page.wait_for_timeout(500)
        check("말씀 바꾸기: 목록이 열린다", page.locator(".passage-list").is_visible())
        check("말씀 바꾸기: 지금 말씀이 표시된다", page.locator(".passage-option-active").count() == 1)
        page.locator(".passage-option").first.click()
        wait_saved(page)
        second_ref = page.locator(".passage-ref").first.inner_text().strip()
        check("말씀 바꾸기: 구절이 바뀐다", first_ref != second_ref, f"{first_ref} -> {second_ref}")
        check("말씀 바꾸기: 목록이 닫힌다", page.locator("dialog[open]").count() == 0)
        page.reload(wait_until="networkidle")
        settle(page)
        check("말씀 바꾸기: 새로고침 유지", page.locator(".passage-ref").first.inner_text().strip() == second_ref)

        # ---------- 5. custom passage ----------
        page.get_by_role("button", name="말씀 바꾸기").click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="말씀 직접 적기").click()
        page.wait_for_timeout(400)
        check("말씀 편집기 열림", page.locator("#dialog-오늘의-말씀-직접-적기").is_visible())
        page.locator(".editor-grid input").nth(0).fill("시편 4:8")
        page.locator(".editor-grid input").nth(1).fill("Psalm 4:8")
        page.locator(".editor-grid textarea").nth(0).fill("내가 평안히 눕고 자기도 하리니")
        page.locator(".editor-grid textarea").nth(1).fill("I will lie down and sleep in peace.")
        page.get_by_role("button", name="이 말씀으로").click()
        page.wait_for_timeout(500)
        check("직접 적은 말씀 표시", page.locator(".passage-ref").first.inner_text().strip() == "시편 4:8")
        check("직접 적은 말씀 안내", page.locator(".passage-note").count() == 1)
        page.reload(wait_until="networkidle")
        settle(page)
        check("직접 적은 말씀 유지", "내가 평안히 눕고" in page.locator(".verse-primary").inner_text())

        page.get_by_role("button", name="말씀 바꾸기").click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="말씀 직접 적기").click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="기본 말씀으로").click()
        page.wait_for_timeout(400)
        check("기본 말씀으로 되돌림", page.locator(".passage-note").count() == 0)

        # ---------- 6. share code ----------
        page.locator("#b-prayer").fill("서로를 위한 기도 제목")
        wait_saved(page)
        page.locator(".share-button").nth(1).click()
        page.wait_for_timeout(500)
        check("공유 창: 링크가 먼저", page.locator("dialog[open] .button-primary").inner_text().find("링크") >= 0)
        check("공유 창: 코드는 접혀 있다", page.locator(".code-details").get_attribute("open") is None)
        page.locator(".code-details summary").click()
        page.wait_for_timeout(300)
        code = page.locator("#share-code").input_value()
        check("공유 코드 생성", code.startswith("SELAH1-"), code[:24])
        payload = json.loads(base64.urlsafe_b64decode(code[7:] + "=" * (-len(code[7:]) % 4)))
        check("공유 코드: 날짜", payload["d"] == today_key)
        check("공유 코드: 이름", payload["n"] == "은혜")
        check("공유 코드: 칸", payload["s"] == 1)
        check("공유 코드: 내용", payload["r"]["prayer"] == "서로를 위한 기도 제목")
        page.get_by_role("button", name="코드 복사").click()
        page.wait_for_timeout(300)
        check("복사 안내", page.locator(".toast").inner_text().find("복사") >= 0)
        page.locator("dialog[open]").get_by_role("button", name="닫기").first.click()
        page.wait_for_timeout(300)

        # ---------- 7. import in the same page (merge + undo) ----------
        page.locator("#b-gratitude").fill("원래 적어 둔 감사")
        wait_saved(page)
        page.get_by_role("button", name="받은 링크로 합치기").click()
        page.wait_for_timeout(400)
        check("불러오기 창 열림", page.locator("#import-code").is_visible())
        page.locator("#import-code").fill("쓰레기같은코드")
        page.wait_for_timeout(300)
        check("잘못된 코드 안내", "알아보지 못했" in page.locator("dialog[open] .dialog-note").inner_text())
        check("잘못된 코드는 적용 불가", page.locator("dialog[open]").get_by_role("button", name="이 기록 합치기").is_disabled())
        page.locator("#import-code").fill(code)
        page.wait_for_timeout(400)
        check("불러오기 미리보기", "은혜" in page.locator("dialog[open] .dialog-note").inner_text())
        page.locator("dialog[open]").get_by_role("button", name="이 기록 합치기").click()
        page.wait_for_timeout(500)
        check("상대 칸이 합쳐짐", page.locator("#b-prayer").input_value() == "서로를 위한 기도 제목")
        check("내 칸은 그대로", page.locator("#a-gratitude").input_value() == "따뜻한 저녁을 함께 먹은 일")
        check("합침 안내", "은혜" in page.locator(".toast").inner_text())
        page.locator(".toast-undo").click()
        page.wait_for_timeout(400)
        check("합침 되돌리기", page.locator("#b-gratitude").input_value() == "원래 적어 둔 감사")

        # ---------- 8. a link from the spouse ----------
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
        spouse = ctx2.new_page()
        spouse.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        spouse.goto(BASE, wait_until="networkidle")
        spouse.evaluate("localStorage.clear()")
        spouse.goto(BASE + "#selah=" + code, wait_until="networkidle")
        spouse.wait_for_timeout(900)
        check("공유 링크: 상대 칸이 바로 채워짐", spouse.locator("#b-prayer").input_value() == "서로를 위한 기도 제목")
        check("공유 링크: 안내", "은혜" in spouse.locator(".toast").inner_text())
        check("공유 링크: 해시 정리", "#selah" not in spouse.url)
        spouse.reload(wait_until="networkidle")
        spouse.wait_for_timeout(500)
        check("공유 링크: 새로고침 뒤에도 유지", spouse.locator("#b-prayer").input_value() == "서로를 위한 기도 제목")
        ctx2.close()

        # ---------- 9. prayer timer ----------
        page.locator("#reflection").scroll_into_view_if_needed()
        page.get_by_role("button", name="1분").click()
        check("타이머: 1분 선택", page.locator(".timer-clock").inner_text() == "01:00")
        page.get_by_role("button", name="시작").click()
        page.wait_for_timeout(1400)
        check("타이머: 줄어든다", page.locator(".timer-clock").inner_text() != "01:00", page.locator(".timer-clock").inner_text())
        check("타이머: 일시정지 라벨", page.get_by_role("button", name="잠시 멈춤").count() == 1)
        page.get_by_role("button", name="잠시 멈춤").click()
        paused = page.locator(".timer-clock").inner_text()
        page.wait_for_timeout(1200)
        check("타이머: 멈춤 유지", page.locator(".timer-clock").inner_text() == paused)
        page.get_by_role("button", name="처음으로").first.click()
        check("타이머: 처음으로", page.locator(".timer-clock").inner_text() == "01:00")

        page.get_by_role("button", name="1분").click()
        page.get_by_role("button", name="시작").click()
        page.wait_for_timeout(61000)
        check("타이머: 완료 00:00", page.locator(".timer-clock").inner_text() == "00:00")
        check("타이머: 완료 문구", "수고했어요" in page.locator(".timer-done").inner_text())

        # ---------- 10. archive and past date ----------
        page.locator(".archive").scroll_into_view_if_needed()
        check("기록: 기본은 접혀 있다", page.locator(".archive-details").get_attribute("open") is None)
        page.locator(".archive-summary").click()
        page.wait_for_timeout(400)
        check("기록: 펼친다", page.locator(".archive-details").get_attribute("open") is not None)
        page.get_by_role("button", name=ko_date(yesterday)).click()
        page.wait_for_timeout(600)
        check("지난 날짜 열림", ko_date(yesterday) in page.locator(".date-main").inner_text())
        check("지난 날짜 표시", page.get_by_role("button", name="오늘로 돌아가기").count() == 1)
        page.locator("#a-gratitude").fill("어제의 감사 기록")
        wait_saved(page)
        check("지난 날짜 저장", storage(page)["records"][yesterday.isoformat()]["a"]["gratitude"] == "어제의 감사 기록")

        page.get_by_role("button", name="오늘로 돌아가기").click()
        page.wait_for_timeout(500)
        check("오늘로 돌아옴", ko_date(today) in page.locator(".date-main").inner_text())
        check("기록 목록 두 줄", page.locator(".archive-row").count() == 2, str(page.locator(".archive-row").count()))
        page.locator(".search input").fill("어제의 감사")
        page.wait_for_timeout(400)
        check("기록 검색", page.locator(".archive-row").count() == 1)
        page.locator(".search input").fill("없는 문장")
        page.wait_for_timeout(300)
        check("검색 결과 없음 안내", "찾은 기록이 없어요" in page.locator(".archive-empty").inner_text())
        page.locator(".search input").fill("")
        page.wait_for_timeout(300)

        # ---------- 11. backup (settings only: the record keeps search alone) ----------
        check("기록: 백업 버튼은 설정에만", page.locator(".archive").get_by_role("button", name="내보내기").count() == 0)
        page.locator(".tool-button-icon").click()
        page.wait_for_timeout(400)
        with page.expect_download() as dl_info:
            page.locator("dialog[open]").get_by_role("button", name="내보내기").click()
        download = dl_info.value
        path = os.path.join(tempfile.gettempdir(), "evening-qt-backup.json")
        download.save_as(path)
        backup = json.load(open(path, encoding="utf-8"))
        check("백업 내보내기: 파일", backup.get("app") == "evening-qt")
        check("백업: 두 날짜", today_key in backup["records"] and yesterday.isoformat() in backup["records"])

        backup["records"]["2026-01-05"] = {
            "a": {"gratitude": "새해 첫 묵상", "meditation": "", "prayer": ""},
            "b": {"gratitude": "", "meditation": "", "prayer": ""},
        }
        edited = os.path.join(tempfile.gettempdir(), "evening-qt-import.json")
        json.dump(backup, open(edited, "w", encoding="utf-8"), ensure_ascii=False)
        page.locator("dialog[open] input[type=file]").set_input_files(edited)
        page.wait_for_timeout(700)
        check("백업 불러오기", "2026-01-05" in storage(page)["records"])
        check("불러오기 안내", "불러왔" in page.locator(".toast").inner_text())
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # ---------- 12. theme and language ----------
        page.locator(".tool-button-theme").click()
        page.wait_for_timeout(500)
        check("종이 화면 전환", page.evaluate("document.documentElement.dataset.theme") == "paper")
        check("종이 배경색", page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(251, 247, 240)")
        page.reload(wait_until="networkidle")
        check("화면 설정 유지", page.evaluate("document.documentElement.dataset.theme") == "paper")

        page.locator(".masthead-tools .tool-button").first.click()
        page.wait_for_timeout(600)
        check("영문 UI 전환", page.locator(".section-title").first.inner_text() == "Tonight's reflection and prayer")
        en_ref = page.locator(".passage-ref").first.inner_text().strip()
        en_item = next((p for p in PASSAGES if p["refEn"] == en_ref), None)
        check("영문 본문이 먼저", bool(en_item) and en_item["en"][:30] in page.locator(".verse-primary").inner_text(), en_ref)
        check("html lang", page.evaluate("document.documentElement.lang") == "en")
        page.reload(wait_until="networkidle")
        check("언어 유지", page.locator(".section-title").first.inner_text() == "Tonight's reflection and prayer")
        page.locator(".masthead-tools .tool-button").first.click()
        page.wait_for_timeout(500)

        # ---------- 13. demo, separate from my record ----------
        ctx3 = browser.new_context(viewport={"width": 1280, "height": 800})
        demo = ctx3.new_page()
        demo.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        demo.goto(BASE, wait_until="networkidle")
        demo.evaluate("localStorage.clear()")
        demo.reload(wait_until="networkidle")
        demo.wait_for_timeout(500)
        demo.get_by_role("button", name="샘플 보기").click()
        demo.wait_for_timeout(500)
        check("샘플: 안내 띠", demo.locator(".sample-bar-live").is_visible())
        check("샘플: 두 칸이 채워짐", len(demo.locator("#a-gratitude").input_value()) > 10 and len(demo.locator("#b-prayer").input_value()) > 5)
        demo.locator("#a-gratitude").fill("샘플에 덧쓴 문장")
        demo.wait_for_timeout(700)
        saved = demo.evaluate(f"localStorage.getItem('{KEY}')")
        check("샘플: 실제 기록으로 저장되지 않음", saved is None or today_key not in json.loads(saved)["records"])
        demo.get_by_role("button", name="샘플 그만 보기").click()
        demo.wait_for_timeout(400)
        check("샘플 종료: 빈 칸", demo.locator("#a-gratitude").input_value() == "")
        ctx3.close()

        # ---------- 14. dialogs and a11y ----------
        page.locator('.tool-button-icon').click()
        page.wait_for_timeout(400)
        dialog = page.locator("dialog[open]")
        check("설정 창 열림", dialog.count() == 1)
        check("설정 창 제목 연결", dialog.get_attribute("aria-labelledby") is not None)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        check("Esc로 닫힘", page.locator("dialog[open]").count() == 0)

        unlabeled = page.evaluate(
            """() => [...document.querySelectorAll('input, textarea, select')].filter(el => {
                const id = el.id; const lab = id && document.querySelector(`label[for="${id}"]`);
                return !lab && !el.getAttribute('aria-label') && !el.closest('label');
            }).length"""
        )
        check("입력 칸마다 이름표", unlabeled == 0, str(unlabeled))
        unnamed = page.evaluate(
            """() => [...document.querySelectorAll('button')].filter(b => !((b.innerText || b.textContent).trim() || b.getAttribute('aria-label'))).map(b => b.className || b.outerHTML.slice(0, 60))"""
        )
        check("버튼마다 이름", len(unnamed) == 0, str(unnamed[:4]))
        page.keyboard.press("Tab")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        check("키보드 포커스 표시", outline not in ("none", ""), outline)

        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(200)
        dur = page.evaluate("getComputedStyle(document.querySelector('.button-primary')).transitionDuration")
        check("동작 줄이기 설정", dur in ("0.01ms", "0s", "0.00001s", "1e-05s"), dur)
        page.emulate_media(reduced_motion="no-preference")

        # ---------- 15. responsive widths ----------
        widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920]
        overflow = []
        for w in widths:
            page.set_viewport_size({"width": w, "height": 900})
            page.wait_for_timeout(250)
            diff = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            body = page.evaluate("document.body.scrollWidth - window.innerWidth")
            if diff > 0 or body > 0:
                overflow.append((w, diff, body))
        check("가로 오버플로 없음 (320~1920)", not overflow, str(overflow))

        # ---------- 15b. readability ----------
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(300)
        sizes = page.evaluate(
            """() => {
                const size = (sel) => {
                    const el = document.querySelector(sel)
                    return el ? parseFloat(getComputedStyle(el).fontSize) : 0
                }
                return {
                    input: size('#a-gratitude'),
                    label: size('.field-label'),
                    date: size('.date-note'),
                    secondary: size('.verse-secondary'),
                    lead: size('.section-lead'),
                    search: size('.search input'),
                    fine: size('.fine-print'),
                    name: size('.name-input'),
                }
            }"""
        )
        check("가독성: 입력 칸 16px 이상", sizes["input"] >= 16, str(sizes["input"]))
        check("가독성: 항목 이름표 14px 이상", sizes["label"] >= 14, str(sizes["label"]))
        check("가독성: 날짜 보조 14px 이상", sizes["date"] >= 14, str(sizes["date"]))
        check("가독성: 영문 본문 16px", sizes["secondary"] >= 16, str(sizes["secondary"]))
        check("가독성: 안내 문장 15px 이상", sizes["lead"] >= 15, str(sizes["lead"]))
        check("가독성: 검색 칸 16px", sizes["search"] >= 16, str(sizes["search"]))
        check("가독성: 각주 13px 이상", sizes["fine"] >= 13, str(sizes["fine"]))
        check("가독성: 이름 칸 20px 이상", sizes["name"] >= 20, str(sizes["name"]))

        check("동선: 읽고 적고 기도 안내가 첫 화면에 보인다", page.locator(".passage-flow").is_visible())
        flow_box = page.locator(".passage-actions").bounding_box()
        check("동선: 첫 화면에 적기 버튼이 보인다", bool(flow_box) and flow_box["y"] + flow_box["height"] <= 844, str(flow_box))
        page.set_viewport_size({"width": 1440, "height": 900})
        page.wait_for_timeout(200)

        # ---------- 16. passage data ----------
        check("말씀 31개", len(PASSAGES) == 31)
        check("말씀 날짜 1~31", [p["day"] for p in PASSAGES] == list(range(1, 32)))
        check("말씀 구절 중복 없음", len({p["refKo"] for p in PASSAGES}) == 31)
        check("말씀 본문 모두 있음", all(p["ko"].strip() and p["en"].strip() for p in PASSAGES))
        check("시편·잠언·복음서 포함", any("시편" in p["refKo"] for p in PASSAGES) and any("잠언" in p["refKo"] for p in PASSAGES) and any("복음" in p["refKo"] for p in PASSAGES))

        # ---------- 17. reset ----------
        page.set_viewport_size({"width": 1440, "height": 900})
        page.locator('.tool-button-icon').click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="이 기기 기록 모두 지우기").click()
        page.wait_for_timeout(300)
        page.locator(".setting-danger").get_by_role("button", name="이 기기 기록 모두 지우기").click()
        page.wait_for_timeout(700)
        check("기록 지우기", storage(page)["records"] == {})
        check("기록 지운 뒤 안내", "지웠" in page.locator(".toast").inner_text())
        page.keyboard.press("Escape")

        # ---------- 18. the same day in earlier years ----------
        page.evaluate("localStorage.clear()")
        page.set_viewport_size({"width": 1440, "height": 900})
        past_year = today.year - 1
        older_year = today.year - 2
        other_day = today - timedelta(days=40)
        mm_dd = today.strftime("%m-%d")
        other_md = other_day.strftime("%m-%d")
        check("과거 연도 테스트 날짜가 다른 날", other_md != mm_dd, f"{mm_dd} vs {other_md}")

        def seeded(past_records):
            records = {
                today_key: {
                    "a": {"gratitude": "오늘 남편 감사", "meditation": "오늘 말씀 묵상", "prayer": ""},
                    "b": {"gratitude": "", "meditation": "", "prayer": ""},
                }
            }
            records.update(past_records)
            return {
                "version": 1,
                "settings": {
                    "names": ["재철", "은혜"],
                    "lang": "ko",
                    "theme": "lamp",
                    "chime": False,
                    "demoSeen": True,
                },
                "records": records,
            }

        past_only = {
            f"{past_year}-{mm_dd}": {
                "a": {"gratitude": "작년 남편 감사", "meditation": "작년 말씀 묵상", "prayer": "작년 남편 기도"},
                "b": {"gratitude": "", "meditation": "작년 아내 묵상", "prayer": ""},
            },
            f"{older_year}-{mm_dd}": {
                "a": {"gratitude": "", "meditation": "재작년 말씀 묵상", "prayer": ""},
                "b": {"gratitude": "", "meditation": "", "prayer": "재작년 아내 기도"},
            },
            f"{past_year}-{other_md}": {
                "a": {"gratitude": "다른 날짜의 기록", "meditation": "", "prayer": ""},
                "b": {"gratitude": "", "meditation": "", "prayer": ""},
            },
        }
        page.evaluate(
            f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seeded(past_only), ensure_ascii=False))})"
        )
        page.reload(wait_until="networkidle")
        settle(page)

        check("지난 기록: 섹션이 보인다", page.locator(".past").is_visible())
        check(
            "지난 기록: 제목에 오늘 날짜",
            f"지난 {today.month}월 {today.day}일의 묵상" == page.locator("#past-title").inner_text().strip(),
            page.locator("#past-title").inner_text(),
        )
        check("지난 기록: 두 해", page.locator(".past-year").count() == 2, str(page.locator(".past-year").count()))
        years = page.locator(".past-year-number").all_inner_texts()
        check("지난 기록: 최근 연도가 위", years == [str(past_year), str(older_year)], str(years))
        past_text = page.locator(".past").inner_text()
        check("지난 기록: 작년 묵상 보인다", "작년 말씀 묵상" in past_text)
        check("지난 기록: 재작년 기도 보인다", "재작년 아내 기도" in past_text)
        check("지난 기록: 두 사람 이름", "재철" in past_text and "은혜" in past_text)
        check("지난 기록: 다른 날짜는 안 보인다", "다른 날짜의 기록" not in past_text)
        check("지난 기록: 빈 상태 숨김", page.locator(".past-empty").count() == 0)
        check("지난 기록: 그날의 구절", expected["refKo"] in past_text, page.locator(".past-ref").first.inner_text())
        check("지난 기록: 남편 칸에 아내 글 없음", "작년 아내 묵상" not in page.locator(".past-col").nth(0).inner_text())
        check("지난 기록: 그날 기준 이름표", "그날의 묵상" in past_text and "오늘 말씀 묵상" not in past_text)

        cols = page.evaluate("getComputedStyle(document.querySelector('.past-cols')).gridTemplateColumns.split(' ').length")
        check("지난 기록: 데스크톱 두 칸", cols == 2, str(cols))
        past_overflow = page.evaluate(
            "() => { const el = document.querySelector('.past'); return el.scrollWidth - el.clientWidth; }"
        )
        check("지난 기록: 가로 넘침 없음", past_overflow <= 0, str(past_overflow))

        page.locator(".past-open").first.click()
        page.wait_for_timeout(600)
        check(
            "지난 기록: 그날 열기",
            f"{past_year}년 {today.month}월 {today.day}일" in page.locator(".date-main").inner_text(),
            page.locator(".date-main").inner_text(),
        )
        check("지난 기록: 그날 내용 유지", page.locator("#a-meditation").input_value() == "작년 말씀 묵상")
        page.get_by_role("button", name="오늘로 돌아가기").click()
        page.wait_for_timeout(500)

        page.get_by_role("button", name="English").first.click()
        page.wait_for_timeout(600)
        en_title = page.locator("#past-title").inner_text().strip()
        check("지난 기록: 영문 제목", en_title.startswith("On ") and "earlier years" in en_title, en_title)
        check("지난 기록: 영문 연도 표기", "years ago" in page.locator(".past").inner_text() or "a year ago" in page.locator(".past").inner_text())
        page.locator(".masthead-tools .tool-button").first.click()
        page.wait_for_timeout(500)

        page.evaluate(
            f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seeded({}), ensure_ascii=False))})"
        )
        page.reload(wait_until="networkidle")
        settle(page)
        check("지난 기록 없음: 조용한 안내", page.locator(".past-empty").is_visible())
        check("지난 기록 없음: 연도 블록 없음", page.locator(".past-year").count() == 0)
        check("지난 기록 없음: 안내 문구", "내년 오늘의 첫 기억" in page.locator(".past-empty").inner_text())

        ctx_sample = browser.new_context(viewport={"width": 1280, "height": 900})
        demo_past = ctx_sample.new_page()
        demo_past.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        demo_past.goto(BASE, wait_until="networkidle")
        demo_past.evaluate("localStorage.clear()")
        demo_past.reload(wait_until="networkidle")
        demo_past.wait_for_timeout(500)
        demo_past.get_by_role("button", name="샘플 보기").click()
        demo_past.wait_for_timeout(700)
        demo_years = demo_past.locator(".past-year-number").all_inner_texts()
        check("샘플: 지난 연도 두 해", demo_past.locator(".past-year").count() == 2, str(demo_past.locator(".past-year").count()))
        check("샘플: 지난 연도 값", demo_years == [str(past_year), str(older_year)], str(demo_years))
        check("샘플: 지난 연도 안내", demo_past.locator(".past-note").is_visible())
        check("샘플: 지난 연도 본문", "박스 더미" in demo_past.locator(".past").inner_text())
        demo_saved = demo_past.evaluate(f"localStorage.getItem('{KEY}')")
        demo_records = (json.loads(demo_saved) or {}).get("records", {}) if demo_saved else {}
        demo_past_keys = [k for k in demo_records if k.endswith(f"-{mm_dd}") and k != today_key]
        check("샘플: 지난 기록이 저장되지 않음", not demo_past_keys, str(demo_past_keys))
        demo_past.get_by_role("button", name="샘플 그만 보기").click()
        demo_past.wait_for_timeout(500)
        check("샘플 종료: 지난 기록 빈 안내", demo_past.locator(".past-empty").is_visible())
        ctx_sample.close()

        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate(
            f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(seeded(past_only), ensure_ascii=False))})"
        )
        page.reload(wait_until="networkidle")
        settle(page)
        check("지난 기록: 모바일에서 보임", page.locator(".past-year").first.is_visible())
        mobile_cols = page.evaluate("getComputedStyle(document.querySelector('.past-cols')).gridTemplateColumns.split(' ').length")
        check("지난 기록: 모바일 한 칸", mobile_cols == 1, str(mobile_cols))
        mobile_past = page.evaluate(
            "() => { const el = document.querySelector('.past'); return el.scrollWidth - el.clientWidth; }"
        )
        check("지난 기록: 모바일 가로 넘침 없음", mobile_past <= 0, str(mobile_past))
        past_sizes = page.evaluate(
            """() => {
                const size = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize)
                return { text: size('.past-field-text'), label: size('.past-field-label'), ago: size('.past-ago'), year: size('.past-year-number') }
            }"""
        )
        check("지난 기록: 본문 15px 이상", past_sizes["text"] >= 15, str(past_sizes["text"]))
        check("지난 기록: 이름표 13px 이상", past_sizes["label"] >= 13, str(past_sizes["label"]))
        check("지난 기록: 연도 28px 이상", past_sizes["year"] >= 28, str(past_sizes["year"]))
        page.set_viewport_size({"width": 1440, "height": 900})

        # ---------- 19. final screenshots with a calm, lived-in page ----------
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(600)
        page.get_by_role("button", name="그냥 시작").click()
        page.locator(".name-input").nth(0).fill("재철")
        page.locator(".name-input").nth(1).fill("은혜")
        page.locator("#a-gratitude").fill("퇴근길에 아내가 좋아하는 빵을 샀다. 같이 웃으며 먹은 저녁이 오래 남을 것 같다.")
        page.locator("#a-meditation").fill("평강은 조용한 데서 온다. 오늘은 잘 끝내는 일도 믿음이라는 생각이 들었다.")
        page.locator("#a-prayer").fill("서로 지친 날에도 짧게라도 마음을 나눌 수 있게 해 주세요.")
        page.locator("#b-gratitude").fill("남편이 아무 말 없이 챙겨 준 따뜻한 차 한 잔.")
        page.locator("#b-meditation").fill("같은 구절에서 서로 다른 위로를 받는다는 게 신기하다.")
        page.locator("#b-prayer").fill("남편의 다음 한 주가 조금 가볍기를, 잠은 깊기를.")
        settle(page)
        page.wait_for_timeout(700)

        lived_in = storage(page)
        lived_in["records"].update(
            {
                f"{past_year}-{mm_dd}": {
                    "a": {
                        "gratitude": "이사 온 첫 저녁, 박스 더미 사이에 앉아 이 자리를 처음 펼쳤다.",
                        "meditation": "“내가 평안히 눕고 자기도 하리니.” 낯선 집에서 읽으니 그 말씀이 더 가까웠다.",
                        "prayer": "낯선 동네에서도 우리가 먼저 서로에게 집이 되게 해 주세요.",
                    },
                    "b": {
                        "gratitude": "짐을 다 풀지 못했는데도 웃으면서 저녁을 먹은 일.",
                        "meditation": "같은 말씀을 읽는데 남편은 잠을, 나는 이 집을 떠올렸다.",
                        "prayer": "",
                    },
                },
                f"{older_year}-{mm_dd}": {
                    "a": {
                        "gratitude": "",
                        "meditation": "감사는 기분이 아니라 습관이라는 말을 오늘에야 알아들었다.",
                        "prayer": "지치고 서운한 날에도 짧게라도 말을 잇게 해 주세요.",
                    },
                    "b": {
                        "gratitude": "",
                        "meditation": "적어 둔 기도는 나중에 응답을 알아보게 된다는 것.",
                        "prayer": "작은 서운함이 오래 쌓이지 않게 해 주세요.",
                    },
                },
            }
        )
        page.evaluate(f"localStorage.setItem('{KEY}', {json.dumps(json.dumps(lived_in, ensure_ascii=False))})")
        page.reload(wait_until="networkidle")
        settle(page)
        page.wait_for_timeout(700)
        check("마무리 화면: 지난 기록 두 해", page.locator(".past-year").count() == 2)

        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/evening-qt-v3-desktop.png")

        page.locator(".past").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        page.locator(".past").screenshot(path=f"{OUT}/evening-qt-v3-past.png")
        page.evaluate("window.scrollBy(0, -72)")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/evening-qt-v3-past-context.png")

        page.locator(".tool-button-theme").click()
        page.wait_for_timeout(700)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/evening-qt-v3-light.png")
        page.locator(".tool-button-theme").click()
        page.wait_for_timeout(600)

        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(700)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/evening-qt-v3-mobile.png")

        page.locator(".past").scroll_into_view_if_needed()
        page.evaluate("window.scrollBy(0, -72)")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/evening-qt-v3-mobile-past.png")

        check("콘솔 오류 없음", not errors, str(errors[:3]))

        browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    if errors:
        print("console errors:", errors[:5])
    return passed, len(results)


if __name__ == "__main__":
    ok, total = run()
    raise SystemExit(0 if ok == total else 1)
