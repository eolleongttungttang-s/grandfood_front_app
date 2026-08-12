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
import { resolveCachedBackendWardAccess } from "@/lib/backend-auth";
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

// diet-history/intake-summary 두 요청이 같은 signal을 공유한다 — 하나가 실패해서 catch로
// 빠지면 호출부가 이 signal의 컨트롤러를 abort()해서 나머지 요청도 같이 취소되게 한다
// (독립된 AbortController를 각자 들면, 하나가 이미 실패로 확정됐는데도 다른 하나는 끝까지
// 남아서 불필요하게 네트워크를 쓰게 된다).
async function fetchJson<T>(url: string, accessToken: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`식사 기록을 불러오지 못했어요 (status ${response.status})`);
  }
  return (await response.json()) as T;
}

// 대상자(어르신)가 한국 거주 기준이라 로컬 시간을 그대로 KST로 취급한다. UTC 기준(예:
// toISOString())으로 날짜를 뽑으면 KST 00:00~08:59 사이엔 하루 전 날짜로 계산돼서, "오늘"
// 앵커와 14일 그래프 전체가 하루씩 밀리는 버그가 생긴다.
function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

// "보호자 세션 + 캐시된 대상자 id" 조회는 backend-auth.ts의 resolveCachedBackendWardAccess()를
// 그대로 쓴다 — 이 파일에서 같은 걸 따로 구현해두면, 나중에 조회 순서나 자가등록 fallback
// 로직이 바뀔 때 두 곳을 따로 맞춰야 한다. 이 대상자가 실제 백엔드에 등록된 적 없으면
// (사진 업로드/AI 질문 같은 명시적 액션을 한 번도 안 한 대상자) null이 온다.
export async function fetchWardMealDashboard(mockWardId: string): Promise<WardMealDashboard> {
  const access = resolveCachedBackendWardAccess(mockWardId);
  if (!access) return { status: "not-linked" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const [dietHistory, intakeSummary] = await Promise.all([
      fetchJson<BackendDietHistoryResponse>(
        `${API_BASE_URL}/app/guardian/${access.backendWardId}/diet-history?days=${HISTORY_DAYS}`,
        access.accessToken,
        controller.signal
      ),
      fetchJson<BackendIntakeSummaryResponse>(
        `${API_BASE_URL}/app/guardian/${access.backendWardId}/intake-summary?days=1`,
        access.accessToken,
        controller.signal
      ),
    ]);
    return {
      status: "ready",
      leftoverPercent: intakeSummary.average_leftover_pct,
      mealHistory: buildMealHistory(dietHistory.items),
    };
  } catch (err) {
    // 둘 중 하나가 실패로 확정된 시점 — 아직 안 끝난 나머지 요청도 같이 취소한다.
    controller.abort();
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "error", message: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    if (err instanceof TypeError) {
      return { status: "error", message: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : "식사 기록을 불러오지 못했어요.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
