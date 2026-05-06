# Approve Bot

로컬 데스크탑 앱 (Tauri + React) 으로, 지정한 GitHub repository에서 허용된 작성자가 올린 PR을
자동으로 approve 한다.

## 요구사항

- macOS
- Node.js 18+
- Rust 1.70+
- [GitHub CLI (`gh`)](https://cli.github.com/) — `gh auth login` 으로 로그인되어 있어야 함

## 실행

처음 clone 받은 뒤 production 모드로:

```bash
pnpm install
pnpm start
```

- 첫 실행은 Rust release 빌드라 5–10분 정도 걸릴 수 있음. 이후는 캐시되어 빠름.
- 빌드 결과물: `src-tauri/target/release/bundle/macos/Approve Bot.app`

개발 중 핫리로드가 필요할 때:

```bash
pnpm tauri dev
```

## 동작 개요

- 앱 시작 시 `gh auth token` 을 호출해 GitHub 토큰을 메모리에 로드 (디스크 저장 안 함).
- 설정한 polling interval(기본 60초) 마다 등록된 repository 의 오픈 PR 을 확인.
- 다음 조건을 모두 만족하는 PR 만 approve:
  - `auto_approve_enabled` 가 켜져 있고
  - 작성자가 allowed authors 목록에 있고
  - 작성자가 본인이 아니고
  - draft 가 아니고 (`skip_drafts` 켜진 경우)
  - 본인이 아직 APPROVED 리뷰를 안 남겼고
- approve 결과는 활동 로그 + macOS 알림으로 표시.

## 설정 위치

`~/Library/Application Support/com.approvebot.app/config.json`

## 빌드

```bash
npm run tauri build
```
