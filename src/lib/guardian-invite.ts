"use client";

// "공동 보호자 초대" — 형제자매 등 이미 등록된 ward를 함께 보고 있는 다른 보호자를 초대하는 코드 발급.
// ward-invite.ts("새 어르신을 시스템에 등록하는 초대")와는 다른 기능인데, guardian-profile-view.tsx가
// 자체적으로 코드 생성 로직을 useState로만 들고 있어서 새로고침하면 발급받은 코드가 사라지는 문제가 있었다.
// 다른 store들처럼 localStorage 기반으로 바꿔서 새로고침해도 유지되게 한다.

import { API_BASE_URL } from "@/lib/api-config";
import { getBackendGuardianSessionForWard, getCachedBackendWardId } from "@/lib/backend-auth";
import { createLocalStore } from "@/lib/local-store";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const REQUEST_TIMEOUT_MS = 15_000;

export type CreateGuardianInviteCommand = {
  wardIds: string[];
};

export type GuardianInviteResult = {
  code: string;
  issuedAt: string;
  expiresAt: string;
  /** 이 초대가 어떤 ward들에 대한 것인지 — 수락 시 새 보호자에게 이 ward들 접근 권한을 부여해야 한다.
   *  실제 백엔드 연동 후로는 로컬 mockWardId가 아니라 백엔드 User UUID가 담긴다 — 이 값을 로컬
   *  ward id로 되찾아 뭔가를 조회하는 호출부가 없어서(guardian-profile-view.tsx는 code만 보여줌)
   *  문제없다. */
  wardIds: string[];
};

export const guardianInviteStore = createLocalStore<GuardianInviteResult | null>(
  "grandfood-app-guardian-invite",
  null
);

// POST /guardians/invites { ward_ids } — grandfood_backend PR(issue_guardian_invite)에 연결한다.
// 범위 제한: 코드 발급까지만 한다 — 수락 시 실제 접근 권한을 부여하는 로직은 백엔드에 아직 없다
// (invite/service.py의 issue_guardian_invite 주석 참고). 이 화면도 발급까지만 하므로 지금은 그걸로
// 충분하다.
//
// cmd.wardIds는 로컬 mockWardId 목록이라, 백엔드가 요구하는 실제 User UUID로 하나씩 바꿔야 한다.
// 하나라도 백엔드 연동이 안 된 대상자가 섞여 있으면(아직 로그인해서 백엔드 User가 안 만들어짐)
// 조용히 그 대상자만 빼고 보내지 않는다 — "이 대상자는 초대에서 빠졌어요"를 사용자가 알 방법이
// 없어지므로, 명확한 에러로 실패시켜 다시 시도하게 한다.
export async function createGuardianInvite(cmd: CreateGuardianInviteCommand): Promise<GuardianInviteResult> {
  if (cmd.wardIds.length === 0) {
    throw new Error("초대할 대상자를 한 명 이상 선택해 주세요.");
  }

  // 이 보호자의 백엔드 세션은 관리하는 대상자 아무나로나 찾을 수 있다(같은 보호자 소유이므로
  // 세션은 동일) — meal-dashboard.ts의 findGuardianLoginIdForWard/getBackendGuardianSessionForWard와
  // 같은 방식.
  const guardianSession = getBackendGuardianSessionForWard(cmd.wardIds[0]);
  if (!guardianSession) {
    throw new Error("보호자 계정으로 로그인해야 초대 코드를 만들 수 있어요.");
  }

  const backendWardIds = cmd.wardIds.map((wardId) => getCachedBackendWardId(wardId));
  const missing = cmd.wardIds.filter((_, i) => !backendWardIds[i]);
  if (missing.length > 0) {
    throw new Error(
      "선택한 대상자 중 아직 백엔드 연동이 안 된 분이 있어요. 해당 대상자 화면에 한 번 들어갔다 다시 시도해 주세요."
    );
  }

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/guardians/invites`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guardianSession.accessToken}`,
      },
      body: JSON.stringify({ ward_ids: backendWardIds }),
    },
    REQUEST_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await promise;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("초대 코드 발급이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err instanceof TypeError ? new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.") : err;
  } finally {
    clearRequestTimeout();
  }
  if (!response.ok) {
    throw new Error(`초대 코드 발급에 실패했어요 (status ${response.status})`);
  }

  const data = (await response.json()) as {
    code: string;
    issuedAt: string;
    expiresAt: string;
    wardIds: string[];
  };
  const result: GuardianInviteResult = {
    code: data.code,
    issuedAt: data.issuedAt,
    expiresAt: data.expiresAt,
    wardIds: data.wardIds,
  };
  guardianInviteStore.write(result);
  return result;
}
