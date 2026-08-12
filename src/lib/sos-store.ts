"use client";

// TODO(backend, 이슈 #27): 지금은 이 store가 순전히 로컬(localStorage)이라, 어르신 폰과
// 보호자 폰이 실제로 다른 기기면 SOS가 전달되지 않는다(같은 브라우저를 공유하는 데모에서만
// "되는 것처럼" 보임) — 서로 다른 두 기기가 통신하려면 반드시 서버가 있어야 한다.
// 백엔드에 관련 엔드포인트(제안: POST /health/sos)가 생기면:
//   - raiseSos()가 로컬에 즉시 반영(선반영, 응급 상황이라 네트워크 왕복을 기다리면 안 됨 —
//     accessibility.ts의 speakUrgent()와 같은 이유)하는 것과 별개로, 그 자리에서
//     fetch(POST /health/sos)도 같이 보내도록 확장한다.
//   - 보호자 쪽 조회(notifications-view.tsx)도 지금은 이 store를 직접 읽지만, 나중엔
//     notifications.ts의 fetchGuardianNotifications()처럼 실제 백엔드 조회로 바뀌어야 한다.
// 정확한 요청/응답 모양은 실제 엔드포인트 스펙이 나온 뒤에 맞춰서 짜는 게 낫다 — 지금 미리
// 짐작해서 async 구조를 만들어두면 스펙이 다를 때 오히려 다시 고쳐야 할 수 있다.
import { createLocalStore } from "@/lib/local-store";

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
