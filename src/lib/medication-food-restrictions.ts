"use client";

// 약물표 제안을 사용자가 실제로 확정한 음식 목록을 백엔드와 동기화한다.
//
// 기존 dislikes-store.ts(GET/PUT .../food-rules/dislikes)와 거의 같은 모양이지만 일부러
// 별도 파일로 뒀다 — 저 파일은 rule_type="dislike"(단순 선호, LLM이 caution 이하로만
// 참고)를 다루고, 이 파일은 rule_type="restriction"(약물표 제안을 사용자가 확정한 것 —
// _exclude_allergens가 allergy와 동일하게 반찬 후보에서 아예 제외함)을 다룬다. 같은
// item_names 모양이라 백엔드 서비스 함수는 공유하지만(list_food_rule_items/
// replace_food_rule_items, rule_type 인자만 다름), 프론트에서 "기피"와 "제한"을
// 헷갈리지 않게 함수 이름을 분리했다.

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const REQUEST_TIMEOUT_MS = 15_000;

type WardIdentity = { mockWardId: string; name: string; age: number; address: string };

// GET .../food-rules/restrictions — 화면 진입 시 자동으로 도는 순수 조회라
// resolveCachedBackendWardAccess를 쓴다(dislikes-store.ts와 동일한 이유 — 캐시 미스
// 시 백엔드 User를 새로 만들면 안 됨).
export async function fetchMedicationFoodRestrictions(identity: WardIdentity): Promise<string[] | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/restrictions`,
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

// PUT .../food-rules/restrictions — 요청값이 곧 전체 목록(서버가 그렇게 교체함). 설문
// 제출처럼 실제 사용자 액션에 반응하는 호출이라 resolveBackendWardAccess를 쓴다(필요하면
// 백엔드 User를 새로 만들어도 되는 경로).
export async function syncMedicationFoodRestrictions(
  identity: WardIdentity,
  itemNames: string[]
): Promise<boolean> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) return false;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/restrictions`,
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
