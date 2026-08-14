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
import { deriveTodayToneFromMealStatus, parseMealStatus } from "@/lib/meal-dashboard";
import { overrideTodayTone } from "@/lib/meal-log-store";
import type { MealTone } from "@/lib/ward-registry";

const REQUEST_TIMEOUT_MS = 15_000;
const HISTORY_DAYS = 14;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
// completed(식사 후 사진까지 올라옴) 끼니가 하루 중 하나라도 있으면 "완식", 끼니 기록은
// 있는데(식전 사진만) completed가 없으면 "소량", 그날 기록 자체가 없으면 "미응답"으로 본다 —
// mock의 3단계 의미를 최대한 살린 근사치일 뿐, 실제 잔반량을 재서 나온 값은 아니다.
function buildMealHistory(items: BackendDietHistoryItem[]): MealTone[] {
  const completedDates = new Set(items.filter((i) => i.completed).map((i) => i.meal_date));
  const recordedDates = new Set(items.map((i) => i.meal_date));

  const history: MealTone[] = [];
  const today = nowInKST();
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
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
  // diet-history는 완료 안 된(원탭) 끼니를 전부 "소량"으로만 근사한다 — 오늘 하루만큼은
  // meal-status의 끼니별 quick_check_status로 완식/남김을 정확히 구분해서 덮어쓴다
  // (meal-dashboard.ts의 deriveTodayToneFromMealStatus 참고). target_date를 안 넘기면
  // 백엔드가 오늘 날짜로 조회한다.
  const mealStatusReq = fetchWithTimeout(
    `${API_BASE_URL}/app/guardian/${access.backendWardId}/meal-status`,
    authHeaders,
    REQUEST_TIMEOUT_MS
  );
  // meal-status는 diet-history/intake-summary와 달리 실패해도 전체를 에러로 만들지 않는다 —
  // "오늘" 칸 정확도를 살짝 높여주는 보조 데이터일 뿐이라, 이것 때문에 카드 전체가 "불러오기
  // 실패"로 빠지면 손해가 더 크다. 실패하면 그냥 기존 근사치(소량)를 그대로 둔다. 이 체인은
  // (아래에서 await 하는 시점과 무관하게) 지금 바로 만들어서 .catch를 붙여둔다 — 안 그러면
  // dietHistoryReq/intakeSummaryReq가 먼저 실패해서 아래 Promise.all이 던질 때, 이 promise의
  // 거절을 아무도 못 받는(unhandled rejection) 창이 생긴다.
  const todayTonePromise = parseJson<Parameters<typeof parseMealStatus>[0]>(mealStatusReq.promise)
    .then((data) => deriveTodayToneFromMealStatus(parseMealStatus(data)))
    .catch(() => null);

  // 셋 중 하나가 실패로 확정되거나(catch) 호출부의 signal이 취소되면, 아직 안 끝난 나머지
  // 요청도 같이 abort한다 — 독립된 컨트롤러를 각자 들면 하나가 이미 버려졌는데도 다른
  // 하나는 끝까지 네트워크를 쓰게 된다.
  const abortAll = () => {
    dietHistoryReq.controller.abort();
    intakeSummaryReq.controller.abort();
    mealStatusReq.controller.abort();
  };
  options?.signal?.addEventListener("abort", abortAll);

  try {
    const [dietHistory, intakeSummary] = await Promise.all([
      parseJson<BackendDietHistoryResponse>(dietHistoryReq.promise),
      parseJson<BackendIntakeSummaryResponse>(intakeSummaryReq.promise),
    ]);
    const todayTone = await todayTonePromise;
    return {
      status: "ready",
      leftoverPercent: intakeSummary.average_leftover_pct,
      mealHistory: overrideTodayTone(buildMealHistory(dietHistory.items), todayTone),
    };
  } catch (err) {
    abortAll();
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
    mealStatusReq.clearTimeout();
    options?.signal?.removeEventListener("abort", abortAll);
  }
}
