"use client";

// "AI 반찬 추천" — 백엔드 AI 추천(월간, POST/GET .../banchan-recommendations/monthly)에 연결한다.
// 한 달치 요청을 한 번에 넣으면 그 달에 속한 각 주(월~일)마다 배송 추천이 백그라운드로 채워진다.
// 같은 달로 다시 요청해도 이미 done/generating인 주는 건드리지 않고 not_started/failed인 주만
// 새로 큐에 올라가므로, "다시 추천받기"도 이 함수를 그대로 다시 부르면 된다.

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
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

export type WardIdentity = { wardId: string; wardName: string; wardAge: number; wardAddress: string };

export type BanchanRecommendationGenerationStatus = "not_started" | "generating" | "done" | "failed";

export type MonthlyBanchanRecommendationWeek = {
  weekStartDate: string;
  generationStatus: BanchanRecommendationGenerationStatus;
  /** generationStatus가 "done"일 때만 채워진다 */
  recommendation: BanchanRecommendation | null;
  /** generationStatus가 "failed"일 때만 채워진다 */
  error: string | null;
};

export type MonthlyBanchanRecommendation = {
  userId: string;
  month: string;
  weeks: MonthlyBanchanRecommendationWeek[];
};

export const SUITABILITY_LABEL: Record<BanchanSuitability, string> = {
  recommended: "추천",
  caution: "주의",
  avoid: "피하기",
};

export const SUITABILITY_CLASS: Record<BanchanSuitability, string> = {
  recommended: "bg-risk-normal text-risk-normal-foreground",
  caution: "bg-risk-caution text-risk-caution-foreground",
  avoid: "bg-risk-high text-risk-high-foreground",
};

// risk-normal/caution/high(배경색)은 배지 위에 짙은 텍스트를 얹는 용도라 일부러 아주
// 옅게 잡혀 있다(globals.css) — 글자 없이 점만으로 구분해야 하는 곳(달력 칸 등)엔 이
// -foreground 쪽(짙은 회갈색/황토색/적갈색)을 대신 쓴다.
export const SUITABILITY_DOT_CLASS: Record<BanchanSuitability, string> = {
  recommended: "bg-risk-normal-foreground",
  caution: "bg-risk-caution-foreground",
  avoid: "bg-risk-high-foreground",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 이 날짜가 속한 달을 "YYYY-MM"으로 돌려준다(일자는 받지 않음 — 백엔드 스키마가 day 없이
// month만 받는다, GenerateMonthlyBanchanRecommendationRequest 참고).
export function getMonthString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// "YYYY-MM" 문자열끼리 달을 더하고 뺀다 — 달력 이전달/다음달 이동(banchan-recommendation-
// calendar.tsx)에 쓴다. Date 객체로 한 번 변환했다가 다시 "YYYY-MM"만 뽑아내는 이유는, 월
// 경계(12월→1월 등)를 직접 계산하는 것보다 Date의 month overflow 처리를 그대로 믿는 게
// 실수가 적기 때문이다.
export function addMonthsToMonthString(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return getMonthString(date);
}

// "YYYY-MM-DD" 문자열에 날짜를 더한다. Date를 로컬 타임존으로 파싱하면(new Date("YYYY-MM-DD"))
// 브라우저에 따라 UTC 자정으로 해석돼 로컬에서 하루 밀려 보일 수 있어서, 연/월/일을 직접
// 분해해 UTC 기준으로만 계산한다(생성 자체엔 시각 개념이 없는 순수 날짜 문자열이라 UTC로
// 계산해도 실제 날짜가 안 바뀐다).
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// weekStartDate(월요일)가 dateStr을 포함하는 주를 찾아, 그 주의 생성 상태와 그날(deliveryNumber)
// 몫 반찬만 돌려준다 — home-view.tsx/diet-view.tsx가 "오늘의 추천 반찬"을 이 달의 월간 데이터
// 안에서 바로 뽑아 쓸 때 쓴다(오늘의 식단 카드와 AI 반찬 추천 달력이 서로 다른 내용을 보여주는
// 문제를 막기 위해 — 2026-08-13 피드백). monthly가 아직 없거나(구독/조회 전) 그 날짜가 이
// monthly에 안 걸리면(다른 달을 보는 중 등) null.
export function getRecommendationForDate(
  monthly: MonthlyBanchanRecommendation | null,
  dateStr: string
): { status: BanchanRecommendationGenerationStatus; items: BanchanRecommendationItem[] } | null {
  if (!monthly) return null;
  for (const week of monthly.weeks) {
    const deliveryNumber = Math.round(
      (Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${week.weekStartDate}T00:00:00Z`)) / 86_400_000
    ) + 1;
    if (deliveryNumber < 1 || deliveryNumber > 7) continue;
    return {
      status: week.generationStatus,
      items: (week.recommendation?.items ?? []).filter((item) => item.deliveryNumber === deliveryNumber),
    };
  }
  return null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMonthlyRecommendation(data: any): MonthlyBanchanRecommendation {
  return {
    userId: data.user_id,
    month: data.month,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    weeks: (data.weeks ?? []).map((week: any) => ({
      weekStartDate: week.week_start_date,
      generationStatus: week.generation_status,
      recommendation: week.recommendation ? parseRecommendation(week.recommendation) : null,
      error: week.error ?? null,
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

// POST /health/users/{user_id}/banchan-recommendations/monthly — 그 달에 속한 모든 주의 추천
// 생성을 백그라운드로 큐에 올린다(202 Accepted, 동기로 items까지 채워서 돌려주지 않는다).
// 이미 done이거나 generating 중인 주는 건드리지 않고, not_started/failed인 주만 새로 큐에
// 올라간다 — 그래서 폴링 중에 이 함수를 반복 호출해도 안전하고 추가 비용이 없다. 실제 결과는
// fetchMonthlyBanchanRecommendation으로 generation_status가 모두 done/failed가 될 때까지
// 폴링해서 가져와야 한다.
export async function requestMonthlyBanchanRecommendation(
  identity: WardIdentity,
  month: string = getMonthString()
): Promise<MonthlyBanchanRecommendation> {
  const access = await resolveAccessOrThrow(identity);

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/banchan-recommendations/monthly`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({ month }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) throw new Error(await parseErrorMessage(response));
    return parseMonthlyRecommendation(await response.json());
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI 반찬 추천이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
}

// GET /health/users/{user_id}/banchan-recommendations/monthly/{month} — 그 달의 주별 생성 현황을
// 가져온다. 아직 생성된 게 하나도 없어도 404가 아니라 각 주가 generation_status: "not_started"인
// 상태로 200이 온다(user_id 자체가 없을 때만 404) — 그래서 호출부에서 weeks를 순회해
// generation_status를 확인해야 한다.
//
// resolveBackendWardAccess(생성형)가 아니라 resolveCachedBackendWardAccess(캐시만 읽음)를
// 쓴다 — PR #8에서 발견/수정됐던 버그(fetchElderNotifications가 ensureBackendWardId를 써서
// "홈 화면 진입만으로" 더미 phone/생년월일의 실제 백엔드 User가 생성되던 것)와 정확히 같은
// 종류의 부수효과가 여기서도 날 수 있다 — 이 함수는 useMonthlyBanchanRecommendation 훅이
// diet-view.tsx/home-view.tsx/ward-detail-view.tsx 마운트 시 자동으로 부르는 순수 조회라,
// "AI 추천받기" 버튼을 누른 적 없는 대상자의 화면에 들어가기만 해도 백엔드에 어르신 레코드가
// 생기면 안 된다. 실제 생성이 필요한 요청(POST, requestMonthlyBanchanRecommendation)은
// 여전히 resolveBackendWardAccess를 그대로 쓴다.
export async function fetchMonthlyBanchanRecommendation(
  identity: WardIdentity,
  month: string = getMonthString()
): Promise<MonthlyBanchanRecommendation | null> {
  const access = resolveCachedBackendWardAccess(identity.wardId);
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/banchan-recommendations/monthly/${month}`,
    { headers: { Authorization: `Bearer ${access.accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    return parseMonthlyRecommendation(await response.json());
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// 이 대상자가 지금까지 한 번이라도 AI 반찬 추천을 받은 적 있는지 기억해두는 로컬 플래그.
// "이 달에 진행 상황이 있는지"는 월간 GET으로 바로 알 수 있지만, 그마저도 달이 바뀌면 다시
// 전부 not_started로 보이기 때문에, 최초로 성공한 시점을 이 브라우저에 기록해두고 그걸로
// "신규 회원 온보딩" 여부를 판단한다(diet-view.tsx). 다른 기기에서 처음 여는 경우엔 이 플래그가
// 없어도 이번 달 GET에 진행 중인 주가 있으면 그걸로 바로 갱신되지만, "예전 달엔 받았는데 이번
// 달엔 아직 안 받은 상태로 새 기기에서 여는" 경우까지는 커버하지 못한다 — 이 앱의 다른
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
