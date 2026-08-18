import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccessDetailed, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout, isSessionExpiredRedirectInFlight } from "@/lib/fetch-with-timeout";
const REQUEST_TIMEOUT_MS = 15_000;

export type Plan = {
  id: string;
  name: string;
  priceWon: number;
  features: string[];
};

// 백엔드가 구독 플랜을 base/premium 2단계로 확정했다(2026-08-18, 3단계
// 확장안 grandfood_backend #64는 정책 미확정으로 보류) — 화면도 기존 3단계
// (라이트/스탠다드/프리미엄)에서 2단계(라이트/스탠다드)로 맞춘다. 옛 프리미엄의
// "아침·점심·저녁 배달"과 "레시피 추천"은 스탠다드로, "레시피 추천"은 라이트에도
// 추가했다 — 나머지 프리미엄 전용 혜택(영양사 상담 무제한, SOS 우선 대응, 월간
// 리포트)은 이번 정리에서 함께 없앤다.
export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "라이트",
    priceWon: 39000,
    features: ["평일 점심 배달", "기본 건강 리포트", "레시피 추천"],
  },
  {
    id: "standard",
    name: "스탠다드",
    priceWon: 59000,
    features: [
      "매일 아침 · 점심 · 저녁 배달",
      "주간 건강 리포트",
      "영양사 상담 월 1회",
      "레시피 추천",
    ],
  },
];

export const PAYMENT_METHOD = { brand: "국민카드", last4: "4821" };

// fetchActiveSubscriptionBackend가 돌려준 실제 plan_type("base"/"premium")을 화면 표시용
// 플랜 id로 되돌린다 — 이제 백엔드 2단계와 화면 2단계가 정확히 1:1로 대응해서
// (base=basic/라이트, premium=standard/스탠다드) 그대로 매핑하면 된다. 예전엔 백엔드가
// 2단계인데 화면이 3단계(basic/standard/premium)라 "base"가 basic인지 standard인지
// 백엔드 응답만으로 알 수 없어서, 이 화면에서 마지막으로 고른 값을 별도 저장소
// (selfSubscriptionPlanStore)에 기억해뒀다가 되살리는 방식이 필요했다 — 화면이 2단계로
// 줄면서 그 모호함 자체가 없어져 더 이상 필요 없다(2026-08-18).
export function resolveDisplayPlanId(backendPlanType: string): string {
  return backendPlanType === "premium" ? "standard" : "basic";
}

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// PLANS의 "basic"/"standard"가 백엔드 PlanType "base"/"premium"과 1:1로 대응한다
// (위 resolveDisplayPlanId 참고).
function toBackendPlanType(planId: string): "base" | "premium" {
  return planId === "standard" ? "premium" : "base";
}

// 백엔드 FundingSource는 4종(self/guardian/facility/government)이지만 이 앱엔 그중 두
// 경로만 있다 — 보호자가 관리하는 대상자를 대신 결제하는 경우("guardian", 기존 유일한
// 경로)와, 대상자 본인이 자가등록해 직접 결제하는 경우("self", 이용자 본인 구독 화면
// 전용). 호출부가 매번 명시하게 해서, 두 화면을 헷갈려 잘못된 출처로 구독이 만들어지는
// 실수를 컴파일 타임에 막는다.
export type FundingSource = "self" | "guardian";

// syncSubscriptionToBackend()가 boolean 하나로만 성공/실패를 알려주던 때는 호출부가
// "왜" 실패했는지 구분할 수 없어서, 두 화면 다 실패해도 그냥 조용히 넘어가거나(보호자
// 화면 — 아래 SubscriptionView 참고) 실패 이유를 알 수 없는 뭉뚱그린 안내만 보여줬다
// (이용자 본인 화면). 이유는 4가지로 갈린다:
// - "no-backend-session": 이 대상자로 백엔드에 로그인한 적 자체가 없어서
//   resolveBackendWardAccessDetailed가 세션을 못 찾음(fetch 시도조차 안 함) — 재로그인이
//   실제로 필요한 경우.
// - "ward-sync-failed": 세션은 있는데 백엔드 User 자동생성(ensureBackendWardId)이 일시
//   실패함(fetch 시도조차 안 함) — 재로그인과 무관하고, 다시 시도하면 될 가능성이 높다.
//   예전엔 이 경우도 위 "세션 없음"과 똑같이 "no-backend-access"로 뭉뚱그려져서, 실제로는
//   로그인 상태인 사용자에게도 "재로그인하세요"라는 엉뚱한 안내가 떴다(코드 리뷰 지적).
// - "session-expired": 401을 받았고, fetch-with-timeout.ts의 전역 핸들러가 이미 "세션
//   만료" 토스트를 띄우고 /login으로 리다이렉트를 시작함 — 호출부는 자기 나름의 실패
//   토스트를 또 띄우면 안 된다(모순돼 보이고, 어차피 곧 리다이렉트된다).
// - "rejected"/"network": 그 외 일반적인 실패 — "잠시 후 다시" 안내로 충분하다.
export type SubscriptionSyncResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no-backend-session" | "ward-sync-failed" | "session-expired" | "network" | "rejected";
    };

// 위 4가지 실패 사유 → 토스트 문구 매핑. user/subscription-view.tsx와 guardian/
// subscription-view.tsx 둘 다 이 매핑이 필요한데, 각자 따로 복제해두면 나중에 문구/분류를
// 하나 고칠 때 한쪽만 고치고 잊어버리기 쉽다(애초에 reason을 4가지로 나눈 이유가 이런
// 실수를 막기 위해서인데, 매핑 자체가 흩어져 있으면 그 의미가 없어진다) — 그래서 여기
// 한 곳으로 모은다. "session-expired"는 null을 돌려준다: fetch-with-timeout.ts의 전역
// 401 핸들러가 이미 "다시 로그인해주세요" 토스트+리다이렉트를 처리 중이라, 호출부가 또
// 실패 토스트를 띄우면 방금 뜬 안내와 모순돼 보인다 — 호출부는 null이면 아무것도 안
// 띄우면 된다. "network"/"rejected"는 화면마다 동사(신청/변경)가 달라 의미가 있는
// 유일한 경우라 fallbackMessage로 호출부가 채운다.
export function subscriptionSyncFailureMessage(
  reason: Exclude<SubscriptionSyncResult, { ok: true }>["reason"],
  fallbackMessage: string
): string | null {
  switch (reason) {
    case "session-expired":
      return null;
    case "no-backend-session":
      return "이 계정으로 백엔드에 연결된 적이 없어요. 로그아웃 후 다시 로그인하면 해결될 수 있어요.";
    case "ward-sync-failed":
      return "서버와 일시적으로 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
    case "network":
    case "rejected":
      return fallbackMessage;
  }
}

// POST /subscriptions — "이 플랜으로 변경" 버튼이 부른다.
// - 보호자 화면(guardian/subscription-view.tsx): 대상자마다 별도 Subscription 행을 갖는
//   백엔드 모델 그대로, 대상자를 하나 골라서 그 대상자에게만 플랜을 반영한다(2026-08-18 —
//   전에는 보호자 계정 전체에 같은 플랜 하나를 모든 대상자에게 일괄 적용했는데, 식사 준비가
//   아예 어려운 어르신과 하루 한 끼만 챙겨도 되는 어르신처럼 대상자마다 필요한 수준이 달라
//   대상자별로 다른 플랜을 고를 수 있어야 한다는 피드백으로 바뀌었다).
// - 이용자 본인 화면(user/subscription-view.tsx): 보호자 없이 자가등록한 대상자는 이 경로가
//   없으면 건강 프로필까지 다 채워도 AI 반찬 추천이 "구독 없음(404)"으로 영구히 막힌다 —
//   health/service.py의 get_active_subscription 요구사항 참고.
// 이미 활성 구독이 있으면 새로 등록하는 순간 백엔드가 알아서 이전 걸 취소 처리한다(별도
// cancel 호출 불필요, subscription/router.py register_subscription 주석 참고).
export async function syncSubscriptionToBackend(
  identity: { mockWardId: string; name: string; age: number; address: string },
  planId: string,
  fundingSource: FundingSource
): Promise<SubscriptionSyncResult> {
  const accessResult = await resolveBackendWardAccessDetailed(identity);
  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason === "no-session" ? "no-backend-session" : "ward-sync-failed",
    };
  }
  const access = accessResult.access;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/subscriptions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({
        user_id: access.backendWardId,
        plan_type: toBackendPlanType(planId),
        funding_source: fundingSource,
        start_date: todayDateString(),
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (response.ok) return { ok: true };
    if (response.status === 401 && isSessionExpiredRedirectInFlight()) {
      return { ok: false, reason: "session-expired" };
    }
    return { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearRequestTimeout();
  }
}

// GET /subscriptions/users/{user_id} — 이 대상자에게 지금 실제로 활성 구독이 있는지
// 백엔드 기준으로 확인한다. 이용자 본인 구독 화면(user/subscription-view.tsx)과 보호자
// 화면(guardian/subscription-view.tsx, guardian-profile-view.tsx) 모두 대상자별 실제
// 구독 상태를 로컬 캐시 없이 이 함수로 직접 구한다. 활성 구독이 없으면(404) null —
// 신규/구독취소 둘 다 이 값.
//
// resolveBackendWardAccess가 아니라 resolveCachedBackendWardAccess를 쓴다 — 이건 화면
// 진입 시 자동으로 도는 순수 조회라, resolveBackendWardAccess를 쓰면 보호자 세션 경로에서
// ensureBackendWardId가 캐시 미스 시 더미 phone/생년월일로 실제 백엔드 User를 새로
// 만들어버릴 수 있다(PR#8 리뷰에서 발견/수정됐던 것과 정확히 같은 부수효과 — backend-auth.ts
// resolveCachedBackendWardAccess/fetchMonthlyBanchanRecommendation 주석 참고).
export async function fetchActiveSubscriptionBackend(identity: {
  mockWardId: string;
}): Promise<{ planType: string; fundingSource: string } | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/subscriptions/users/${access.backendWardId}`,
    { headers: { Authorization: `Bearer ${access.accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    const data = await response.json();
    return { planType: data.plan_type as string, fundingSource: data.funding_source as string };
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}
