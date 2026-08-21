// 실제 grandfood_backend에 알림 목록을 연결한다: 보호자용 GET /app/guardian/notifications,
// 어르신용 GET /app/elder/{id}/notifications. 두 엔드포인트 다 "이상신호"(health_alert)와
// "안부확인콜"(tts_call) 두 종류만 합성해서 준다 — 이전 mock에 있던 배송/구독/식단변경/공지는
// 대응하는 백엔드 테이블 자체가 없어서(범용 공지사항 테이블 없음, meal/service.py 주석 참고)
// 실제 연동에는 포함될 수 없다.
import { API_BASE_URL } from "@/lib/api-config";
import {
  backendGuardianSessionStore,
  hasBackendSessionForWard,
  resolveCachedBackendWardAccess,
} from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { createLocalStore } from "@/lib/local-store";
import { deriveDailyLeftover, fetchElderDietHistory, recentDateKeys } from "@/lib/meal-dashboard";

// "기타"는 백엔드가 지금 두 alert_type(excessive_leftover/nutrition_deficiency) 외의 값을 보내는
// 경우를 위한 폴백이다 — splitHealthAlertSummary() 참고. 모르는 타입을 그냥 "영양부족"으로
// 단정하면 실제와 다른 구체적인 건강 정보를 보호자에게 잘못 전달하게 된다.
// "완식"은 백엔드 알림이 아니라 아래 fetchElderStreakNotification()이 프론트에서 직접 만드는
// 합성 항목이다(guardian 쪽 SOS와 같은 패턴 — notifications-view.tsx 참고).
export type NotificationType = "SOS" | "잔반이상" | "영양부족" | "안부확인콜" | "완식" | "기타";

export type NotificationItem = {
  id: string;
  date: string;
  type: NotificationType;
  targetName?: string;
  message: string;
  read: boolean;
};

const TYPE_STYLE: Record<NotificationType, string> = {
  SOS: "bg-destructive text-white",
  잔반이상: "bg-risk-high text-risk-high-foreground",
  영양부족: "bg-risk-caution text-risk-caution-foreground",
  안부확인콜: "bg-secondary text-secondary-foreground",
  완식: "bg-secondary text-secondary-foreground",
  기타: "bg-muted text-muted-foreground",
};

export function notificationBadgeClass(type: NotificationType) {
  return TYPE_STYLE[type];
}

// 홈 화면 종 아이콘의 빨간 점 — 한 번 알림 화면에 들어가서 본 항목은 다시 안 뜨게 한다
// (2026-08-21 피드백, "한 번 보면 꺼져야지 계속 들어가 있으면 자꾸 확인하게 된다"). 서버가
// 주는 read(이상신호 해결/안부확인콜 응답 여부)와는 별개 개념이라 로컬에 따로 기록한다 —
// read는 "그 일이 해결됐는지", 이건 "이 기기에서 사람이 목록을 열어봤는지".
const notificationSeenStore = createLocalStore<Record<string, string[]>>(
  "grandfood-app-notification-seen-ids",
  {}
);

export function getSeenNotificationIds(wardId: string): string[] {
  return notificationSeenStore.read()[wardId] ?? [];
}

export function markNotificationsSeen(wardId: string, ids: string[]): void {
  if (ids.length === 0) return;
  notificationSeenStore.update((prev) => ({
    ...prev,
    [wardId]: [...new Set([...(prev[wardId] ?? []), ...ids])],
  }));
}

// AI 도우미(rag-chat.ts)와 같은 이유로 요청이 무한정 매달리지 않게 상한을 둔다.
const REQUEST_TIMEOUT_MS = 15_000;

const GUARDIAN_SESSION_REQUIRED_MESSAGE = "실제 백엔드 계정으로 로그인해야 알림을 불러올 수 있어요.";
const WARD_SESSION_REQUIRED_MESSAGE =
  "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 알림을 불러올 수 있어요.";

// 백엔드 GuardianNotificationItem / ElderNotificationItem 응답 모양 (snake_case 그대로,
// 별도 camelCase 변환 없음 — meal/schemas.py 참고). elder_id/elder_name은 보호자용 응답에만 있다.
type BackendNotificationItem = {
  type: string; // "health_alert" | "tts_call"
  elder_id?: string;
  elder_name?: string | null;
  occurred_at: string;
  summary: string;
  status: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatOccurredAt(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// health_alert의 summary는 백엔드가 "excessive_leftover (high) — 잔반율 80%로 기준(70%) 초과"처럼
// 영문 alert_type + 한글 사유를 한 문자열로 합쳐서 보낸다(구조화된 필드로는 안 옴, meal/service.py
// get_guardian_notifications 참고) — 배지 종류와 "— " 뒤 사유 문장을 여기서 다시 갈라낸다.
// 백엔드가 그 포맷을 바꾸면 이 파싱도 같이 깨질 수 있는 약한 결합이지만, 지금은 이 문자열이
// 유일한 정보 출처라 다른 방법이 없다.
// alert_type이 정확히 이 두 값 중 하나로 시작할 때만 구체적인 종류를 단정한다(백엔드
// alerts_service.py의 AlertType enum과 맞춤) — 그 외(장차 세 번째 타입이 추가되는 경우 등)는
// "기타"로 남겨서, 모르는 걸 아는 것처럼 잘못 라벨링하지 않는다.
function splitHealthAlertSummary(
  summary: string
): { badgeType: "잔반이상" | "영양부족" | "기타"; reason?: string } {
  const separatorIndex = summary.indexOf(" — ");
  const reason = separatorIndex === -1 ? undefined : summary.slice(separatorIndex + 3);
  if (summary.startsWith("excessive_leftover")) return { badgeType: "잔반이상", reason };
  if (summary.startsWith("nutrition_deficiency")) return { badgeType: "영양부족", reason };
  return { badgeType: "기타", reason };
}

const HEALTH_ALERT_LEAD: Record<"잔반이상" | "영양부족" | "기타", string> = {
  잔반이상: "잔반이 많이 남았어요.",
  영양부족: "최근 영양 섭취가 부족해요.",
  기타: "확인이 필요한 이상신호가 있어요.",
};

const TTS_CALL_STATUS_LABEL: Record<string, string> = {
  pending: "예정 · 아직 응답 없음",
  answered: "응답 완료",
  no_answer: "응답 없음",
};

function mapBackendItem(item: BackendNotificationItem, id: string): NotificationItem {
  const date = formatOccurredAt(item.occurred_at);
  const targetName = item.elder_name ?? undefined;

  if (item.type === "health_alert") {
    const { badgeType, reason } = splitHealthAlertSummary(item.summary);
    return {
      id,
      date,
      type: badgeType,
      targetName,
      message: reason ? `${HEALTH_ALERT_LEAD[badgeType]} ${reason}` : HEALTH_ALERT_LEAD[badgeType],
      read: item.status === "resolved",
    };
  }

  return {
    id,
    date,
    type: "안부확인콜",
    targetName,
    message: `안부확인 콜: ${TTS_CALL_STATUS_LABEL[item.status] ?? item.status}`,
    read: item.status !== "pending",
  };
}

async function fetchNotificationItems(url: string, accessToken: string): Promise<NotificationItem[]> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      throw new Error(`알림을 불러오지 못했어요 (status ${response.status})`);
    }
    const data: { items: BackendNotificationItem[] } = await response.json();
    return data.items.map((item, index) => mapBackendItem(item, `${item.type}-${item.occurred_at}-${index}`));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("알림을 불러오는 데 시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
}

// GET /app/guardian/notifications — 로그인한 보호자 본인의 모든 대상자 알림.
// 보호자 자신의 백엔드 세션을 그대로 쓴다(대상자별 세션 조회인 getBackendGuardianSessionForWard와
// 달리, 여기선 지금 로그인한 보호자 계정 자체의 토큰이 필요하다).
export async function fetchGuardianNotifications(guardianLoginId: string): Promise<NotificationItem[]> {
  const session = backendGuardianSessionStore.read()[guardianLoginId];
  if (!session) {
    throw new Error(GUARDIAN_SESSION_REQUIRED_MESSAGE);
  }
  return fetchNotificationItems(`${API_BASE_URL}/app/guardian/notifications`, session.accessToken);
}

// GET /app/elder/{id}/notifications — 어르신 본인 화면(홈)에서 본인 알림만. 이 대상자를
// 관리하는 보호자의 실제 백엔드 세션, 또는 (보호자 없이 직접가입한 경우) 본인의 백엔드
// 세션을 쓴다(rag-chat.ts의 askHealthQuestion()과 동일한 패턴 — resolveCachedBackendWardAccess).
//
// 순수 조회라 백엔드 유저를 새로 만들지 않는다(resolveBackendWardAccess의 "캐시에 없으면
// 새로 만듦" 버전이 아니라, 캐시/즉시 확인만 하는 버전을 씀) — 사진 업로드/AI 질문 같은
// 명시적 액션을 한 번도 안 한 대상자는 캐시가 비어있는 게 정상이고, 그럴 땐 "아직 알림
// 없음"으로 조용히 넘어간다. 세션 자체가(보호자도 본인도) 없어서 못 부르는 경우만
// hasBackendSessionForWard로 구분해 에러로 알린다.
export async function fetchElderNotifications(params: { mockWardId: string }): Promise<NotificationItem[]> {
  const access = resolveCachedBackendWardAccess(params.mockWardId);
  if (access) {
    return fetchNotificationItems(
      `${API_BASE_URL}/app/elder/${access.backendWardId}/notifications`,
      access.accessToken
    );
  }

  if (!hasBackendSessionForWard(params.mockWardId)) {
    throw new Error(WARD_SESSION_REQUIRED_MESSAGE);
  }
  return [];
}

// "최근 N일 중 M일 완식하셨어요" — 예전엔 home-view.tsx가 이걸 항상 화면에 카드로 띄웠는데,
// 배송 예정과 달리 매일 훑어야 하는 정보가 아니라 가끔 보는 격려 문구라 안내 사항과 같이
// 알림 쪽으로 옮겼다(2026-08-21 피드백). 백엔드에 이 알림 타입 자체가 없어서(범용 공지사항
// 테이블 없음, 파일 상단 주석 참고) 실제 백엔드 알림처럼 서버에서 오는 게 아니라 여기서
// diet-history를 직접 조회해 프론트에서 합성한다 — guardian 쪽 SOS(sos-store.ts, 로컬
// 저장소 기반 합성 알림)와 같은 패턴. 완식이 0일이면 보여줄 내용이 없으므로 null.
//
// 그리드/리포트는 완식/소량 카테고리를 없애고 실제 평균 잔반율 숫자로 바꿨지만
// (deriveDailyLeftover, 2026-08-21), 이 격려 문구는 문구 그대로 두기로 했다 — "며칠
// 완식했는지" 격려 성격상 대략적인 기준으로도 충분하다는 판단(사용자 확인). 내부 판정
// 기준만 평균 잔반율 10% 미만으로 새로 정한다(예전 50% 경계보다 훨씬 엄격함 — "완식"이라고
// 부를 만한 날만 세도록).
const STREAK_DAYS = 7;
const STREAK_COMPLETE_THRESHOLD_PCT = 10;

export async function fetchElderStreakNotification(identity: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<NotificationItem | null> {
  const items = await fetchElderDietHistory(
    { mockWardId: identity.mockWardId, name: identity.name, age: identity.age, address: identity.address },
    STREAK_DAYS
  );
  if (!items) return null;
  const completeCount = deriveDailyLeftover(items, recentDateKeys(STREAK_DAYS)).filter(
    (d) => d.avgLeftoverPercent != null && d.avgLeftoverPercent < STREAK_COMPLETE_THRESHOLD_PCT
  ).length;
  if (completeCount === 0) return null;
  return {
    // 날짜+횟수를 id에 넣어서, 다음 날 카운트가 바뀌면 "이미 본 항목"이 아니라 새 항목으로
    // 취급되게 한다(고정 id였다면 한 번 보고 나면 스트릭이 바뀌어도 영영 안 뜬다).
    id: `streak-${new Date().toISOString().slice(0, 10)}-${completeCount}`,
    date: formatOccurredAt(new Date().toISOString()),
    type: "완식",
    message: `최근 ${STREAK_DAYS}일 중 ${completeCount}일 완식하셨어요. 잘하고 계세요!`,
    read: false,
  };
}
