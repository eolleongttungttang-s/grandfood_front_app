// 보호자가 발급한 "부모님 등록" 요청 1건의 데이터 모델.
// e-sms → e-consent → e-declined 화면이 이 값을 공유한다.

import { getWardInviteByCode, type WardInviteResult } from "@/lib/ward-invite";
import { ACCOUNTS, findAccountByLoginId } from "@/lib/auth";
import { getWard } from "@/lib/wards";
import { createLocalStore } from "@/lib/local-store";

export type InviteRequest = {
  id: string;
  guardianName: string;
  elderName: string;
  elderPhone: string;
  address: string;
  addressDetail: string;
  sentAt: string;
};

const elderAccount = ACCOUNTS.find((a) => a.role === "user")!;
const guardianAccount = ACCOUNTS.find((a) => a.role === "guardian")!;
const elderWard = getWard(elderAccount.selfWardId!)!;

// 실제 동의(consent) 흐름은 더 이상 이 값을 쓰지 않는다 — 아래 resolveInviteByCode()가
// ?code= 기준으로 진짜 초대를 조회한다. 이건 /invite/sms, /invite/declined 같은
// "이런 화면이 보인다"는 걸 보여주는 부가 데모 화면 전용 더미 값으로만 남겨뒀다.
export const MOCK_INVITE: InviteRequest = {
  id: "inv-mock-01",
  guardianName: guardianAccount.name,
  elderName: elderAccount.name,
  elderPhone: elderAccount.phone,
  address: elderWard.address,
  addressDetail: "102동 1204호",
  sentAt: "오늘 오전 10:02",
};

// 어르신이 e-consent 화면에서 확인/수정하는 4개 필드.
// 보호자 입력값으로 프리필되지만, 거부 시 즉시 삭제되고 재입력이 필요하다.
export type InviteFormState = {
  elderName: string;
  elderPhone: string;
  address: string;
  addressDetail: string;
};

const EMPTY_FORM_STATE: InviteFormState = {
  elderName: "",
  elderPhone: "",
  address: "",
  addressDetail: "",
};

export const inviteFormStore = createLocalStore<InviteFormState>(
  "grandfood-app-invite-form",
  EMPTY_FORM_STATE
);

// 문자/QR 링크의 ?code=로 들어온 초대를 실제 발급 기록(ward-invite.ts)에서 조회한다.
// 백엔드에 초대 엔드포인트가 없어서(계약 문서 참고) 로컬에 저장해둔 발급 기록이 곧
// 진실 소스다 — 코드가 없거나 만료/오타면 null.
export function resolveInviteByCode(code: string | null): InviteRequest | null {
  if (!code) return null;
  const invite: WardInviteResult | null = getWardInviteByCode(code);
  if (!invite) return null;

  const guardian = findAccountByLoginId(invite.guardianLoginId);
  return {
    id: invite.code,
    guardianName: guardian?.name ?? "보호자",
    elderName: invite.name,
    elderPhone: invite.phone,
    address: "",
    addressDetail: "",
    sentAt: invite.issuedAt,
  };
}

export function toFormState(invite: InviteRequest): InviteFormState {
  return {
    elderName: invite.elderName,
    elderPhone: invite.elderPhone,
    address: invite.address,
    addressDetail: invite.addressDetail,
  };
}

// TODO(backend): POST /invites/:id/consent { ...form } 로 대체.
// 서버가 생기면 동의 시각·체크 여부도 함께 기록해야 한다.
export async function submitInviteConsent(form: InviteFormState) {
  inviteFormStore.write(form);
  return { ok: true as const };
}

// TODO(backend): POST /invites/:id/decline 로 대체 (DB 삭제 트리거 + 보호자에게 거부 사실만 통보, 사유 비공개).
export async function submitInviteDecline() {
  inviteFormStore.write(EMPTY_FORM_STATE);
  return { ok: true as const };
}
