# GrandFood Front App

어르신·보호자용 클라이언트 — GrandFood의 건강정보 기반 맞춤 반찬 추천 · 잔반 사진 섭취 검증 · 보호자 모니터링을 담당하는 Next.js 앱입니다.

지자체 관리자 웹(`grandfood_front`)과 백엔드(`grandfood_backend`)는 별도 저장소입니다.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** + shadcn/ui, `lucide-react` 아이콘
- `output: "export"` 정적 export — SSR·API 라우트·미들웨어 없음, Azure Static Web Apps에 정적 HTML로 배포
- 백엔드(FastAPI)와는 REST로만 통신, 인증은 JWT

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # 값 채우기 — 아래 참고
npm run dev
```

`.env.local`에 채울 값:

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `grandfood_backend`가 뜨는 주소. 정적 export라 **빌드 시점에 고정**되며 런타임에 바뀌지 않습니다. |
| `NEXT_PUBLIC_JUSO_CONFM_KEY` | 도로명주소 팝업(juso.go.kr) API 키. `grandfood_backend/.env`의 `do_pop_key`와 같은 값을 씁니다. |

프로덕션 값은 커밋하지 않습니다 — CI 빌드는 GitHub repo `Settings > Secrets and variables > Actions > Variables`에 등록된 값을 읽습니다.

```bash
npm run build   # 정적 export (out/)
npm run lint
```

## Structure

```
src/
├── app/
│   ├── login/ · signup/ · invite/     # 로그인, 회원가입, 보호자 초대 가입
│   ├── user/                          # 어르신 본인 화면 — ATM 원칙(화면 하나·기능 하나·큰 버튼)
│   │   ├── home/ diet/ records/ assistant/ medication/ nutritionist/
│   │   ├── survey/ profile/ subscription/ notifications/ companion/ tutorial/
│   └── guardian/                      # 보호자 화면
│       ├── home/ wards/ profile/ subscription/ notifications/
│
├── components/
│   ├── user/ guardian/ invite/ app/   # 화면별 컴포넌트
│   ├── brand/                         # 로고 등 공용 브랜드 요소
│   └── ui/                            # shadcn 프리미티브
│
└── lib/                                # 백엔드 API 클라이언트 + 도메인 로직 (51개 모듈)
```

`src/lib/*.ts` 각 파일은 보통 `grandfood_backend`의 특정 도메인 하나에 대응합니다(예: `medication.ts` ↔ `domains/medication`). 파일 상단 주석에 그 도메인이 뭘 하는지, 백엔드 응답의 snake_case를 camelCase로 어떻게 바꾸는지, 화면에서 반드시 지켜야 할 제약(예: 출처 표기 필수, 확정적 문구 금지)이 있으면 그것까지 적어둡니다 — 새 화면을 그 도메인에 연결하기 전에 먼저 읽어보세요.

## 인증

- **보호자**: `grandfood_backend`에 로그인해 보호자 세션으로 대상자(ward)에 접근합니다.
- **개인(자가등록) 이용자**: 보호자 없이 본인이 직접 가입한 어르신 — 본인 세션으로 본인 데이터에 접근합니다.
- 두 경로를 함께 다뤄야 하는 호출은 `src/lib/backend-auth.ts`의 `resolveBackendWardAccess()`를 씁니다 — ①보호자 세션이 있으면 그걸로, ②없으면 개인 이용자 본인 세션으로 순서대로 시도합니다. 보호자 전용 엔드포인트(`GET/PATCH /users/{id}` 등)는 이 리졸버를 거치지 않고 보호자 세션이 없으면 호출 자체를 보내지 않습니다.

## 배포

`main` 브랜치가 Azure Static Web Apps에 자동 배포됩니다. 이 앱은 정적 export이므로 서버 사이드 로직이 전혀 없습니다 — 모든 데이터는 클라이언트에서 `grandfood_backend` REST API를 직접 호출해 가져옵니다.

## 관련 문서

- [`AGENTS.md`](./AGENTS.md) — 이 버전의 Next.js가 가진 breaking change 안내 (AI 에이전트용)
- [`docs/backend-api-contract.md`](./docs/backend-api-contract.md) — 프론트-백엔드 API 계약
- [`docs/handoff-plan-2026-08-03.md`](./docs/handoff-plan-2026-08-03.md) — 작업 항목 소스 오브 트루스

## 관련 저장소

- [`grandfood_backend`](https://github.com/eolleongttungttang-s/grandfood_backend) — FastAPI 백엔드
- `grandfood_front` — 지자체 관리자 웹 (별도 저장소)
