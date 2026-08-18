import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccessDetailed, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout, isSessionExpiredRedirectInFlight } from "@/lib/fetch-with-timeout";
import { createLocalStore } from "@/lib/local-store";

const REQUEST_TIMEOUT_MS = 15_000;

export type Plan = {
  id: string;
  name: string;
  priceWon: number;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "라이트",
    priceWon: 39000,
    features: ["평일 점심 배달", "기본 건강 리포트"],
  },
  {
    id: "standard",
    name: "스탠다드",
    priceWon: 59000,
    features: ["매일 점심 · 저녁 배달", "주간 건강 리포트", "영양사 상담 월 1회"],
  },
  {
    id: "premium",
    name: "프리미엄",
    priceWon: 89000,
    features: [
      "매일 아침 · 점심 · 저녁 배달",
      "주간 · 월간 건강 리포트",
      "영양사 상담 무제한",
      "SOS 우선 대응",
    ],
  },
];

export const PAYMENT_METHOD = { brand: "국민카드", last4: "4821" };

// 보호자 화면(guardian/subscription-view.tsx) 전용 — 보호자 계정 전체에 플랜 하나만
// 고르는 그 화면의 UI 모델 그대로다. 이용자 본인 구독 화면(user/subscription-view.tsx)은
// 이 키를 같이 쓰면 안 된다 — 한 브라우저에서 보호자/이용자 역할을 오가며 쓰는 이 앱의
// 데모 구조상, 보호자가 고른 플랜과 어르신 본인이 고른 플랜이 이 하나의 값을 서로
// 덮어써서 두 화면이 서로의 상태를 오염시키는 문제가 있었다 — 아래
// selfSubscriptionPlanStore로 분리했다.
export const subscriptionStore = createLocalStore<string>(
  "grandfood-app-plan",
  "standard"
);

// 이용자 본인 구독 화면 전용 — wardId별로 "마지막으로 직접 고른 플랜"만 기억한다(대상자가
// 항상 본인 한 명이라 wardId 하나짜리 맵이면 충분). 백엔드 PlanType은 base/premium
// 2단계뿐이라 "basic"과 "standard" 중 실제로 뭘 골랐었는지는 백엔드 응답만으로 복원할 수
// 없어서, 화면에 "이용중" 배지를 basic/standard 중 어느 쪽에 붙일지 구분하는 용도로만
// 쓴다 — "구독이 실제로 활성 상태인지" 자체는 이 값이 아니라 fetchActiveSubscriptionBackend
// (백엔드 조회)로만 판단한다.
export const selfSubscriptionPlanStore = createLocalStore<Record<string, string>>(
  "grandfood-app-self-plan",
  {}
);

// fetchActiveSubscriptionBackend가 돌려준 실제 plan_type("base"/"premium")을 화면에 표시할
// 3단계 플랜 id로 되돌린다 — "premium"은 그대로 premium, "base"는 basic/standard 중
// 마지막으로 골랐던 쪽(rememberedPlanId)을 우선하고, 고른 적이 없거나 그 값 자체가
// "premium"이었다면(플랜이 premium에서 base로 강등된 경우 등) "basic"으로 기본값 처리한다.
export function resolveDisplayPlanId(backendPlanType: string, rememberedPlanId?: string): string {
  if (backendPlanType === "premium") return "premium";
  return rememberedPlanId === "basic" || rememberedPlanId === "standard" ? rememberedPlanId : "basic";
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

// 백엔드 PlanType은 "base"/"premium" 2단계뿐이라(SubscriptionCreateRequest), 이 앱 목업의
// 3단계(basic/standard/premium)를 그대로 못 보낸다 — "basic"과 "standard" 둘 다 "base"로
// 뭉뚱그린다(가장 가까운 근사). 나중에 백엔드가 요금제를 세분화하면 여기만 고치면 된다.
function toBackendPlanType(planId: string): "base" | "premium" {
  return planId === "premium" ? "premium" : "base";
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

// POST /subscriptions — "이 플랜으로 변경" 버튼이 부른다.
// - 보호자 화면(guardian/subscription-view.tsx): 대상자마다 별도 Subscription 행을 갖는
//   백엔드 모델과 달리 이 화면은 보호자 계정 전체에 플랜 하나만 고르는 UI라, 보호자가
//   관리하는 모든 대상자에게 같은 플랜을 동일하게 반영한다(호출부에서 대상자 수만큼 반복 호출).
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
// 백엔드 기준으로 확인한다. subscriptionStore(로컬 store)만 보면 "standard"가 기본값이라
// 실제로는 한 번도 구독을 만든 적 없는 자가등록 이용자도 화면엔 "이용중"으로 보이는 문제가
// 있다 — 이용자 본인 구독 화면(user/subscription-view.tsx)은 그 착시를 막기 위해 이 함수로
// 실제 상태를 한 번 더 확인한다. 활성 구독이 없으면(404) null — 신규/구독취소 둘 다 이 값.
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
