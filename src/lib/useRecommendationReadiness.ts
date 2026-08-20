"use client";

// 팀 합의안 3·4번 — "알레르기/복약 정보 미입력 시 리마인드". 4번에서 정리된 대로 상태값
// (진짜 없음 vs 온보딩 때 답 안 함)을 따로 안 두고, 호출 시점에 "지금 정보가 있냐 없냐"만
// 매번 다시 확인한다. 세 가지(질환/복약/기피음식) 중 하나라도 있으면 "입력함"으로 본다 —
// 셋 다 비어야만 리마인드를 띄운다(하나라도 채웠는데 계속 뜨면 오히려 방해된다는 게
// 합의 취지).

import { useState } from "react";

import { API_BASE_URL } from "@/lib/api-config";
import { fetchBackendWardProfile, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const REQUEST_TIMEOUT_MS = 10_000;

export type ReadinessCheck = {
  hasConditions: boolean;
  hasMedications: boolean;
  /** food_rules에 뭐라도 있는지 — "dislike"(단순 선호)와 "restriction"(약물표 제안을
   *  확정한 것) 둘 중 하나라도 있으면 true. 여기선 "입력을 했는지"만 보는 거라
   *  두 rule_type을 구분할 필요가 없다(제외 강도 차이는 _exclude_allergens에서만 의미
   *  있음). */
  hasFoodRules: boolean;
};

export function isMissingHealthInfo(check: ReadinessCheck): boolean {
  return !check.hasConditions && !check.hasMedications && !check.hasFoodRules;
}

// GET 하나를 "성공하면 JSON, 실패하면 fallback"으로 단순화한 헬퍼 — 이 훅은 두 엔드포인트를
// 순서대로 부르는데 실패 처리 방식이 완전히 같아서(응답이 !ok거나 네트워크 자체가
// 실패하면 그냥 fallback으로 넘어감) 반복을 줄였다. backend-auth.ts류처럼 매 호출마다
// try/finally를 직접 쓰는 대신, fetchWithTimeout의 clearTimeout을 여기 한 곳에서만 감싼다.
async function getJsonOrFallback<T>(url: string, accessToken: string, fallback: T): Promise<T> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  } finally {
    clearRequestTimeout();
  }
}

export function useRecommendationReadiness() {
  const [checking, setChecking] = useState(false);

  /** null이면 "백엔드 세션 없음" — 이 경우 호출부는 리마인드 없이 그냥 진행시켜야 한다
   *  (이 기능은 어디까지나 보조 리마인드지, 추천 자체를 막는 게이트가 아니다). */
  async function check(identity: { mockWardId: string; name: string; age: number; address: string }): Promise<ReadinessCheck | null> {
    const access = resolveCachedBackendWardAccess(identity.mockWardId);
    if (!access) return null;

    setChecking(true);
    try {
      // 여기서 GET /users/{id}를 직접 부르면 안 된다 — 그 엔드포인트는 보호자 토큰만
      // 받는데(account/router.py의 read_user, Depends(get_current_guardian)), 자가등록
      // 이용자 본인 세션으로 부르면 401(code: token_invalid)이 오고, 그 code가
      // fetch-with-timeout.ts의 전역 401 핸들러에 걸려 "로그인 기간 만료"로 오인돼
      // 강제 로그아웃된다 — "다시 추천받기"를 눌렀는데 갑자기 로그아웃되던 버그가
      // 바로 이거였다. fetchBackendWardProfile은 이 케이스를 이미 알고 자가등록
      // 세션이면 호출 자체를 안 하고 조용히 null을 반환하도록 되어 있어(그 안의 주석
      // 참고) 그걸 재사용한다 — 자가등록 이용자는 이 부분(질환/복약) 판단을 못 하고
      // 아래 food_rules 결과만으로 판단하게 되는 제약은 남지만, 로그아웃되는 것보다는
      // 훨씬 낫다.
      const profile = await fetchBackendWardProfile({
        mockWardId: identity.mockWardId,
        name: identity.name,
        age: identity.age,
        address: identity.address,
      });

      // food_rules 조회 둘 중 하나만 실패해도(예: 아직 이 라우트가 없는 배포본) 나머지
      // 정보로는 판단을 계속한다 — 하나 실패했다고 리마인드 판단 전체를 포기할 이유는
      // 없다. 둘을 병렬로 부른다 — 순서를 강제할 이유가 없는 두 개의 독립된 조회다.
      const [dislikes, restrictions] = await Promise.all([
        getJsonOrFallback<{ item_names?: string[] }>(
          `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/dislikes`,
          access.accessToken,
          { item_names: [] }
        ),
        getJsonOrFallback<{ item_names?: string[] }>(
          `${API_BASE_URL}/health/users/${access.backendWardId}/food-rules/restrictions`,
          access.accessToken,
          { item_names: [] }
        ),
      ]);

      return {
        hasConditions: (profile?.conditionFlags ?? []).length > 0,
        hasMedications: (profile?.medicationFlags ?? []).length > 0,
        hasFoodRules:
          (dislikes.item_names ?? []).length > 0 || (restrictions.item_names ?? []).length > 0,
      };
    } finally {
      setChecking(false);
    }
  }

  return { check, checking };
}
