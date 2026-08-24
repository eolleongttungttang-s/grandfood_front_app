"use client";

// 2026-08-24까지는 이 store가 순전히 로컬(localStorage)이라, 어르신 폰과 보호자 폰이
// 실제로 다른 기기면 SOS가 전달되지 않았다(같은 브라우저를 공유하는 데모에서만 "되는
// 것처럼" 보임). 이제 백엔드에 실제 엔드포인트(POST /app/elder/{elder_id}/sos, PR#102)가
// 생겨서 reportSosToBackend()가 그걸 부른다 — 보호자 쪽 조회도 notifications.ts의
// fetchGuardianNotifications()가 이 서버 기록을 읽어오도록 이미 바뀌었다(ward-list-view.tsx/
// notifications-view.tsx 참고).
//
// 이 파일의 로컬 store(raiseSos/acknowledgeSos)는 그래도 남겨둔다 — 응급 상황이라
// 네트워크 왕복을 기다리지 않고 화면 반응(로컬 기록 + 음성 안내)을 먼저 보여주기 위한
// 선반영 용도로는 여전히 쓸모 있다(accessibility.ts의 speakUrgent()와 같은 이유).
import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { createLocalStore } from "@/lib/local-store";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type SosEvent = {
  id: string;
  wardId: string;
  wardName: string;
  timestamp: number;
  acknowledged: boolean;
};

export const sosStore = createLocalStore<SosEvent[]>("grandfood-app-sos", []);

export function raiseSos(wardId: string, wardName: string) {
  sosStore.update((prev) => [
    { id: crypto.randomUUID(), wardId, wardName, timestamp: Date.now(), acknowledged: false },
    ...prev,
  ]);
}

export function acknowledgeSos(id: string) {
  sosStore.update((prev) =>
    prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e))
  );
}

// 보호자의 "확인했어요" — PATCH /app/guardian/alerts/{alert_id}/acknowledge가 백엔드엔
// 있지만(2026-08-24, SOS와 같이 추가됨), 보호자 알림 목록 응답(GuardianNotificationItem)에
// alert_id 자체가 없어서 지금은 어느 alert를 부를지 프론트가 알 방법이 없다(다음 PR
// 설명에 남길 예정 — 김OO 코드 리뷰 참고). 그래서 백엔드 상태(status=resolved)는 못
// 바꾸고, 대신 이 브라우저에서 하는 두 가지로 "확인했다"는 걸 표현한다:
//   1) dismissedSosStore — 그 알림을 보호자 화면(배너/목록)에서 다시 안 보이게 감춘다.
//   2) sosAckStore — 어르신 쪽에 "보호자가 확인했어요"라는 로컬 합성 알림을 하나
//      만든다(완식/배송 알림과 같은 패턴, notifications.ts 상단 주석 참고).
// 둘 다 alert_id 없이도 되는 방식이라, 나중에 alert_id가 응답에 추가되면 진짜 백엔드
// acknowledge 호출로 교체하면 된다 — 그때도 이 두 UX(배너 사라짐/어르신 알림)는 그대로 둔다.
export type SosAcknowledgment = {
  /** GuardianNotificationItem.elder_id — 백엔드 user_id (로컬 mockWardId와 다름). */
  backendElderId: string;
  guardianName: string;
  timestamp: number;
};
export const sosAckStore = createLocalStore<SosAcknowledgment[]>("grandfood-app-sos-ack", []);

// notifications.ts가 만드는 합성 NotificationItem.id(예: "health_alert-2026-...-0")를
// 그대로 dismiss 키로 쓴다 — 같은 알림이면 같은 입력으로 같은 id가 나온다.
export const dismissedSosStore = createLocalStore<string[]>("grandfood-app-sos-dismissed", []);

export function acknowledgeSosNotification(
  itemId: string,
  backendElderId: string,
  guardianName: string
) {
  dismissedSosStore.update((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
  sosAckStore.update((prev) => [{ backendElderId, guardianName, timestamp: Date.now() }, ...prev]);
}

const REQUEST_TIMEOUT_MS = 15_000;

// POST /app/elder/{elder_id}/sos — 실제 보호자/시설 담당자에게 알림이 가는 진짜 SOS.
// raiseSos()(로컬 즉시 반영)와 항상 같이, 그러나 그걸 기다리지 않고 별도로 부른다 —
// sos-button.tsx가 이미 로컬 기록 + 음성 안내를 끝낸 뒤 이 요청을 background로 보낸다.
// 실패해도(세션 없음 등) 이미 로컬 반응은 끝난 뒤라 어르신 경험엔 영향이 없고, 조용히
// 넘어간다 — 응급 버튼에서 네트워크 에러 토스트를 띄우는 건 오히려 방해가 된다.
export async function reportSosToBackend(identity: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<void> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) return;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/app/elder/${access.backendWardId}/sos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({}),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    await promise;
  } catch {
    // 조용히 넘어간다 — 위 주석 참고.
  } finally {
    clearRequestTimeout();
  }
}
