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

/** 백엔드 health/schemas.py의 meal_type과 동일 — diet-day-detail.tsx의 MEAL_TYPE_LABEL과
 *  같은 개념(표시용 한글 매핑은 그쪽/MEAL_TYPE_KO_TO_EN 참고). */
export type BackendMealType = "breakfast" | "lunch" | "dinner";

export type BanchanRecommendationItem = {
  banchanId: string;
  name: string;
  nameEn: string | null;
  category: string;
  caloriePer100g: number | null;
  proteinPer100g: number | null;
  sodiumPer100g: number | null;
  carbsPer100g: number | null;
  /** 구 B2C 회차 기반(옛 데이터)에서만 채워진다 — 지금은 항상 null(delivery_number 대신
   *  serviceDate/mealType을 씀). getRecommendationForDate가 옛 데이터 호환용으로만 쓴다. */
  deliveryNumber: number | null;
  /** 그 배송/끼니 안에서 몇 번째 반찬인지 */
  slotIndex: number;
  suitability: BanchanSuitability;
  reason: string | null;
  /** 시설 대상자와, 2026-08-19 정책 변경 이후의 B2C 매일 배송 둘 다 채운다 — 구 B2C
   *  회차 기반(delivery_number만 있던 옛 데이터)만 null. */
  serviceDate: string | null;
  /** 시설 대상자와 2026-08-19 이후 B2C 매일 배송 둘 다 채운다 — 그 전에 생성된 옛 B2C
   *  일일 배송 데이터(serviceDate는 있지만 끼니 구분이 없던 상태)는 null. */
  mealType: BackendMealType | null;
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

// 반찬과 별개로 매 끼니 항상 나오는 주식(밥) — 반찬 추천 후보에서는 빠지지만(백엔드
// _exclude_rice, 2026-08-21) 실제 식판엔 항상 올라가므로, 백엔드가 카탈로그 평균값을
// 별도 필드로 내려준다(health/schemas.py StapleResponse). 사진/GPU 분석과 무관한
// "계획 단계" 값이라 실제 섭취량이 아니라 "오늘 메뉴 구성"에만 쓴다.
export type MealStaple = {
  name: string;
  category: string;
  caloriePer100g: number;
  proteinPer100g: number;
  sodiumPer100g: number;
  carbsPer100g: number;
};

// day.staple은 원래 시설(기관) 대상자 전용이었지만 2026-08-19부터 B2C도 항상 채워진다
// (health/service.py get_monthly_banchan_recommendations 참고) — 백엔드 스키마 주석은
// 아직 "시설 전용"이라 적혀 있지만 실제 코드는 이미 구분 없이 채운다.
export type MonthlyBanchanRecommendationDay = {
  serviceDate: string;
  meals: { mealType: BackendMealType; staple: MealStaple | null }[];
};

export type MonthlyBanchanRecommendation = {
  userId: string;
  month: string;
  weeks: MonthlyBanchanRecommendationWeek[];
  /** 시설/B2C 구분 없이 항상 채워진다(위 타입 주석 참고) — 응답에 아예 없으면(옛 캐시 등) null. */
  days: MonthlyBanchanRecommendationDay[] | null;
};

// SUITABILITY_LABEL/CLASS/DOT_CLASS(반찬별 "추천/주의/피하기" 배지·달력 칸 점)는 큰
// 의미가 없다는 피드백으로 뺐다(2026-08-21, home-view.tsx/banchan-recommendation-
// calendar.tsx). BanchanSuitability 타입과 item.suitability 필드 자체는 남겨둔다 —
// 백엔드가 여전히 채워주고, 나중에 다른 형태로 다시 쓸 수도 있다.

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
export type DateRecommendation = {
  status: BanchanRecommendationGenerationStatus;
  items: BanchanRecommendationItem[];
  /** 그 날짜·끼니의 밥(주식) — monthly.days에서 찾아 붙인다. days가 없거나(옛 캐시) 그
   *  날짜/끼니가 아직 없으면 null. */
  staple: MealStaple | null;
  /** BanchanRecommendation.target*와 동일 — 주 단위로 저장돼 있지만 "하루" 목표치라
   *  그 주 안의 어느 날에 물어도 같은 값이다(records-view.tsx의 영양성분 분석에서 씀). */
  targetCalorieKcal: number | null;
  targetProteinG: number | null;
  targetSodiumMg: number | null;
  targetCarbsG: number | null;
};

// mealType을 넘기면 그 끼니(아침/점심/저녁) 반찬만 골라준다 — 2026-08-19 정책 변경으로
// 시설 대상자뿐 아니라 B2C 매일 배송도 이제 serviceDate+mealType을 채우기 때문에
// (grandfood_backend BanchanDeliveryScheduler.schedule_daily_deliveries 참고) 가능해졌다.
// 안 넘기면(undefined) 그날 전체(모든 끼니 합산) — computeNutritionSnapshotForDate처럼
// "하루 총량"이 필요한 호출부용이다.
//
// 자리 찾기는 serviceDate로 먼저 하고, 그 주에 serviceDate가 채워진 항목이 하나도 없을
// 때만(옛 B2C 회차 기반 데이터) delivery_number의 "이번 주 몇 번째 배송인지" 위치 계산으로
// 폴백한다 — serviceDate 항목이 있는데 우연히 그 날짜에 없는 경우(예: 아직 생성 안 된 끼니)
// 까지 옛 로직으로 새지 않도록, "그 주에 serviceDate 데이터가 있는지"로 방식 자체를 가른다.
export function getRecommendationForDate(
  monthly: MonthlyBanchanRecommendation | null,
  dateStr: string,
  mealType?: BackendMealType
): DateRecommendation | null {
  if (!monthly) return null;
  for (const week of monthly.weeks) {
    const deliveryNumber = Math.round(
      (Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${week.weekStartDate}T00:00:00Z`)) / 86_400_000
    ) + 1;
    if (deliveryNumber < 1 || deliveryNumber > 7) continue;

    const allItems = week.recommendation?.items ?? [];
    const usesServiceDates = allItems.some((item) => item.serviceDate != null);
    const items = usesServiceDates
      ? allItems.filter(
          (item) =>
            item.serviceDate === dateStr &&
            (mealType == null || item.mealType == null || item.mealType === mealType)
        )
      : allItems.filter((item) => item.deliveryNumber === deliveryNumber); // 옛 회차 기반 데이터

    const day = monthly.days?.find((d) => d.serviceDate === dateStr);
    const staple = mealType == null ? null : day?.meals.find((m) => m.mealType === mealType)?.staple ?? null;

    return {
      status: week.generationStatus,
      items,
      staple,
      targetCalorieKcal: week.recommendation?.targetCalorieKcal ?? null,
      targetProteinG: week.recommendation?.targetProteinG ?? null,
      targetSodiumMg: week.recommendation?.targetSodiumMg ?? null,
      targetCarbsG: week.recommendation?.targetCarbsG ?? null,
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
      deliveryNumber: item.delivery_number ?? null,
      slotIndex: item.slot_index,
      suitability: item.suitability,
      reason: item.reason ?? null,
      serviceDate: item.service_date ?? null,
      mealType: item.meal_type ?? null,
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
function parseStaple(staple: any): MealStaple | null {
  if (!staple) return null;
  return {
    name: staple.name,
    category: staple.category,
    caloriePer100g: staple.calorie_per_100g,
    proteinPer100g: staple.protein_per_100g,
    sodiumPer100g: staple.sodium_per_100g,
    carbsPer100g: staple.carbs_per_100g,
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
    days: data.days
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.days.map((day: any) => ({
          serviceDate: day.service_date,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          meals: (day.meals ?? []).map((meal: any) => ({
            mealType: meal.meal_type,
            staple: parseStaple(meal.staple),
          })),
        }))
      : null,
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
// generating 중인 주는 진행 중인 백그라운드 작업과 경합하지 않도록 항상 건드리지 않고,
// not_started/failed인 주는 항상 새로 큐에 올라간다. done인 주는 force=false(기본값)면
// 그대로 두지만(그래서 폴링 중에 이 함수를 반복 호출해도 안전하고 추가 비용이 없다),
// force=true면 강제로 다시 생성한다 — 이 함수의 유일한 호출부(use-monthly-banchan-
// recommendation.ts의 request())가 "AI 추천받기"/"다시 추천받기" 버튼 클릭에만 반응하므로
// 항상 force=true로 부른다: 그래야 건강 프로필을 새로 채운 뒤 "다시 추천받기"를 눌렀을 때
// 이미 done인 주도 새 목표치/반찬으로 다시 계산된다(예전엔 done인 주가 그대로 건너뛰어져서
// 버튼을 눌러도 아무것도 안 바뀌었다 — grandfood_backend #60). 실제 결과는
// fetchMonthlyBanchanRecommendation으로 generation_status가 모두 done/failed가 될 때까지
// 폴링해서 가져와야 한다.
export async function requestMonthlyBanchanRecommendation(
  identity: WardIdentity,
  month: string = getMonthString(),
  force: boolean = true
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
      body: JSON.stringify({ month, force }),
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

export type TodayNutritionSnapshot = {
  /** true면 오늘치 반찬이 실제로 배정돼 있어 아래 값들을 믿을 수 있다는 뜻 */
  hasData: boolean;
  kcal: number;
  proteinG: number;
  sodiumMg: number;
  carbsG: number;
  targetCalorieKcal: number | null;
  targetProteinG: number | null;
  targetSodiumMg: number | null;
  targetCarbsG: number | null;
};

// records-view.tsx("오늘 영양성분 분석")와 health-insights.ts(레시피 추천용 결핍 판단)가
// 똑같이 "그날 AI가 배정한 반찬의 영양가 합 vs 그 사람의 BMR/TDEE 목표치"를 구해야 해서
// 하나로 뺐다(2026-08-18) — 따로 두면 한쪽만 계산식을 고치고 잊어버리기 쉽다. 예전엔
// health-insights.ts가 WardDetail.recommendedCombo(옛 목업 결합, 고정 임계값)로 결핍을
// 판단해서, 이 화면의 실제 목표치 기반 분석과 서로 다른 기준으로 어긋나 있었다.
//
// 원래 "오늘"(todayDateString()) 하나만 고정으로 계산했는데, ward-detail-view.tsx의 보호자
// "최근 7일 달성률" 막대 그래프(2026-08-19 추가)가 과거 여러 날짜에 대해 같은 계산을
// 반복해야 해서 날짜를 매개변수로 뺐다. computeTodayNutritionSnapshot은 그 특수 케이스
// (dateStr = 오늘)로 남겨 기존 호출부(records-view.tsx, health-insights.ts)는 그대로 둔다.
export function computeNutritionSnapshotForDate(
  monthly: MonthlyBanchanRecommendation | null,
  dateStr: string
): TodayNutritionSnapshot {
  const target = getRecommendationForDate(monthly, dateStr);
  const items = target?.items ?? [];
  // 소수 100g당 값을 여러 개 더하면 부동소수점 오차가 그대로 쌓여 "24.630000000000003"처럼
  // 노출된다(2026-08-21 버그 리포트, today-menu.ts의 sum()과 동일한 원인) — 소수점 둘째
  // 자리에서 반올림해 지운다.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    hasData: target?.status === "done" && items.length > 0,
    kcal: round2(items.reduce((sum, i) => sum + (i.caloriePer100g ?? 0), 0)),
    proteinG: round2(items.reduce((sum, i) => sum + (i.proteinPer100g ?? 0), 0)),
    sodiumMg: round2(items.reduce((sum, i) => sum + (i.sodiumPer100g ?? 0), 0)),
    carbsG: round2(items.reduce((sum, i) => sum + (i.carbsPer100g ?? 0), 0)),
    targetCalorieKcal: target?.targetCalorieKcal ?? null,
    targetProteinG: target?.targetProteinG ?? null,
    targetSodiumMg: target?.targetSodiumMg ?? null,
    targetCarbsG: target?.targetCarbsG ?? null,
  };
}

export function computeTodayNutritionSnapshot(
  monthly: MonthlyBanchanRecommendation | null
): TodayNutritionSnapshot {
  return computeNutritionSnapshotForDate(monthly, todayDateString());
}

// "최근 N일 달성률" 막대(ward-detail-view.tsx, 보호자 전용)용 — 그날 배정된 4개 영양소 중
// 목표치가 있는 것만 골라 "실제/목표" 비율을 각각 100%로 캡한 뒤 평균낸다. 4개 영양소를
// 하나의 숫자로 뭉뚱그리는 이유는, 막대 하나에 4개 값을 다 못 넣으니 "그날 전체적으로
// 얼마나 목표에 가까웠는지" 한 눈에 보이는 요약이 더 유용하기 때문이다. hasData가 false거나
// 목표치가 하나도 없으면(건강 프로필 미입력 등) null — 막대를 안 그리는 신호로 쓴다.
export function computeAchievementPct(snapshot: TodayNutritionSnapshot): number | null {
  if (!snapshot.hasData) return null;
  const pairs: Array<[number, number | null]> = [
    [snapshot.kcal, snapshot.targetCalorieKcal],
    [snapshot.proteinG, snapshot.targetProteinG],
    [snapshot.sodiumMg, snapshot.targetSodiumMg],
    [snapshot.carbsG, snapshot.targetCarbsG],
  ];
  const ratios = pairs
    .filter((pair): pair is [number, number] => pair[1] != null && pair[1] > 0)
    .map(([value, target]) => Math.min((value / target) * 100, 100));
  if (ratios.length === 0) return null;
  return Math.round(ratios.reduce((sum, r) => sum + r, 0) / ratios.length);
}

export function hasEverReceivedBanchanRecommendation(wardId: string): boolean {
  return onboardedStore.read()[wardId] === true;
}

export function markBanchanRecommendationReceived(wardId: string): void {
  if (onboardedStore.read()[wardId]) return;
  onboardedStore.update((prev) => ({ ...prev, [wardId]: true }));
}
