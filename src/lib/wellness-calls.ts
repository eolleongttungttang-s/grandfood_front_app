// 안부확인콜(TTS_CALLS) — POST /health/tts-calls/schedule. rag-chat.ts(askHealthQuestion)와
// 동일하게 보호자/본인 토큰(Authorization: Bearer)이 필요하다 — 원래는 인증 없이 user_id만
// 받았는데, 그러면 그 UUID만 알면 누구나(동의한 어르신에게) 실제 전화를 반복해서 걸리게
// 만들 수 있었다(2026-08-17 코드 리뷰 지적, 백엔드 get_current_elder_app_caller +
// verify_owner_or_self로 소유권까지 검증하도록 수정). scheduled_at을 "지금"으로 보내면
// alerts_service.py의 schedule_tts_call()이 대상자 tts_call_consent가 켜져 있는 경우 즉시
// Azure로 실제 발신한다(동의 안 했으면 이력만 남기고 발신은 건너뜀 — 백엔드가 알아서 처리,
// 프론트는 신경 쓸 필요 없음).
import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const REQUEST_TIMEOUT_MS = 15_000;

const BACKEND_SESSION_REQUIRED_MESSAGE =
  "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 안부확인알람을 요청할 수 있어요.";

// 어느 대상자인지(backendWardId)는 알아야 하고 그 대상자가 백엔드에 아직 없으면(한 번도 다른
// 기능을 안 써봤으면) 새로 만들어야 하는데, 그 확보 과정(ensureBackendWardId)엔 보호자/본인
// 세션이 필요하다 — rag-chat.ts(askHealthQuestion)와 동일하게 resolveBackendWardAccess를
// 그대로 재사용해서 accessToken까지 함께 받는다.
export async function requestWellnessCall(identity: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<void> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) throw new Error(BACKEND_SESSION_REQUIRED_MESSAGE);

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/tts-calls/schedule`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({
        user_id: access.backendWardId,
        scheduled_at: new Date().toISOString(),
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      throw new Error(`안부확인알람 요청이 실패했어요 (status ${response.status})`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("요청이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
}
