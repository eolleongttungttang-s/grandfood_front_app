import { toast } from "sonner";

// fetch에 타임아웃을 붙이는 공용 헬퍼. accessibility.ts(speakRaw)와 rag-chat.ts
// (askHealthQuestion) 양쪽에 거의 같은 AbortController+setTimeout 패턴이 각자 있었는데,
// 그중 하나가 "fetch()가 헤더를 받자마자 clearTimeout을 호출해서, 그 뒤 response.blob()/
// json()으로 바디를 읽는 동안은 타임아웃이 더 이상 안 걸리는" 버그를 갖고 있었다 — 백엔드가
// 헤더는 빨리 응답하고 바디 스트리밍만 멈추면 사실상 무기한 대기하게 되는 문제. 한 곳에만
// 있으면 한 번만 고치면 되게 여기로 모은다.
//
// 타이머는 호출부가 바디까지 다 읽고 clearTimeout()을 직접 불러줄 때까지 살아있는다 —
// 그래야 바디 다운로드 중 멈추는 경우도 타임아웃이 커버한다.
//
// async 함수가 아니라 controller를 "즉시(동기적으로)" 반환한다 — accessibility.ts처럼
// "이 요청을 나중에 외부에서(다른 카드가 연달아 탭됐을 때) 취소할 수도 있어야 하는" 호출부는
// fetch가 아직 끝나기 전부터 controller 참조를 들고 있어야 한다. await 뒤에야 controller를
// 돌려주면, fetch가 진행 중인 동안 들어온 새 요청이 이전 요청을 취소할 방법이 없는 시간차가
// 생긴다.
//
// 백엔드 호출은 전부 이 함수를 거치기 때문에(backend-auth.ts/rag-chat.ts/subscription.ts 등),
// "토큰 만료" 응답(401)을 여기 한 곳에서만 감지해도 앱 전체에 적용된다 — 토큰 유효
// 시간을 백엔드에서 몇 분으로 바꾸든(core/config.py의 jwt_access_token_expire_minutes),
// 프론트는 그 값을 몰라도 되고 그냥 실제 401 응답이 왔을 때만 반응한다.
//
// 2026-08-14 수정: 예전엔 401이면 무조건(사유 불문) "세션 만료"로 취급해서 로그아웃까지
// 시켰는데, 401은 토큰이 진짜 만료된 경우 말고도(형식이 이상한 토큰, Authorization
// 헤더 자체를 깜빡한 호출 등) 뜰 수 있다 — 그런 경우까지 전부 세션을 지우고 로그인
// 화면으로 쫓아내면 실제로는 로그인 상태인 사용자를 잘못 로그아웃시키는 오탐이 생긴다.
// grandfood_backend a7426e5부터 401 바디에 code(missing_token/token_expired/
// token_invalid)가 실려오므로, 그중 진짜 만료(token_expired)일 때만 반응한다.
let sessionExpiredNotified = false;

async function notifySessionExpiredIfNeeded(response: Response): Promise<Response> {
  if (response.status !== 401 || typeof window === "undefined") return response;
  if (sessionExpiredNotified) return response;
  // 이미 로그인/회원가입 화면이면 "다시 로그인하라"는 안내가 의미 없으니 건너뛴다.
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/signup")) return response;

  // response.json()은 스트림을 한 번만 읽을 수 있어서, 실제 호출부가 나중에 바디를
  // 또 읽어야 하는 경우(에러 메시지 파싱 등)를 위해 clone()에서 읽는다. 바디가
  // JSON이 아니거나 비어있어도(네트워크 레벨 401 등) 그냥 "만료 아님"으로 취급하고
  // 조용히 넘어간다 — 여기서 실패한다고 원래 응답 처리를 막으면 안 된다.
  let code: string | undefined;
  try {
    code = (await response.clone().json())?.code;
  } catch {
    code = undefined;
  }
  if (code !== "token_expired") return response;

  sessionExpiredNotified = true;
  toast.error("로그인 기간이 만료되었습니다. 다시 로그인해주세요.");
  // "OOO님으로 계속하기"가 다음에 또 세션 없이 홈으로 들여보내지 않도록, 로그인 포인터를
  // 지워서 로그아웃 상태로 만든다(계정 목록 자체는 그대로 둔다 — session.tsx의 logout()과
  // 동일한 동작).
  window.localStorage.removeItem("grandfood-app-session");
  window.location.href = "/login";
  return response;
}

export function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): { promise: Promise<Response>; controller: AbortController; clearTimeout: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const promise = fetch(url, { ...options, signal: controller.signal }).then(
    notifySessionExpiredIfNeeded
  );
  return { promise, controller, clearTimeout: () => clearTimeout(timeoutId) };
}
