# BOJ Mock Test (BMT)

백준(BOJ) 모의 테스트를 웹으로 제공하는 프로젝트입니다. 기존 VSCode 확장(boj-mock-test)의 핵심 기능을 웹으로 옮겼고, **서버 리소스를 최소화**하는 방향으로 설계했습니다.

## 주요 기능
- **싱글/멀티 모드**
- solved.ac 기반 랜덤 문제 선정 + **백준 번호 직접 지정**
- BOJ 문제 페이지 파싱 (설명/입력/출력/샘플)
- 샘플/커스텀 테스트 실행
- 참가자 현황 실시간 공유 (SSE)
- 문제별 코드 저장 및 재접속 복구(멀티)
- 종료 후 결과 화면(코드 열람/복사)
- 에디터 자동완성 ON/OFF
- 다크/라이트 테마

## 스택
- **백엔드**: Node.js + Express
- **DB**: SQLite (better-sqlite3)
- **프론트**: Vite + React
- **실시간**: SSE
- **러너**: 로컬 실행 또는 Docker 재사용 컨테이너

## 로컬 개발 실행
1) 의존성 설치
```bash
npm install
```

2) 서버/웹 동시 실행
```bash
npm run dev
```

- 웹: http://localhost:5173
- API: http://localhost:5179

## 러너 모드
- 기본: `local` (로컬 프로세스 실행)
- 권장: `docker` (격리/보안 강화)

### Docker 러너 사용
```bash
npm run runner:init
RUNNER_MODE=docker npm run dev
```

> 러너 작업 루트 기본값: `/tmp/boj-mock-run`

## 지원 언어
- Python
- JavaScript (Node)
- C
- C++ (GNU++20)
- Java
- Kotlin

> 로컬 모드에서는 gcc/g++/javac/kotlinc 설치 필요

## 실행 제한/레이트 리밋
- 세션 동시 실행 제한: `MAX_CONCURRENT_RUNS` (기본 2)
- 실행 타임아웃: `RUN_TIMEOUT_MS` (기본 2000ms)
- 출력 제한: `MAX_STDOUT_BYTES`, `MAX_STDERR_BYTES`
- 참가자 실행 레이트 리밋: **2초에 1회**

## 세션/종료 정책
- **시험 종료 시간 경과 시 즉시 종료 상태**
  - `/api/run`, `/api/session/:id/problems` → 410
  - 기존 참가자는 결과 화면만 접근 가능
  - 신규 참가자는 참여 불가
- **종료 후 24시간 유지**, 이후 자동 정리 (TTL)

## 실시간 참여 흐름 (멀티)
1. 방 만들기 → **세션 ID / URL 생성**
2. URL 공유
3. 참여하기에서 **닉네임 + 비밀번호**로 입장
   - 동일 닉네임 재접속 시 **비밀번호 일치 필요**

## 주요 API (요약)
- `POST /api/session/solo`
- `POST /api/session/group`
- `POST /api/session/:id/join`
- `POST /api/run`
- `GET /api/session/:id/snapshot`
- `GET /api/session/:id/events` (SSE)

## 환경 변수
`server/src/config.js` 참고
- `PORT`, `DB_PATH`
- `RUNNER_MODE`, `RUNNER_WORK_ROOT`
- `RUN_TIMEOUT_MS`, `MAX_STDOUT_BYTES`, `MAX_STDERR_BYTES`
- `MAX_CONCURRENT_RUNS`, `SESSION_TTL_HOURS`

## 제한사항
- MVP 성격상 LSP 기반 자동완성은 없음 (Monaco 기본 제공만 사용)
- 로컬 러너는 격리 수준이 낮아 **운영 환경에서는 Docker 모드 권장**

---

# 개발 팁
- DB를 초기화하려면 SQLite 파일 삭제 (`server/src/config.js`의 `DB_PATH`)
- TTL 정리는 서버에서 **30분마다 자동 실행**

# boj-mock-test-web
