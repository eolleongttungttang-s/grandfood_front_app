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
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { MealTone } from "@/lib/ward-registry";

const REQUEST_TIMEOUT_MS = 15_000;
const HISTORY_DAYS = 14;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type BackendDietHistoryItem = {
  meal_date: string; // "YYYY-MM-DD"
  completed: boolean;
  /** 사진 기반 완료든 원탭 자가 보고든, 이 끼니에 뭐라도 기록이 남았으면 true
   *  (grandfood_backend 9f01c26). */
  recorded: boolean;
  quick_check_status: string | null;
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

async function parseJson<T>(promise: Promise<Response>): Promise<T> {
  const response = await promise;
  if (!response.ok) {
    throw new Error(`식사 기록을 불러오지 못했어요 (status ${response.status})`);
  }
  return (await response.json()) as T;
}

// "오늘"을 실제 기기/브라우저 시간대와 무관하게 항상 KST로 고정해서 구한다. 이 모듈은
// GuardianWardDetailPageClient에서 "보호자의 브라우저"가 호출한다 — 어르신이 아니라
// 보호자가 비-KST 타임존(해외 출장 등)에서 접속하면 device-local Date()는 KST가 아니게
// 된다(코드 리뷰 지적, 예전엔 "대상자가 한국 거주"라는 잘못된 전제로 device-local을 그대로
// KST 취급했었다). Date.now()는 항상 UTC 기준 절대시각이므로, 여기에 KST 오프셋(+9h)을
// 더한 뒤 UTC 게터로 필드를 읽으면 기기 시간대에 영향받지 않는 KST 날짜를 얻는다.
function nowInKST(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

function toDateKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// diet-history는 끼니 단위 레코드만 주기 때문에 하루 단위 톤으로 다시 묶는다.
// completed(식사 후 사진까지 올라옴) 끼니가 하루 중 하나라도 있으면 "완식", 그렇지 않고
// 원탭 자가 보고(quick_check_status)가 있으면 완식 체크가 하나라도 있으면 "완식", 남김만
// 있으면 "소량"으로 본다(grandfood_backend 9f01c26) — 완료도 원탭도 전혀 없으면(recorded
// 인 행 자체가 없으면) "미응답"이다.
function buildMealHistory(items: BackendDietHistoryItem[]): MealTone[] {
  const byDate = new Map<string, BackendDietHistoryItem[]>();
  for (const item of items) {
    const list = byDate.get(item.meal_date) ?? [];
    list.push(item);
    byDate.set(item.meal_date, list);
  }

  const history: MealTone[] = [];
  const today = nowInKST();
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    const key = toDateKey(d);
    const recordedItems = (byDate.get(key) ?? []).filter((i) => i.recorded);
    if (recordedItems.length === 0) {
      history.push("미응답");
      continue;
    }
    if (recordedItems.some((i) => i.completed)) {
      history.push("완식");
      continue;
    }
    const hasFullMeal = recordedItems.some((i) => i.quick_check_status === "완식");
    history.push(hasFullMeal ? "완식" : "소량");
  }
  return history;
}

// "보호자 세션 + 캐시된 대상자 id" 조회는 backend-auth.ts의 resolveCachedBackendWardAccess()를
// 그대로 쓴다 — 이 파일에서 같은 걸 따로 구현해두면, 나중에 조회 순서나 자가등록 fallback
// 로직이 바뀔 때 두 곳을 따로 맞춰야 한다. 이 대상자가 실제 백엔드에 등록된 적 없으면
// (사진 업로드/AI 질문 같은 명시적 액션을 한 번도 안 한 대상자) null이 온다.
//
// options.signal: 호출부(page-client.tsx)가 대상자를 빠르게 넘나들 때 이전 요청을 실제로
// 취소하고 싶으면 넘긴다 — 안 넘기면(옵션이라) 예전처럼 응답이 오든 말든 끝까지 진행된다.
// options.viewerGuardianLoginId: 지금 로그인한 보호자 계정을 resolveCachedBackendWardAccess에
// 같이 넘겨서, 이 대상자를 관리하는 보호자와 다르면 캐시된 다른 보호자 토큰을 쓰지 않도록
// 한 번 더 확인한다(코드 리뷰 지적 — backend-auth.ts의 해당 주석 참고).
export async function fetchWardMealDashboard(
  mockWardId: string,
  options?: { signal?: AbortSignal; viewerGuardianLoginId?: string }
): Promise<WardMealDashboard> {
  const access = resolveCachedBackendWardAccess(mockWardId, options?.viewerGuardianLoginId);
  if (!access) return { status: "not-linked" };

  const authHeaders = { headers: { Authorization: `Bearer ${access.accessToken}` } };
  const dietHistoryReq = fetchWithTimeout(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/diet-history?days=${HISTORY_DAYS}`,
    authHeaders,
    REQUEST_TIMEOUT_MS
  );
  const intakeSummaryReq = fetchWithTimeout(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/intake-summary?days=1`,
    authHeaders,
    REQUEST_TIMEOUT_MS
  );

  // 둘 중 하나가 실패로 확정되거나(catch) 호출부의 signal이 취소되면, 아직 안 끝난 나머지
  // 요청도 같이 abort한다 — 독립된 컨트롤러를 각자 들면 하나가 이미 버려졌는데도 다른
  // 하나는 끝까지 네트워크를 쓰게 된다.
  const abortBoth = () => {
    dietHistoryReq.controller.abort();
    intakeSummaryReq.controller.abort();
  };
  options?.signal?.addEventListener("abort", abortBoth);

  try {
    const [dietHistory, intakeSummary] = await Promise.all([
      parseJson<BackendDietHistoryResponse>(dietHistoryReq.promise),
      parseJson<BackendIntakeSummaryResponse>(intakeSummaryReq.promise),
    ]);
    return {
      status: "ready",
      leftoverPercent: intakeSummary.average_leftover_pct,
      mealHistory: buildMealHistory(dietHistory.items),
    };
  } catch (err) {
    abortBoth();
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
    dietHistoryReq.clearTimeout();
    intakeSummaryReq.clearTimeout();
    options?.signal?.removeEventListener("abort", abortBoth);
  }
}
