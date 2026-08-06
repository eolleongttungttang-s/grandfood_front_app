// 보호자가 "부모님 등록" 시 입력하는 정보 + 발급된 초대코드.
// g-invite 화면에서 사용.

import { createLocalStore } from "@/lib/local-store";
import { generateInviteCode, INVITE_VALID_DAYS } from "@/lib/invite-code";

export type WardInviteInput = {
  name: string;
  phone: string;
};

export type WardInviteResult = WardInviteInput & {
  code: string;
  issuedAt: string;
  expiresAt: string;
  smsSent: boolean;
  /** 이 초대를 발급한 보호자의 로컬 계정 loginId. 백엔드엔 초대 개념이 없어서(계약 문서
   *  참고) 어르신이 동의할 때 "누구의 보호자 백엔드 세션으로 POST /users를 호출해야
   *  하는지"를 프론트에서 직접 들고 있어야 한다. */
  guardianLoginId: string;
};

export const wardInviteStore = createLocalStore<WardInviteResult | null>(
  "grandfood-app-ward-invite",
  null
);

const wardInvitesByCodeStore = createLocalStore<Record<string, WardInviteResult>>(
  "grandfood-app-ward-invites",
  {}
);

// TODO(backend): POST /wards/invites { name, phone } → { code, expiresAt }.
// 서버가 코드 발급과 어르신 번호로의 SMS 자동 발송을 함께 처리해야 한다. (백엔드에 이
// 엔드포인트가 생기기 전까지는, guardianLoginId를 코드에 묶어 로컬에 저장해뒀다가
// 어르신이 동의하는 시점에 그 보호자의 실제 백엔드 세션으로 POST /users를 호출한다 —
// backend-auth.ts의 createBackendWard() 참고.)
export async function createWardInvite(
  input: WardInviteInput,
  guardianLoginId: string
): Promise<WardInviteResult> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
  const result: WardInviteResult = {
    ...input,
    code: generateInviteCode(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    smsSent: true, // TODO(backend): 실제 SMS 발송 성공 여부로 교체
    guardianLoginId,
  };
  wardInviteStore.write(result);
  wardInvitesByCodeStore.update((prev) => ({ ...prev, [result.code]: result }));
  return result;
}

export function getWardInviteByCode(code: string): WardInviteResult | null {
  return wardInvitesByCodeStore.read()[code] ?? null;
}

// 동의(가입 성공) 또는 거절 시 호출 — 같은 코드로 다시 들어와도 더는 유효한 초대를 못 찾게
// 만든다. 이게 없으면 같은 링크를 재방문해서 POST /users가 중복 호출되거나(백엔드에 고아
// User 레코드가 쌓임), 거절해놓고도 다시 동의할 수 있는 상태가 남는다.
export function consumeWardInvite(code: string): void {
  wardInvitesByCodeStore.update((prev) => {
    if (!(code in prev)) return prev;
    const { [code]: _removed, ...rest } = prev;
    return rest;
  });
}
