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
};

export const wardInviteStore = createLocalStore<WardInviteResult | null>(
  "grandfood-app-ward-invite",
  null
);

// TODO(backend): POST /wards/invites { name, phone } → { code, expiresAt }.
// 서버가 코드 발급과 어르신 번호로의 SMS 자동 발송을 함께 처리해야 한다.
export async function createWardInvite(input: WardInviteInput): Promise<WardInviteResult> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
  const result: WardInviteResult = {
    ...input,
    code: generateInviteCode(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    smsSent: true, // TODO(backend): 실제 SMS 발송 성공 여부로 교체
  };
  wardInviteStore.write(result);
  return result;
}
