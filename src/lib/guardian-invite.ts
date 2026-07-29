"use client";

// "공동 보호자 초대" — 형제자매 등 이미 등록된 ward를 함께 보고 있는 다른 보호자를 초대하는 코드 발급.
// ward-invite.ts("새 어르신을 시스템에 등록하는 초대")와는 다른 기능인데, guardian-profile-view.tsx가
// 자체적으로 코드 생성 로직을 useState로만 들고 있어서 새로고침하면 발급받은 코드가 사라지는 문제가 있었다.
// 다른 store들처럼 localStorage 기반으로 바꿔서 새로고침해도 유지되게 한다.

import { createLocalStore } from "@/lib/local-store";
import { generateInviteCode, INVITE_VALID_DAYS } from "@/lib/invite-code";

export type CreateGuardianInviteCommand = {
  wardIds: string[];
};

export type GuardianInviteResult = {
  code: string;
  issuedAt: string;
  expiresAt: string;
};

export const guardianInviteStore = createLocalStore<GuardianInviteResult | null>(
  "grandfood-app-guardian-invite",
  null
);

// TODO(backend): POST /guardians/invites { wardIds } — 공동 보호자 초대 코드 발급.
// 실제 백엔드는 어떤 ward들에 대한 초대인지(wardIds)를 저장해뒀다가, 초대 수락 시 그 ward들에 대한
// 접근 권한을 새 보호자에게 부여해야 한다. 목업은 코드/만료일 계산만 흉내내고 wardIds는 저장하지 않는다.
export async function createGuardianInvite(_cmd: CreateGuardianInviteCommand): Promise<GuardianInviteResult> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
  const result: GuardianInviteResult = {
    code: generateInviteCode(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  guardianInviteStore.write(result);
  return result;
}
