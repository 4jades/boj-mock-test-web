# AGENTS.md — BOJ Mock Test (BMT)

이 문서는 에이전트가 프로젝트 컨텍스트를 빠르게 이해하도록 정리한 가이드입니다.

## 개요
- BOJ 문제 기반 모의 테스트 웹앱
- VSCode 확장(boj-mock-test)의 핵심 기능을 웹으로 이식
- 서버 리소스 최소화를 우선

## 핵심 플로우
### 싱글
1) 문제 선정(랜덤 or 번호 지정)
2) 세션 생성
3) 바로 시험 시작

### 멀티
1) 방 만들기 → 세션 ID/URL 생성
2) URL 공유
3) 참여하기에서 닉네임+비밀번호로 입장
4) 시작 시간이 되면 시험 시작

## 스택
- Backend: Node.js + Express
- DB: SQLite (better-sqlite3)
- Frontend: Vite + React
- Realtime: SSE
- Runner: local 또는 Docker

## 실행 방법
```bash
npm install
npm run dev
```
- web: http://localhost:5173
- api: http://localhost:5179

## 러너 모드
- `RUNNER_MODE=local` (기본)
- `RUNNER_MODE=docker` (권장)

Docker 런너:
```bash
npm run runner:init
RUNNER_MODE=docker npm run dev
```

## 지원 언어
- Python
- JavaScript
- C (gcc -std=c11)
- C++ (g++ -std=gnu++20)
- Java (javac + java)
- Kotlin (kotlinc)

> 로컬 모드는 컴파일러 설치 필요

## 주요 경로
- `web/src/App.jsx`: 프론트 전체 플로우
- `web/src/styles.css`: 디자인/레이아웃
- `server/src/index.js`: API/SSE
- `server/src/db.js`: SQLite 스키마/쿼리
- `server/src/runner.js`: 실행/컴파일
- `server/src/solved.js`: solved.ac API
- `server/src/boj.js`: BOJ 파싱

## DB 스키마 요약
- `session`: 세션 정보 (minutes, problem_ids, start_at)
- `participant`: 참가자(닉네임, 비밀번호 해시, finished_at)
- `problem_result`: 참가자별 문제 결과
- `run_log`: 최근 실행 로그
- `participant_code`: 문제별 저장 코드

## 레이트 리밋
- 참가자별 실행: **2초에 1회**
- 세션 동시 실행: 기본 2

## 종료/TTL 정책
- 시험 종료 시간 경과 시 즉시 종료 상태
  - `/api/run`, `/api/session/:id/problems` → 410
  - 기존 참가자는 결과 화면만 접근 가능
  - 신규 참가자는 참여 불가
- 종료 후 24시간 유지 후 TTL 정리
- TTL 정리는 서버에서 30분마다 수행

## UI 특이사항
- 코드/문제 split: draggable
- 스플리터 핸들 표시
- 에디터 자동완성: Monaco 기본만 사용
- 에러는 2초 후 자동 사라짐
- 로딩 중: BMT 스피너

## 주의할 점
- `App.jsx`에 로직이 집중되어 있어 리팩터링 시 영향 범위 큼
- 종료 화면 결과는 재접속 시에도 보여야 함
- 참가자 재접속은 닉네임+비밀번호 일치 필요

