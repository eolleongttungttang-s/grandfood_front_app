// 보호자가 "부모님 등록" 시 입력하는 정보 + 발급된 초대코드.
// g-invite 화면에서 사용.
//
// 코드 자체(발급/조회/소비)는 grandfood_backend의 POST/GET /wards/invites에 위임한다
// (backend-auth.ts 참고) — 예전엔 wardInvitesByCodeStore(localStorage)에만 저장해서
// 발급한 브라우저(기기)에서만 조회가 됐다. QR/문자로 다른 기기(어르신 휴대폰)에서
// 스캔하면 그 기기 localStorage엔 코드가 아예 없어 항상 "유효하지 않은 초대"였던 버그.
// wardInviteStore(마지막으로 이 기기에서 발급한 결과 1건)는 발급 직후 결과 화면
// (ward-invite-result-view.tsx)이 재조회 없이 바로 보여주기 위한 캐시로만 남긴다.

import { createLocalStore } from "@/lib/local-store";
import {
  BackendWardInviteDetail,
  consumeWardInviteBackend,
  createWardInviteBackend,
  fetchWardInviteBackend,
} from "@/lib/backend-auth";

export type WardInviteInput = {
  name: string;
  phone: string;
};

export type WardInviteResult = WardInviteInput & {
  code: string;
  issuedAt: string;
  expiresAt: string;
  smsSent: boolean;
};

export const wardInviteStore = createLocalStore<WardInviteResult | null>(
  "grandfood-app-ward-invite",
  null
);

// 보호자가 "초대코드 발급하기"를 누를 때 호출 — 실제 코드 발급은 백엔드가 한다
// (createWardInviteBackend, POST /wards/invites). 성공하면 결과 화면이 재조회 없이
// 바로 쓸 수 있게 로컬에도 캐시해둔다.
export async function createWardInvite(
  input: WardInviteInput,
  guardianLoginId: string
): Promise<{ result: WardInviteResult } | { error: string }> {
  const backendResult = await createWardInviteBackend(guardianLoginId, input);
  if ("error" in backendResult) {
    return { error: backendResult.error };
  }

  const result: WardInviteResult = {
    ...input,
    code: backendResult.code,
    issuedAt: new Date().toISOString(),
    expiresAt: backendResult.expiresAt,
    smsSent: true, // TODO(backend): 실제 SMS 발송 성공 여부로 교체
  };
  wardInviteStore.write(result);
  return { result };
}

// ?code=로 들어온 초대를 조회한다(GET /wards/invites/{code}, 비로그인) — 어느 기기에서
// 스캔해도 백엔드가 답을 알고 있어서, 발급한 기기가 아니어도 조회가 된다.
export async function getWardInviteByCode(code: string): Promise<BackendWardInviteDetail | null> {
  return fetchWardInviteBackend(code);
}

// 동의(가입 성공) 또는 거절 시 호출 — 같은 코드로 다시 들어와도 더는 유효한 초대를 못 찾게
// 만든다. 이게 없으면 같은 링크를 재방문해서 POST /users가 중복 호출되거나(백엔드에 고아
// User 레코드가 쌓임), 거절해놓고도 다시 동의할 수 있는 상태가 남는다.
export async function consumeWardInvite(code: string, accepted: boolean): Promise<void> {
  wardInviteStore.write(null);
  await consumeWardInviteBackend(code, accepted);
}
