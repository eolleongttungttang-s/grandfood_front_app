// 실제 백엔드 서버 주소. grandfood_backend는 uvicorn 기본 포트(8000)로 뜨니 그 값을 기본값으로 뒀다.
// 이 앱은 next.config.ts에서 output:"export"로 정적 export하기 때문에, 이 값은 "실행 중에" 바뀌는
// 게 아니라 빌드할 때 process.env에서 읽혀 번들에 그대로 박힌다 — 배포 환경마다 API 주소가 다르면
// 빌드 전에 .env.local(또는 CI 환경변수)에 NEXT_PUBLIC_API_URL을 설정해야 한다.
//
// meal-log-store.ts와 backend-auth.ts가 같은 백엔드를 호출하므로 이 상수를 공유한다.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
