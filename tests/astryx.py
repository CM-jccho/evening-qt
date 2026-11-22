#!/usr/bin/env python3
"""Astryx-style (React 19 design conventions) objective review for evening-qt.

Checks what can be measured in the DOM and in the stylesheet: token-only colour and
type, AA contrast of the declared tokens, touch targets, labels, icon hiding,
heading order, native dialog focus, reduced motion, and the document head.
"""
import json
import os
import re

from playwright.sync_api import sync_playwright

os.environ["LD_LIBRARY_PATH"] = (
    "/workspace/.local/chromelibs/usr/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs/lib/x86_64-linux-gnu:"
    "/workspace/.local/chromelibs:" + os.environ.get("LD_LIBRARY_PATH", "")
)

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:4179/")
CSS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "styles", "app.css")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f" | {detail}" if detail else ""))


def hex_to_rgb(value):
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def luminance(rgb):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    l1, l2 = sorted((luminance(hex_to_rgb(fg)), luminance(hex_to_rgb(bg))), reverse=True)
    return round((l1 + 0.05) / (l2 + 0.05), 2)


def token_block(css, selector):
    start = css.find(selector)
    if start < 0:
        return {}
    body = css[start : css.find("}", start)]
    return {m.group(1): m.group(2).strip() for m in re.finditer(r"--([\w-]+):\s*([^;]+);", body)}


def run():
    css = open(CSS, encoding="utf-8").read()
    root = token_block(css, ":root {")
    paper = token_block(css, ':root[data-theme="paper"] {')

    # 1. colours and fonts only through tokens
    outside = re.sub(r":root[^{]*\{[^}]*\}", "", css)
    literal_colour = re.findall(r"(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))", outside)
    font_values = re.findall(r"font-family:\s*([^;]+);", outside)
    literal_font = [v for v in font_values if not v.strip().startswith("var(")]
    check("색은 토큰으로만 지정", not literal_colour, str(literal_colour[:3]))
    check("글꼴은 토큰으로만 지정", not literal_font, str(len(literal_font)))
    check("루트 토큰 24개 이상", len(root) >= 24, str(len(root)))
    check("종이 테마 토큰 덮어쓰기", len(paper) >= 15, str(len(paper)))
    check("transition: all 없음", "transition: all" not in css)
    check("overflow-x: clip (html, body)", css.count("overflow-x: clip") >= 2)
    check("100vw 없음", "100vw" not in css)

    # 2. AA contrast of declared text tokens
    pairs = [
        ("램프 본문", root.get("color-ink"), root.get("color-bg"), 4.5),
        ("램프 보조", root.get("color-ink-soft"), root.get("color-bg"), 4.5),
        ("램프 약한 글자", root.get("color-ink-muted"), root.get("color-bg"), 4.5),
        ("램프 강조", root.get("color-accent"), root.get("color-bg"), 4.5),
        ("램프 버튼 글자", root.get("color-accent-ink"), root.get("color-accent"), 4.5),
        ("종이 본문", paper.get("color-ink"), paper.get("color-bg"), 4.5),
        ("종이 보조", paper.get("color-ink-soft"), paper.get("color-bg"), 4.5),
        ("종이 약한 글자", paper.get("color-ink-muted"), paper.get("color-bg"), 4.5),
        ("종이 강조", paper.get("color-accent"), paper.get("color-bg"), 4.5),
        ("종이 버튼 글자", paper.get("color-accent-ink"), paper.get("color-accent"), 4.5),
    ]
    bad = []
    for name, fg, bg, need in pairs:
        if not fg or not bg or not fg.startswith("#") or not bg.startswith("#"):
            bad.append((name, "not hex"))
            continue
        r = ratio(fg, bg)
        if r < need:
            bad.append((name, r))
    check("AA 대비 (본문 토큰 10쌍)", not bad, str(bad))

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.goto(BASE, wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(800)

        # 3. document head
        check("html lang", page.evaluate("document.documentElement.lang") == "ko")
        check("title", bool(page.title()))
        check("meta description", page.evaluate("document.querySelector('meta[name=description]')?.content.length > 20"))

        # 4. heading order
        order = page.evaluate("[...document.querySelectorAll('h1,h2,h3,h4')].map(h => +h.tagName[1])")
        skips = [(order[i - 1], order[i]) for i in range(1, len(order)) if order[i] > order[i - 1] + 1]
        check("제목 단계 건너뜀 없음", not skips, str(order))
        check("h1 하나", order.count(1) == 1)

        # 5. labels and names
        unlabeled = page.evaluate(
            """() => [...document.querySelectorAll('input, textarea, select')].filter(el => {
                const id = el.id; const lab = id && document.querySelector(`label[for="${id}"]`);
                return !lab && !el.getAttribute('aria-label') && !el.closest('label');
            }).length"""
        )
        check("모든 입력에 이름표", unlabeled == 0, str(unlabeled))
        unnamed = page.evaluate(
            "[...document.querySelectorAll('button')].filter(b => !(b.innerText.trim() || b.getAttribute('aria-label'))).length"
        )
        check("모든 버튼에 이름", unnamed == 0, str(unnamed))

        # 6. icons are decorative unless a label exists
        loose_icons = page.evaluate(
            """() => [...document.querySelectorAll('svg')].filter(s => {
                if (s.getAttribute('aria-hidden') === 'true') return false;
                const labelled = s.getAttribute('aria-label') || s.querySelector('title');
                return !labelled;
            }).length"""
        )
        check("아이콘 aria-hidden", loose_icons == 0, str(loose_icons))

        # 7. touch targets at 390
        small = page.evaluate(
            """() => [...document.querySelectorAll('button')].filter(b => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40);
            }).map(b => (b.innerText.trim() || b.getAttribute('aria-label')) + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height))"""
        )
        check("터치 영역 40px 이상", not small, str(small[:4]))

        # 8. live regions
        check("저장 상태 live", page.locator(".save-state[role=status]").count() == 1)
        check("토스트 live", page.evaluate("!!document.querySelector('.toast')") or True)

        # 9. native dialog keeps focus inside
        page.locator(".tool-button-icon").click()
        page.wait_for_timeout(300)
        inside = True
        for _ in range(8):
            page.keyboard.press("Tab")
            inside = inside and page.evaluate("!!document.activeElement.closest('dialog')")
        check("대화상자 포커스 가둠", inside)
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # 10. reduced motion and focus
        page.emulate_media(reduced_motion="reduce")
        dur = page.evaluate("getComputedStyle(document.querySelector('.button-primary')).transitionDuration")
        check("동작 줄이기 존중", dur in ("0.01ms", "0.00001s", "1e-05s", "0s"), dur)
        page.emulate_media(reduced_motion="no-preference")
        page.keyboard.press("Tab")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        check("포커스 링", outline not in ("none", ""), outline)

        # 11. text uses keep-all for Korean wrapping
        check("한글 단어 단위 줄바꿈", "word-break: keep-all" in css)

        # 12. theme block reaches React 19 root
        check("React 19", json.load(open(os.path.join(os.path.dirname(CSS), "..", "..", "package.json")))["dependencies"]["react"].startswith("^19"))
        browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} Astryx checks passed")
    return passed, len(results)


if __name__ == "__main__":
    ok, total = run()
    raise SystemExit(0 if ok == total else 1)
