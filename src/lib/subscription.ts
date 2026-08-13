import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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

export const subscriptionStore = createLocalStore<string>(
  "grandfood-app-plan",
  "standard"
);

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
): Promise<boolean> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) return false;

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
    return response.ok;
  } catch {
    return false;
  } finally {
    clearRequestTimeout();
  }
}

// GET /subscriptions/users/{user_id} — 이 대상자에게 지금 실제로 활성 구독이 있는지
// 백엔드 기준으로 확인한다. subscriptionStore(로컬 store)만 보면 "standard"가 기본값이라
// 실제로는 한 번도 구독을 만든 적 없는 자가등록 이용자도 화면엔 "이용중"으로 보이는 문제가
// 있다 — 이용자 본인 구독 화면(user/subscription-view.tsx)은 그 착시를 막기 위해 이 함수로
// 실제 상태를 한 번 더 확인한다. 활성 구독이 없으면(404) null — 신규/구독취소 둘 다 이 값.
export async function fetchActiveSubscriptionBackend(identity: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<{ planType: string } | null> {
  const access = await resolveBackendWardAccess(identity);
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
    return { planType: data.plan_type as string };
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}
