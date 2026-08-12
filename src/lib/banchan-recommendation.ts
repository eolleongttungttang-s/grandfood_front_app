"use client";

// "AI 반찬 추천" — 백엔드 AI 추천(POST/GET /health/users/{user_id}/banchan-recommendations)에
// 연결한다. 배송 빈도가 daily로 고정돼 있어(PR #27) 한 번의 요청으로 그 주(월~일) 7일치가
// 한꺼번에 채워진다. 같은 주로 다시 요청하면 이전 추천을 덮어쓰므로(중복 저장 안 됨, PR #28
// 응답에 이름/영양정보/RAG 근거까지 포함) "다시 추천받기"도 이 함수를 그대로 다시 부르면 된다.
// 별도 catalog 조회 API는 아직 없지만 이 응답 자체에 반찬 이름/영양정보가 다 실려오므로
// 화면에서 추가 조회가 필요 없다.

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { createLocalStore } from "@/lib/local-store";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// LLM이 반찬별 적합도를 판단하는 과정이 껴 있어 rag-chat.ts(askHealthQuestion)와 같은 상한을 둔다.
const REQUEST_TIMEOUT_MS = 30_000;

const BACKEND_SESSION_REQUIRED_MESSAGE =
  "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 AI 반찬 추천을 쓸 수 있어요.";

export type BanchanSuitability = "recommended" | "caution" | "avoid";

export type BanchanRecommendationItem = {
  banchanId: string;
  name: string;
  nameEn: string | null;
  category: string;
  caloriePer100g: number | null;
  proteinPer100g: number | null;
  sodiumPer100g: number | null;
  carbsPer100g: number | null;
  /** 그 주의 몇 번째 배송인지 (daily 고정이라 1~7) */
  deliveryNumber: number;
  /** 그 배송 안에서 몇 번째 반찬인지 */
  slotIndex: number;
  suitability: BanchanSuitability;
  reason: string | null;
};

export type ReferenceGuideline = { title: string; chunk: string };

export type BanchanRecommendation = {
  id: string;
  weekStartDate: string;
  status: "pending" | "confirmed" | "rejected";
  items: BanchanRecommendationItem[];
  /** BMR/TDEE+KDRI 기반 하루 목표치 — 온보딩에 성별/키/체중/활동량이 다 있어야 채워진다 */
  targetCalorieKcal: number | null;
  targetProteinG: number | null;
  targetSodiumMg: number | null;
  targetCarbsG: number | null;
  /** 이 추천에 실제로 근거로 쓰인 RAG 발췌 — 항목별이 아니라 추천 전체에 한 번 붙는다 */
  referenceGuidelines: ReferenceGuideline[];
};

type WardIdentity = { wardId: string; wardName: string; wardAge: number; wardAddress: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 이 날짜가 속한 주의 월요일(로컬 날짜 기준)을 "YYYY-MM-DD"로 돌려준다. UTC(toISOString)로
// 계산하면 자정 근처에 하루가 밀리는 문제가 있어서(ward-meal-dashboard.ts에서 나온 것과
// 같은 종류의 버그) 로컬 Date 필드만 사용한다.
export function getWeekStartDate(date: Date = new Date()): string {
  const day = date.getDay(); // 0=일 ~ 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRecommendation(data: any): BanchanRecommendation {
  return {
    id: data.id,
    weekStartDate: data.week_start_date,
    status: data.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (data.items ?? []).map((item: any) => ({
      banchanId: item.banchan_id,
      name: item.name,
      nameEn: item.name_en ?? null,
      category: item.category,
      caloriePer100g: item.calorie_per_100g ?? null,
      proteinPer100g: item.protein_per_100g ?? null,
      sodiumPer100g: item.sodium_per_100g ?? null,
      carbsPer100g: item.carbs_per_100g ?? null,
      deliveryNumber: item.delivery_number,
      slotIndex: item.slot_index,
      suitability: item.suitability,
      reason: item.reason ?? null,
    })),
    targetCalorieKcal: data.target_calorie_kcal ?? null,
    targetProteinG: data.target_protein_g ?? null,
    targetSodiumMg: data.target_sodium_mg ?? null,
    targetCarbsG: data.target_carbs_g ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referenceGuidelines: (data.reference_guidelines ?? []).map((g: any) => ({
      title: g.title,
      chunk: g.chunk,
    })),
  };
}

async function resolveAccessOrThrow(identity: WardIdentity) {
  const access = await resolveBackendWardAccess({
    mockWardId: identity.wardId,
    name: identity.wardName,
    age: identity.wardAge,
    address: identity.wardAddress,
  });
  if (!access) throw new Error(BACKEND_SESSION_REQUIRED_MESSAGE);
  return access;
}

async function parseErrorMessage(response: Response): Promise<string> {
  if (response.status === 404) {
    // 이 엔드포인트는 대상자에게 활성 구독 또는 건강 프로필이 없으면 404를 준다 — 온보딩이
    // 먼저 필요하다는 뜻이라, 서버 원문 대신 사용자가 다음에 뭘 해야 하는지 알려준다.
    return "구독 또는 건강 프로필이 아직 없어서 추천을 만들 수 없어요. 온보딩을 먼저 완료해 주세요.";
  }
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // 응답 바디가 JSON이 아니면 아래 기본 메시지로 폴백
  }
  return `AI 반찬 추천 요청이 실패했어요 (status ${response.status})`;
}

// POST /health/users/{user_id}/banchan-recommendations — 이번 주(또는 지정한 주) 반찬 추천을
// 새로 만든다. 같은 주로 다시 부르면 이전 추천을 덮어쓴다(별도 "재추천" 엔드포인트가 없다) —
// 그래서 "다시 추천받기"도 이 함수를 그대로 다시 호출하면 된다.
export async function requestBanchanRecommendation(
  identity: WardIdentity,
  weekStartDate: string = getWeekStartDate()
): Promise<BanchanRecommendation> {
  const access = await resolveAccessOrThrow(identity);

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/banchan-recommendations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({ week_start_date: weekStartDate }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) throw new Error(await parseErrorMessage(response));
    return parseRecommendation(await response.json());
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI 반찬 추천이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
}

// GET /health/users/{user_id}/banchan-recommendations/{week_start_date} — 이미 만들어둔 추천이
// 있으면 그대로 가져온다. 아직 그 주를 요청한 적이 없으면 백엔드가 404를 주는데, 이건 에러가
// 아니라 "아직 없음"이라 조용히 null로 돌려준다(화면 진입 시 이걸로 먼저 확인하고, 없을 때만
// "AI 추천받기" 버튼을 보여준다).
export async function fetchBanchanRecommendation(
  identity: WardIdentity,
  weekStartDate: string = getWeekStartDate()
): Promise<BanchanRecommendation | null> {
  const access = await resolveBackendWardAccess({
    mockWardId: identity.wardId,
    name: identity.wardName,
    age: identity.wardAge,
    address: identity.wardAddress,
  });
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/banchan-recommendations/${weekStartDate}`,
    { headers: { Authorization: `Bearer ${access.accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    return parseRecommendation(await response.json());
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// 이 대상자가 지금까지 한 번이라도 AI 반찬 추천을 받은 적 있는지 기억해두는 로컬 플래그.
// "특정 주(week_start_date)에 추천이 있는지"만 물어보는 API는 있어도 "전체 기간 통틀어
// 한 번이라도 받은 적 있는지" 물어보는 API는 백엔드에 없다 — 주가 바뀌면 그 주의 GET은
// 다시 404가 나기 때문에, 최초로 성공한 시점을 이 브라우저에 기록해두고 그걸로 "신규 회원
// 온보딩" 여부를 판단한다(diet-view.tsx). 다른 기기에서 처음 여는 경우엔 이 플래그가 없어도
// 이번 주 GET이 데이터를 찾아내면 그걸로 바로 갱신되지만, "예전 주엔 받았는데 이번 주엔
// 아직 안 받은 상태로 새 기기에서 여는" 경우까지는 커버하지 못한다 — 이 앱의 다른
// 로컬스토리지 기반 상태(backend-auth.ts의 세션 맵 등)와 같은 종류의 한계다.
const onboardedStore = createLocalStore<Record<string, boolean>>(
  "grandfood-app-banchan-recommendation-onboarded",
  {}
);

export function hasEverReceivedBanchanRecommendation(wardId: string): boolean {
  return onboardedStore.read()[wardId] === true;
}

export function markBanchanRecommendationReceived(wardId: string): void {
  if (onboardedStore.read()[wardId]) return;
  onboardedStore.update((prev) => ({ ...prev, [wardId]: true }));
}
