// 보호자앱 대상자 상세("오늘 잔반율"/"최근 14일 섭취 기록")를 실제 grandfood_backend에 연결한다:
// GET /app/guardian/{elder_id}/diet-history, GET /app/guardian/{elder_id}/intake-summary.
// wards.ts의 getWardDetail()이 만드는 leftoverPercent/mealHistory는 여전히 seedFromId 기반
// 목업이다(user 쪽 records-view.tsx/reports.ts 월간 리포트가 그 값을 그대로 쓰고 있어 손대지
// 않았다) — 이 파일은 guardian 상세 화면 두 카드에서만 그 목업을 실제 값으로 덮어쓰기 위한
// 별도 조회다.
//
// intake-summary의 average_leftover_pct는 잔반 비전 분석(YOLO)이 아직 안 붙어 있어(leftover_analysis
// 원자료 없음, GrandFood_피드백_20개항목_전체정리 15번 검토 중 확인) 지금은 항상 null로 온다 —
// 그 상태를 "데이터 없음"으로 그대로 보여주는 게, 고정된 가짜 퍼센트를 계속 보여주는 것보다 정직하다.
import { API_BASE_URL } from "@/lib/api-config";
import { getBackendGuardianSessionForWard, getCachedBackendWardId } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { MealTone } from "@/lib/ward-registry";

const REQUEST_TIMEOUT_MS = 15_000;
const HISTORY_DAYS = 14;

type BackendDietHistoryItem = {
  meal_date: string; // "YYYY-MM-DD"
  completed: boolean;
};

type BackendDietHistoryResponse = {
  items: BackendDietHistoryItem[];
};

type BackendIntakeSummaryResponse = {
  average_leftover_pct: number | null;
};

export type WardMealDashboard =
  | { status: "not-linked" }
  | { status: "error"; message: string }
  | { status: "ready"; leftoverPercent: number | null; mealHistory: MealTone[] };

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      throw new Error(`식사 기록을 불러오지 못했어요 (status ${response.status})`);
    }
    return (await response.json()) as T;
  } finally {
    clearRequestTimeout();
  }
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// diet-history는 끼니 단위 레코드만 주기 때문에 하루 단위 톤으로 다시 묶는다.
// completed(식사 후 사진까지 올라옴) 끼니가 하루 중 하나라도 있으면 "완식", 끼니 기록은
// 있는데(식전 사진만) completed가 없으면 "소량", 그날 기록 자체가 없으면 "미응답"으로 본다 —
// mock의 3단계 의미를 최대한 살린 근사치일 뿐, 실제 잔반량을 재서 나온 값은 아니다.
function buildMealHistory(items: BackendDietHistoryItem[]): MealTone[] {
  const completedDates = new Set(items.filter((i) => i.completed).map((i) => i.meal_date));
  const recordedDates = new Set(items.map((i) => i.meal_date));

  const history: MealTone[] = [];
  const today = new Date();
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = toDateKey(d);
    if (completedDates.has(key)) history.push("완식");
    else if (recordedDates.has(key)) history.push("소량");
    else history.push("미응답");
  }
  return history;
}

// 이 대상자가 실제 백엔드에 등록된 적 없으면(getCachedBackendWardId) 부를 API 자체가 없다 —
// 사진 업로드/AI 질문 같은 명시적 액션을 한 번도 안 한 대상자가 정상적으로 여기 해당한다.
export async function fetchWardMealDashboard(mockWardId: string): Promise<WardMealDashboard> {
  const backendElderId = getCachedBackendWardId(mockWardId);
  if (!backendElderId) return { status: "not-linked" };

  const session = getBackendGuardianSessionForWard(mockWardId);
  if (!session) return { status: "not-linked" };

  try {
    const [dietHistory, intakeSummary] = await Promise.all([
      fetchJson<BackendDietHistoryResponse>(
        `${API_BASE_URL}/app/guardian/${backendElderId}/diet-history?days=${HISTORY_DAYS}`,
        session.accessToken
      ),
      fetchJson<BackendIntakeSummaryResponse>(
        `${API_BASE_URL}/app/guardian/${backendElderId}/intake-summary?days=1`,
        session.accessToken
      ),
    ]);
    return {
      status: "ready",
      leftoverPercent: intakeSummary.average_leftover_pct,
      mealHistory: buildMealHistory(dietHistory.items),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "error", message: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : "식사 기록을 불러오지 못했어요.",
    };
  }
}
