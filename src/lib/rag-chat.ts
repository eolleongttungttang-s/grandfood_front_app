"use client";

// AI 도우미(구 영양사 상담 + 말벗) — 백엔드 RAG 챗봇(POST /rag/users/{user_id}/ask)에 연결한다.
// RAG 브랜치는 main에 머지됐다(PR #9, cfde9a2). 근거 문서에 없는 내용은 "모른다"고 답하도록
// 시스템 프롬프트가 짜여 있어서(domains/rag/service.py), 건강과 무관한 잡담엔 답을 못할 수 있다.

import { API_BASE_URL } from "@/lib/api-config";
import { ensureBackendWardId, getBackendGuardianSessionForWard } from "@/lib/backend-auth";

export type HealthAnswer = {
  answer: string;
  sources: string[];
  matchedConditions: string[];
};

const GUARDIAN_SESSION_REQUIRED_MESSAGE =
  "이 대상자를 관리하는 보호자 계정으로 로그인해야 AI 도우미를 쓸 수 있어요.";

// Azure OpenAI 응답이 늦어지는 경우(드묾) 요청이 무한정 매달려 있지 않도록 상한을 둔다 —
// 이 시간이 지나면 fetch가 AbortError로 실패하고 아래서 사용자에게 보이는 에러로 바꿔준다.
const REQUEST_TIMEOUT_MS = 30_000;

export async function askHealthQuestion(params: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
  query: string;
}): Promise<HealthAnswer> {
  // meal-log-store.ts의 사진 업로드와 같은 이유로 실제 백엔드 UUID가 필요하다 — 목업
  // wardId로는 이 엔드포인트를 호출할 수 없다. 이 대상자를 관리하는 보호자가 실제 백엔드
  // 로그인을 한 적이 없으면(backend-auth.ts) UUID를 확보할 방법이 없어 여기서 멈춘다.
  const backendUserId = await ensureBackendWardId({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!backendUserId) {
    throw new Error(GUARDIAN_SESSION_REQUIRED_MESSAGE);
  }

  // PR #10(75445f7)부터 이 엔드포인트가 보호자 인증을 요구한다 — user_id만 알면 아무나 남의
  // 건강정보 기반 답변을 받을 수 있던 취약점 수정. 그 대상자를 관리하는 보호자의 토큰을 그대로 쓴다.
  const guardianSession = getBackendGuardianSessionForWard(params.wardId);
  if (!guardianSession) {
    throw new Error(GUARDIAN_SESSION_REQUIRED_MESSAGE);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rag/users/${backendUserId}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guardianSession.accessToken}`,
      },
      // with_audio는 지금은 안 씀 — 백엔드 TTS 연동은 별도로 진행 예정.
      body: JSON.stringify({ query: params.query, with_audio: false }),
      signal: timeoutController.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI 도우미 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`AI 도우미 응답 요청이 실패했어요 (status ${response.status})`);
  }

  const data = await response.json();
  return {
    answer: data.answer,
    sources: data.sources ?? [],
    matchedConditions: data.matched_conditions ?? [],
  };
}
