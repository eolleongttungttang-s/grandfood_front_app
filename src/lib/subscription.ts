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

// POST /subscriptions — "이 플랜으로 변경" 버튼이 부른다. 대상자마다 별도 Subscription
// 행을 갖는 백엔드 모델과 달리 이 화면(subscription-view.tsx)은 보호자 계정 전체에 플랜
// 하나만 고르는 UI라, 보호자가 관리하는 모든 대상자에게 같은 플랜을 동일하게 반영한다.
// 이미 활성 구독이 있으면 새로 등록하는 순간 백엔드가 알아서 이전 걸 취소 처리한다(별도
// cancel 호출 불필요, subscription/router.py register_subscription 주석 참고).
export async function syncSubscriptionToBackend(
  identity: { mockWardId: string; name: string; age: number; address: string },
  planId: string
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
        funding_source: "guardian",
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
