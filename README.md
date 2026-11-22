# 밤의 묵상 (Selah, evening QT)

두 사람이 하루를 마무리하며 함께 쓰는 저녁 큐티 웹 앱입니다. 오늘의 말씀을 함께 읽고,
각자의 감사와 묵상, 서로를 위한 기도 제목을 한 화면에 적습니다. 기록은 이 브라우저의
`localStorage`에만 저장되고 서버로 보내지 않습니다.

- 스택: React 19 + TypeScript + Vite 7 + Tailwind CSS 4(preflight) + lucide-react
- 언어: 한국어 기본, English 전환 (말씀은 한/영 병기)
- 화면: 웜 램프 다크(기본)와 크림 종이 라이트, 헤더에서 한 번에 전환
- 배포: `base: './'` 상대 경로 — GitHub Pages 하위 경로, Vercel, Netlify 어디서든 `dist`만 올리면 동작합니다
- 공개 주소: **https://cm-jccho.github.io/evening-qt/** (`gh-pages` 브랜치 배포)

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # tsc --noEmit + vite build → dist/
npm run preview  # dist 미리보기
```

Node 20.19 이상 또는 22.12 이상을 권장합니다(Vite 7 기준).

## 두 사람이 쓰는 두 가지 방법

1. **함께 쓰기** — 한 기기에서 남편 칸과 아내 칸에 번갈아 적습니다. 입력하는 즉시
   `evening_qt_v1`에 자동 저장됩니다(420ms 디바운스, 오른쪽 위 `저장됨`).
2. **각자 써서 합치기** — 각자의 칸 아래 `링크로 보내기`를 누르면 `링크 복사`가 먼저
   나옵니다. 카톡으로 보내고, 받은 사람이 그 링크를 열면 오늘 페이지에 두 사람 칸이 나란히
   놓입니다. 이미 페이지를 열어 둔 상태라면 `받은 링크로 합치기`에 링크(또는 코드)를
   붙여넣습니다. 내 칸은 건드리지 않고, 합친 직후 `되돌리기`로 되돌릴 수 있습니다.
   서버 없이 링크·코드 안에만 내용이 담깁니다.

## 기능

| 항목 | 구현 |
| --- | --- |
| 오늘의 저녁 말씀 | 시편·잠언·복음서·서신에서 저녁에 어울리는 31개를 날짜(1~31일)에 맞춰 보여 줍니다. `말씀 바꾸기` 하나로 목록이 열리고(지금 쓰는 구절에서 시작), 목록 안에서 한 구절을 고르거나 `말씀 직접 적기`로 직접 입력, `기본 말씀으로`로 되돌립니다 |
| 부부 2인 묵상 | 이름을 그 자리에서 바꿀 수 있는 두 칸. 감사한 일, 오늘 말씀 묵상, 서로를 위한 기도 |
| 공유 링크·코드 | 링크가 기본(`#selah=`)이고, 필요할 때만 `코드 직접 보기`로 `SELAH1-` + Base64URL(JSON: 날짜, 이름, 칸, 세 문장)을 꺼냅니다. 앱이 이미 열려 있어도 해시 변경을 감지해 합칩니다 |
| 기도 타이머 | 1·3·5분, 원형 진행 링, 일시정지·이어서·처음으로, 완료 시 `오늘 하루도 수고했어요 / Amen`. 차임은 기본 무음이고 설정에서 켭니다(Web Audio 종소리) |
| 지난 밤들 | 기본은 한 줄로 접혀 있고 `지난 기록 보기 (N일)`을 누르면 월 캘린더(기록한 날 점), 월 이동, 날짜·문장 검색, 지난 날짜 열람과 수정, `오늘로 돌아가기`가 열립니다 |
| 같은 날의 지난 묵상 | 지금 보고 있는 날짜의 `MM-DD`와 같은 날에 남긴 과거 연도(최근 3해)의 구절·두 사람의 감사/묵상/기도를 한 화면에 연도순으로 모아 보여 줍니다. 기록이 없으면 조용한 안내 한 줄만, 샘플 모드에서는 지난 두 해의 샘플이 실제 기록과 분리된 채 나타납니다 |
| 백업 | 설정에서만 JSON 내보내기/불러오기(같은 날짜는 불러온 기록으로 합침), 전체 삭제 |
| 샘플 | 첫 방문에 한 번, 오늘과 어제의 샘플을 실제 기록과 분리된 층으로 보여 줍니다. 샘플에 쓴 글은 저장되지 않습니다 |
| 화면·언어 | 램프/종이 전환과 KO/EN 전환이 즉시 저장됩니다. `prefers-reduced-motion`에서 전환을 멈춥니다 |

## 가독성과 동선 (v3)

밤에 폰이나 PC로 열어 읽는 자리라, 글자 크기와 대비를 먼저 손봤습니다.

- 본문·입력 칸 16px(모바일에서 iOS가 확대하지 않는 크기), 항목 이름표 14px, 보조 문구 13~15px,
  각주 13px. 12px 이하로 떨어지는 글자는 남기지 않았습니다.
- 웜 램프의 보조 글자(`#bdaf97`)와 종이의 보조 글자(`#5f533f`)를 밝게/진하게 올려 대비를
  8.2:1 / 7.0:1로 맞췄습니다(모두 AA 이상). 입력 칸 밑줄도 더 또렷하게 했습니다.
- 말씀 본문은 30px(모바일 24px), 한 줄 폭 42rem, 행간 1.72~1.78. 입력 칸은 16px에 행간
  1.75로 한 줄 28자 안팎입니다.
- 간격은 4px 눈금으로만 잡았습니다(Hallmark `sloplint` 24b).
- 첫 화면 동선: `말씀 읽기 → 오늘의 묵상과 기도에 한 줄 적기 → 조용한 기도 타이머`. 말씀 아래
  한 줄 안내가 이 순서를 알려 주고, `묵상 적기`가 바로 그 자리로 데려갑니다.
- 덜어낸 것: 말씀 영역의 중복 버튼(다른 말씀·직접 고르기 → `말씀 바꾸기` 하나), 타이머의
  차임 스위치(설정과 중복), 기록의 내보내기/불러오기(설정과 중복), 기록 전체를 `지난 기록
  보기` 뒤로 접기, 각주 한 줄.
- 부부 공유는 링크가 기본입니다. `링크로 보내기` → `링크 복사` → 카톡 → 상대가 열면 합쳐지고,
  이미 열려 있으면 `받은 링크로 합치기`에 붙여넣습니다. 긴 `SELAH1-` 코드는 `코드 직접 보기`
  뒤에만 보입니다.

## 성경 본문

한글은 **개역한글(1961, 퍼블릭 도메인)**, 영문은 **Berean Standard Bible(퍼블릭 도메인)**입니다.
31개 본문은 모두 공개 성경 API(`bible-api.com`)에서 실제 구절을 받아 그대로 넣었고, 지어낸
문장은 없습니다. `src/data/passages.json`이 유일한 원본이며 날짜 → 구절 매핑은
`(일 - 1) % 31`입니다. 앱 하단에도 출처를 적어 두었습니다.

## 데이터

`localStorage` 키 하나(`evening_qt_v1`)에 전체 상태가 들어갑니다.

```json
{
  "version": 1,
  "settings": {
    "names": ["재철", "은혜"],
    "lang": "ko",
    "theme": "lamp",
    "chime": false,
    "demoSeen": true
  },
  "records": {
    "2026-11-22": {
      "a": { "gratitude": "…", "meditation": "…", "prayer": "…" },
      "b": { "gratitude": "…", "meditation": "…", "prayer": "…" },
      "index": 21,
      "custom": null
    }
  }
}
```

`index`는 다른 말씀을 골랐을 때의 순번, `custom`은 직접 적은 말씀입니다. 백업 파일은
`app`, `version`, `exportedAt`, `settings`, `records`를 담은 JSON입니다.

## 검증

- `npm run build` — tsc `--noEmit` + Vite 빌드 통과
- **Hallmark `sloplint` v2.0.0** `--scope app --genre editorial` — 정적 + 렌더(`--url`) **0 FAIL, 0 REFLEX, 0 WARN**
- **Playwright E2E 139/139** — 첫 방문, 말씀 고르기·직접 적기, 두 칸 저장·새로고침 유지, 이름, 공유 링크/코드/합치기/되돌리기, 타이머(1분 완료 포함), 접힌 기록 펼치기·지난 날짜·검색, 설정의 백업 내보내기·불러오기, 테마·언어, 샘플 분리, 같은 날의 지난 묵상(과거 연도 노출·다른 날짜 미노출·빈 상태·샘플 연도·모바일 한 칸), 가독성(입력 16px·이름표 14px·지난 기록 15px), 첫 화면 동선, 대화상자, 접근성, 320~1920px 가로 오버플로 0, 콘솔 오류 0
- **Astryx(React 19 디자인 규약) 점검** — 토큰만 사용, 4px 그리드, AA 대비, 포커스 링, 40px 터치 영역, 아이콘 `aria-hidden`, 대화상자 포커스, `prefers-reduced-motion` (`tests/astryx.py`)
- 스크린샷: `browser/evening-qt-v3-desktop.png`, `browser/evening-qt-v3-mobile.png`, `browser/evening-qt-v3-past.png`, `browser/evening-qt-v3-past-context.png`, `browser/evening-qt-v3-mobile-past.png`, `browser/evening-qt-v3-light.png`, 그리고 실사이트 `browser/evening-qt-v3-live-desktop.png`·`-live-mobile.png`·`-live-light.png`
- **배포 경로 검사** — `python3 tests/deploy-path.py`: `dist`를 `/evening-qt/` 하위 폴더로 옮겨 서빙해도 모든 요청 200, 자산이 하위 경로에서 로드, 콘솔 오류 0 (8/8)

테스트 재실행(`tests/serve.sh`가 미리보기 서버를 띄우고 게이트를 차례로 돌립니다):

```bash
bash tests/serve.sh e2e astryx
# 또는 직접
npm run dev -- --port 4179 &
python3 tests/e2e.py      # BASE_URL 로 주소 변경 가능
python3 tests/astryx.py
```

## 배포

배포는 `gh-pages` 브랜치에 `dist`를 올리고 Settings → Pages → Source를 **Deploy from a branch / `gh-pages` / `(root)`**로 두는 방식입니다.
(GitHub Actions 워크플로로 옮기고 싶다면 `npm run build` 후 `dist`를 올리는 워크플로를 추가하고 Source를 GitHub Actions로 바꿉니다.)
저장소를 만들고 처음 올릴 때:

```bash
git init -b main && git add . && git commit -m "밤의 묵상 Selah"
git remote add origin https://github.com/<user>/evening-qt.git
git push -u origin main
```

`dist`만 다른 정적 호스팅에 올려도 하위 경로에서 그대로 동작합니다(모든 자산 상대 경로).

## 개인정보

기록과 공유 코드는 브라우저 안에서만 만들어집니다. 공유 코드는 받는 사람이 붙여넣기 전까지
어디에도 전송되지 않으며, 앱은 분석·추적 스크립트를 넣지 않았습니다.
