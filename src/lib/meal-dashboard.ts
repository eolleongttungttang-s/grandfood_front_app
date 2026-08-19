// notifications.ts와 짝을 이루는 나머지 meal 도메인 조회 API들을 연결한다:
// - /app/guardian/{elder_id}/{meal-status,intake-summary,nutrition-gaps,diet-history,health-report}
//   — 보호자 전용(guardian JWT만 받음, notifications.ts의 fetchGuardianNotifications와 같은
//   패턴으로 guardianLoginId의 세션을 직접 쓴다).
// - /app/elder/{elder_id}/{today-plan,nutrition-summary,diet-history}
//   — 보호자 JWT 또는 자가등록 본인 JWT 둘 다 받는다(ElderAppCaller).
//
// 두 그룹 다 응답 스키마(MealStatusResponse/DietHistoryResponse/HealthReportResponse)는
// 완전히 같다 — 어느 쪽으로 부르든 같은 파서를 쓴다. 이 파일의 모든 조회는 화면 진입 시
// 자동으로 도는 순수 조회라, 백엔드 User를 새로 만드는 resolveBackendWardAccess/
// ensureBackendWardId 대신 캐시만 읽는 resolveCachedBackendWardAccess/getCachedBackendWardId를
// 쓴다 — PR #8에서 발견/수정된 "화면 진입만으로 더미 데이터의 실제 백엔드 User가 생성되던"
// 버그와 같은 부수효과를 여기서 다시 만들지 않기 위함.

import { API_BASE_URL } from "@/lib/api-config";
import {
  getBackendGuardianSessionForWard,
  getCachedBackendWardId,
  resolveCachedBackendWardAccess,
} from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { MealTone } from "@/lib/wards";

const REQUEST_TIMEOUT_MS = 15_000;

export type DietHistoryDish = { banchanId: string; banchanName: string | null; leftoverPct: number };
export type DietHistoryEntry = {
  mealId: string;
  mealDate: string;
  mealType: string;
  /** 식후 사진까지 올라온 정밀 기록. */
  completed: boolean;
  /** 정밀 기록이든 원탭 자가 보고든, 이 끼니에 뭐라도 기록이 남았으면 true
   *  (grandfood_backend 9f01c26). */
  recorded: boolean;
  /** 원탭 자가 보고 상태 — completed면 항상 null(원탭 개념이 없음). */
  quickCheckStatus: "완식" | "남김" | null;
  dishes: DietHistoryDish[];
};

export type NutritionGapItem = {
  nutrientType: string;
  averageAmount: number;
  averageTargetAmount: number;
  fulfillmentPct: number | null;
  deficient: boolean;
};

export type IntakeSummary = {
  periodDays: number;
  averageLeftoverPct: number | null;
  averageIntakeRatePct: number | null;
};

export type HealthReportSummary = {
  reportDate: string;
  bpStatus: string | null;
  glucoseStatus: string | null;
  bmiStatus: string | null;
  riskLevel: string | null;
  summary: string | null;
};

type WardIdentity = { mockWardId: string; name: string; age: number; address: string };

async function getJson<T>(
  url: string,
  accessToken: string
): Promise<T | null> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// meal-status/intake-summary/nutrition-gaps/diet-history/health-report(guardian-app)는 전부
// guardian JWT만 받는다 — notifications.ts의 fetchGuardianNotifications와 같은 이유로
// resolveBackendWardAccess(둘 다 시도) 대신 이 어르신을 관리하는 보호자의 세션을 직접 찾는다.
//
// ensureBackendWardId(생성형)가 아니라 캐시된 backendWardId만 읽는다 — 이 함수들은 전부
// report-view.tsx 등이 화면 진입 시 자동으로 부르는 순수 조회라, PR #8에서 고쳤던 것과 같은
// 부수효과(화면 진입만으로 더미 phone/생년월일의 실제 백엔드 User가 생성되는 것)를 다시
// 만들면 안 된다 — "AI 추천받기"처럼 실제로 대상자를 생성해도 되는 명시적 액션이 아니다.
function resolveGuardianOnlyAccess(
  identity: WardIdentity
): { accessToken: string; backendWardId: string } | null {
  const session = getBackendGuardianSessionForWard(identity.mockWardId);
  if (!session) return null;
  const backendWardId = getCachedBackendWardId(identity.mockWardId);
  if (!backendWardId) return null;
  return { accessToken: session.accessToken, backendWardId };
}

function parseDietHistory(data: {
  items: {
    meal_id: string;
    meal_date: string;
    meal_type: string;
    completed: boolean;
    recorded: boolean;
    quick_check_status: string | null;
    dishes: { banchan_id: string; banchan_name: string | null; leftover_pct: number }[];
  }[];
}): DietHistoryEntry[] {
  return data.items.map((item) => ({
    mealId: item.meal_id,
    mealDate: item.meal_date,
    mealType: item.meal_type,
    completed: item.completed,
    // item.recorded ?? item.completed — 응답 타입이 recorded를 필수로 선언하고 있지만,
    // 배포 시점이 백엔드(9f01c26)보다 앞서거나 캐시된 옛 응답이 섞이면 런타임엔 그 필드
    // 자체가 없을 수 있다(타입은 거짓말을 할 수 있음, 코드 리뷰 지적) — 그 경우 completed로
    // 대체하면 최소한 예전 기준(사진 기반 완료)까지는 지켜져서, 그 필드 하나가 없다고 14일
    // 전체가 "미응답"으로 회귀하는 걸 막는다.
    recorded: item.recorded ?? item.completed,
    quickCheckStatus:
      item.quick_check_status === "완식" || item.quick_check_status === "남김" ? item.quick_check_status : null,
    dishes: item.dishes.map((d) => ({
      banchanId: d.banchan_id,
      banchanName: d.banchan_name,
      leftoverPct: d.leftover_pct,
    })),
  }));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 오늘로부터 최근 days일의 날짜 키를 과거→오늘 순으로 돌려준다("YYYY-MM-DD"). deriveMealTones가
// 만드는 톤 배열(tones[i])과 순서를 맞추는 데 쓰던 계산이었는데, records-view.tsx가 "14일 잔반
// 그리드의 칸을 탭하면 그 날짜의 상세 기록을 보여준다"(2026-08-19 피드백)를 만들면서 그리드
// 칸 인덱스 i가 정확히 어느 날짜인지 알아야 해서 deriveMealTones 밖으로 뽑아 공유한다 —
// 따로 두면 두 계산이 미묘하게 어긋날 수 있다.
//
// new Date()는 기기/브라우저 로컬 시간 기준이다 — ward-meal-dashboard.ts(보호자 화면)가 항상
// KST로 고정하는 것과 의도적으로 다르다: 이 함수는 어르신 본인 화면(records-view.tsx) 전용이라
// 어르신이 한국에 물리적으로 있다고 가정할 수 있는 반면, 보호자는 해외 출장 등 비-KST
// 타임존에서 접속할 수 있어 그 화면만 따로 고정해뒀다(코드 리뷰 지적 — 파일마다 기준이 다르게
// "보이지만" 실은 각자 맞는 가정을 쓴 것).
export function recentDateKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return keys;
}

// diet-history(끼니 단위)를 "최근 N일, 하루 하나의 완식/소량/미응답 톤" 그리드로 뭉뚱그린다 —
// ward-detail-view.tsx/records-view.tsx의 기존 mealHistory 그리드(ward-registry.ts MealTone)와
// 같은 모양을 유지하기 위함. 하루 안에 끼니가 하나도 없으면(아직 기록 없음) "미응답", 그날
// 완료된(after 사진 있음) 끼니가 하나도 없으면 "미응답", 완료된 끼니가 하나라도 있으면 그
// 끼니들의 반찬 평균 잔반율이 50% 이상이면 "소량", 그 외엔 "완식"으로 판정한다.
//
// 예전엔 "그날 끼니 중 하나라도 미완료면 그날 전체가 미응답"이었다 — 하루 3끼(아침/점심/
// 저녁) 전부 식전+식후 사진을 다 찍어야만 그날이 기록으로 인정됐던 셈이라, 어르신 입장에선
// 하루 최대 6장을 찍어야 겨우 미응답을 면했다. 대부분의 집은 매 끼니를 다 못 찍을 거라
// 실질적으로 거의 항상 미응답만 쌓이는 문제가 있었다(2026-08-14 피드백: "잔반 분석할 때
// 14일간의 기록, 어떤 식으로 기록을 남기면 좋을까?"). 완료되지 않은 끼니는 평균 잔반율
// 집계에서 빼고, 완료된 끼니가 하루 중 하나라도 있으면 그걸로 그날을 판정한다 — 세 끼 중
// 한 끼만 찍어도 그날은 "기록 있음"으로 인정된다.
//
// 완료된 끼니가 하나도 없어도, 그날 recorded인 행이 있으면(원탭 자가 보고) quick_check_status로
// 완식/남김을 정확히 구분한다(grandfood_backend 9f01c26부터 diet-history도 이 필드를 준다 —
// 처음엔 "오늘"만 meal-status로 따로 덮어썼는데, 과거 날짜도 diet-history 자체에서 바로
// 정확히 나오게 돼서 그 특수 처리는 제거했다). 완식 체크가 하나라도 있으면 "완식", 남김만
// 있으면 "소량"으로 본다.
export function deriveMealTones(items: DietHistoryEntry[], days: number): MealTone[] {
  const byDate = new Map<string, DietHistoryEntry[]>();
  for (const item of items) {
    const list = byDate.get(item.mealDate) ?? [];
    list.push(item);
    byDate.set(item.mealDate, list);
  }

  return recentDateKeys(days).map((key) => {
    const recordedItems = (byDate.get(key) ?? []).filter((m) => m.recorded);
    if (recordedItems.length === 0) return "미응답";
    // 참고(코드 리뷰 지적, 이 PR 이전부터 있던 차이라 동작은 그대로 둠): 보호자 화면
    // (ward-meal-dashboard.ts의 buildMealHistory)은 완료된 끼니가 있으면 잔반율과 무관하게
    // 무조건 "완식"으로 본다 — diet-history가 원래 dishes(반찬별 잔반율)를 안 줘서 시작된
    // 차이다. 같은 날 같은 데이터를 두고 이 화면(어르신 본인)만 잔반율까지 따져 "완식"이
    // 아니라 "소량"으로 나올 수 있다 — 실제 잔반량을 더 정확히 반영하는 쪽은 이 화면이라
    // 일부러 완화하지 않았다.
    const completedItems = recordedItems.filter((m) => m.completed);
    if (completedItems.length > 0) {
      const dishes = completedItems.flatMap((m) => m.dishes);
      const avgLeftover =
        dishes.length > 0 ? dishes.reduce((sum, d2) => sum + d2.leftoverPct, 0) / dishes.length : 0;
      return avgLeftover >= 50 ? "소량" : "완식";
    }
    const quickChecks = recordedItems
      .map((m) => m.quickCheckStatus)
      .filter((s): s is "완식" | "남김" => s !== null);
    return quickChecks.includes("완식") ? "완식" : "소량";
  });
}

// records-view.tsx/ward-detail-view.tsx의 14일 그리드에서 날짜 칸 하나를 탭했을 때 그날
// 상세(끼니별 기록/반찬별 잔반율)를 보여주는 데 쓴다(2026-08-19 피드백) — deriveMealTones가
// 하루를 톤 하나로 뭉뚱그리며 버리는 dishes/mealType 등 원본 정보를 다시 꺼내 쓰는 용도다.
export function dietHistoryForDate(items: DietHistoryEntry[], date: string): DietHistoryEntry[] {
  return items.filter((item) => item.mealDate === date);
}

export async function fetchGuardianDietHistory(
  identity: WardIdentity,
  days: number
): Promise<DietHistoryEntry[] | null> {
  const access = resolveGuardianOnlyAccess(identity);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseDietHistory>[0]>(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/diet-history?days=${days}`,
    access.accessToken
  );
  return data ? parseDietHistory(data) : null;
}

// elder-app 쪽도(today-plan/nutrition-summary/diet-history 셋 다) resolveBackendWardAccess
// 대신 캐시만 읽는다 — 위 resolveGuardianOnlyAccess와 같은 이유로, records-view.tsx가 화면
// 진입 시 자동으로 부르는 순수 조회에서 더미 데이터의 백엔드 User를 새로 만들면 안 된다.
export async function fetchElderDietHistory(
  identity: WardIdentity,
  days: number
): Promise<DietHistoryEntry[] | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseDietHistory>[0]>(
    `${API_BASE_URL}/app/elder/${access.backendWardId}/diet-history?days=${days}`,
    access.accessToken
  );
  return data ? parseDietHistory(data) : null;
}

export async function fetchGuardianIntakeSummary(
  identity: WardIdentity,
  days: number
): Promise<IntakeSummary | null> {
  const access = resolveGuardianOnlyAccess(identity);
  if (!access) return null;
  const data = await getJson<{
    period_days: number;
    average_leftover_pct: number | null;
    average_intake_rate_pct: number | null;
  }>(`${API_BASE_URL}/app/guardian/${access.backendWardId}/intake-summary?days=${days}`, access.accessToken);
  if (!data) return null;
  return {
    periodDays: data.period_days,
    averageLeftoverPct: data.average_leftover_pct,
    averageIntakeRatePct: data.average_intake_rate_pct,
  };
}

export async function fetchGuardianNutritionGaps(
  identity: WardIdentity,
  days: number
): Promise<NutritionGapItem[] | null> {
  const access = resolveGuardianOnlyAccess(identity);
  if (!access) return null;
  const data = await getJson<{
    items: {
      nutrient_type: string;
      average_amount: number;
      average_target_amount: number;
      fulfillment_pct: number | null;
      deficient: boolean;
    }[];
  }>(`${API_BASE_URL}/app/guardian/${access.backendWardId}/nutrition-gaps?days=${days}`, access.accessToken);
  if (!data) return null;
  return data.items.map((item) => ({
    nutrientType: item.nutrient_type,
    averageAmount: item.average_amount,
    averageTargetAmount: item.average_target_amount,
    fulfillmentPct: item.fulfillment_pct,
    deficient: item.deficient,
  }));
}

function parseHealthReport(data: {
  report_date: string;
  bp_status: string | null;
  glucose_status: string | null;
  bmi_status: string | null;
  risk_level: string | null;
  summary: string | null;
}): HealthReportSummary {
  return {
    reportDate: data.report_date,
    bpStatus: data.bp_status,
    glucoseStatus: data.glucose_status,
    bmiStatus: data.bmi_status,
    riskLevel: data.risk_level,
    summary: data.summary,
  };
}

// 검수 확정된 리포트가 아직 없으면 백엔드가 404를 준다(draft는 노출 안 함) — 에러가 아니라
// "아직 없음"이라 조용히 null로 돌려준다(banchan-recommendation.ts의 같은 관례).
export async function fetchGuardianHealthReport(identity: WardIdentity): Promise<HealthReportSummary | null> {
  const access = resolveGuardianOnlyAccess(identity);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseHealthReport>[0]>(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/health-report`,
    access.accessToken
  );
  return data ? parseHealthReport(data) : null;
}

export async function fetchElderNutritionSummary(identity: WardIdentity): Promise<HealthReportSummary | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseHealthReport>[0]>(
    `${API_BASE_URL}/app/elder/${access.backendWardId}/nutrition-summary`,
    access.accessToken
  );
  return data ? parseHealthReport(data) : null;
}

export type MealStatusSummary = { completedCount: number; totalExpected: number };

function parseMealStatus(data: { completed_count: number; total_expected: number }): MealStatusSummary {
  return { completedCount: data.completed_count, totalExpected: data.total_expected };
}

export async function fetchGuardianMealStatus(identity: WardIdentity): Promise<MealStatusSummary | null> {
  const access = resolveGuardianOnlyAccess(identity);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseMealStatus>[0]>(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/meal-status`,
    access.accessToken
  );
  return data ? parseMealStatus(data) : null;
}

export async function fetchElderTodayPlan(identity: WardIdentity): Promise<MealStatusSummary | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;
  const data = await getJson<Parameters<typeof parseMealStatus>[0]>(
    `${API_BASE_URL}/app/elder/${access.backendWardId}/today-plan`,
    access.accessToken
  );
  return data ? parseMealStatus(data) : null;
}

