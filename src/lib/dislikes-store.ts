"use client";

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { createLocalStore } from "@/lib/local-store";

/** wardId -> 기피로 표시한 메뉴 항목 id 목록 */
export const dislikesStore = createLocalStore<Record<string, string[]>>(
  "grandfood-app-dislikes",
  {}
);

export function toggleDislike(wardId: string, itemId: string) {
  dislikesStore.update((prev) => {
    const current = prev[wardId] ?? [];
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    return { ...prev, [wardId]: next };
  });
}

export function wardDislikes(all: Record<string, string[]>, wardId: string) {
  return all[wardId] ?? [];
}

// 위 dislikesStore/toggleDislike는 순수 로컬(브라우저)이라, "기피 표시"를 눌러도
// 지금까지 백엔드로 전혀 안 넘어가서 다음 AI 반찬 추천(health/service.py의
// _judge_banchan)이 이 정보를 전혀 몰랐다. 백엔드는 이미 user_food_rules(rule_type=
// "dislike")를 프롬프트에 반영해 caution 이하로 낮추는 로직을 갖고 있어서
// (grandfood_backend PR#80), 여기서 그 저장소에 연결한다.
//
// food_rules.item_name은 자유 텍스트 "이름"이지 dishId/banchanId가 아니다 — 그래서
// 위 로컬 스토어(id 목록)는 그대로 두고(화면의 "지금 이 항목이 기피됨" 배지/그레이아웃은
// 계속 id로 비교), 백엔드로 보낼 때만 이름으로 변환한다. 호출부(home-view.tsx)가 오늘
// 메뉴에서 골라낸 이름 목록을 넘겨준다.
const REQUEST_TIMEOUT_MS = 15_000;

type WardIdentity = { mockWardId: string; name: string; age: number; address: string };

// GET .../food-rules/dislikes — 화면 진입 시 자동으로 도는 순수 조회라
// resolveCachedBackendWardAccess를 쓴다(캐시 미스 시 백엔드 User를 새로 만들면 안
// 된다 — PR #8에서 발견/수정된 것과 같은 부수효과, meal-dashboard.ts 등과 동일 관례).
export async function fetchDislikedFoodNames(identity: WardIdentity): Promise<string[] | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/dislikes`,
    { headers: { Authorization: `Bearer ${access.accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    const data = (await response.json()) as { item_names: string[] };
    return data.item_names;
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// PUT .../food-rules/dislikes — "기피 표시" 토글을 누를 때마다 그 시점의 전체 기피
// 목록(이름 기준)을 보낸다(요청값이 곧 전체 목록 — 서버가 그렇게 교체함). 실제 사용자
// 액션(버튼 클릭)에 반응하는 호출이라 resolveBackendWardAccess를 쓴다(meal-log-store.ts의
// submitMealLogPhotos와 같은 이유 — 필요하면 백엔드 User를 새로 만들어도 된다). 실패해도
// 화면(로컬 상태)은 이미 바뀐 뒤라 조용히 무시한다 — 다음 토글이나 새로고침 때 다시
// 시도되는 셈이라, 매번 실패 토스트를 띄우면 오히려 방해된다(이 항목 하나 때문에 AI
// 추천이 당장 틀어지는 것도 아님).
export async function syncDislikedFoodsToBackend(
  identity: WardIdentity,
  itemNames: string[]
): Promise<boolean> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) return false;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/dislikes`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({ item_names: itemNames }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    return response.ok;
  } catch {
    return false;
  } finally {
    clearRequestTimeout();
  }
}
