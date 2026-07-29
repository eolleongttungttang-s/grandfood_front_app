// 보호자가 발급한 "부모님 등록" 요청 1건의 데이터 모델.
// e-sms → e-consent → e-declined 화면이 이 값을 공유한다.

import { ACCOUNTS } from "@/lib/auth";
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

// TODO(backend): GET /invites/:code 로 대체. 지금은 문자/QR 링크로 들어왔다고 가정한 더미 값.
// 기존 목업 계정(박순자=이용자, 박지훈=보호자)을 그대로 사용해 다른 화면들과 데이터가 어긋나지 않게 한다.
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

function toFormState(invite: InviteRequest): InviteFormState {
  return {
    elderName: invite.elderName,
    elderPhone: invite.elderPhone,
    address: invite.address,
    addressDetail: invite.addressDetail,
  };
}

const EMPTY_FORM_STATE: InviteFormState = {
  elderName: "",
  elderPhone: "",
  address: "",
  addressDetail: "",
};

export const inviteFormStore = createLocalStore<InviteFormState>(
  "grandfood-app-invite-form",
  toFormState(MOCK_INVITE)
);

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
