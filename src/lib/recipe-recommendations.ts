"use client";

// "레시피 · 유튜브 추천" — grandfood_backend에 실제로 연결한다
// (POST/GET /health/users/{id}/recipe-recommendations). 백엔드가 오늘 배정된 반찬의
// 영양 부족분(개인 목표치 대비)을 직접 계산해서 근거로 삼는다 — 프론트는 더 이상 "무슨
// 영양소가 부족한지"를 스스로 판단해서 넘기지 않는다(예전 로컬 버전은 health-insights.ts의
// deriveHealthInsight로 그걸 직접 계산했었다). deriveHealthInsight/HealthInsight는 이
// 화면들의 다른 카드(결핍 배지·요약 문구)에 여전히 쓰이므로 그대로 둔다 — 이 파일만 분리한다.

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess, resolveCachedBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// LLM이 반찬 부족분을 보고 레시피를 만드는 과정이 껴 있어 rag-chat.ts(askHealthQuestion)와
// 같은 상한을 둔다.
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 5;

export type RecipeRecommendationItem = {
  recipeId: string;
  name: string;
  category: string;
  /** null이면 링크 해소가 안 된 것(유튜브 API 키 미설정 등)이고 추천 자체는 유효하다 —
   *  화면은 이때 링크 없이 텍스트만 보여줘야 한다. */
  youtubeUrl: string | null;
  /** null이면 이모지 등 대체 표시로 채워야 한다. */
  thumbnailUrl: string | null;
  reason: string | null;
  recommendedAt: string | null;
  /** GET(이력) 경로로 받은 항목은 이 값이 없다 — 백엔드가 어떤 영양소를 노렸는지
   *  저장하지 않는다(health/recipe_service.py get_recipe_recommendations 참고,
   *  target_nutrient는 응답 스키마 자체에 없음). 화면은 있을 때만 배지를 보여준다. */
  targetNutrientLabel: string | null;
};

export type RecipeRecommendationResult = {
  items: RecipeRecommendationItem[];
  /** items가 왜 비었는지(POST/새로 생성 경로에서만 채워짐) — "no_targets"(목표치 계산
   *  불가)/"no_gaps"(부족한 영양소 없음)/"llm_unavailable"/"no_assigned_banchan" 등.
   *  캐시(GET 이력) 경로는 이 정보가 없어 null. */
  basis: string | null;
};

type WardIdentity = { mockWardId: string; name: string; age: number; address: string };

type RawHistoryItem = {
  recipe_id: string;
  name: string;
  category: string;
  youtube_url: string | null;
  thumbnail_url: string | null;
  reason: string | null;
  recommended_at: string | null;
};

type RawGenerateItem = RawHistoryItem & {
  target_nutrient_label: string;
};

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getJson<T>(url: string, accessToken: string): Promise<T | null> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// GET .../recipe-recommendations — 오늘치가 이미 저장돼 있는지 가볍게 확인한다. 있으면
// 그대로 쓰고 POST(LLM 호출, 비용 발생)를 다시 안 부른다 — generate_recipe_recommendations는
// "같은 날 다시 호출하면 그 날 추천을 덮어쓴다"만 하고 "이미 있으면 건너뛴다"는 없어서,
// 프론트가 부르는 쪽에서 직접 막아야 한다. 화면 진입 시 자동으로 도는 순수 조회라
// resolveCachedBackendWardAccess를 쓴다(캐시 미스 시 백엔드 User를 새로 만들면 안 된다 —
// PR #8에서 고쳤던 부수효과와 같은 이유, meal-dashboard.ts 등과 동일 관례).
async function fetchTodayFromHistory(identity: WardIdentity): Promise<RecipeRecommendationResult | null> {
  const access = resolveCachedBackendWardAccess(identity.mockWardId);
  if (!access) return null;

  const data = await getJson<{ items: RawHistoryItem[] }>(
    `${API_BASE_URL}/health/users/${access.backendWardId}/recipe-recommendations?limit=${DEFAULT_LIMIT}`,
    access.accessToken
  );
  if (!data) return null;

  const today = todayDateString();
  const todays = data.items.filter((item) => item.recommended_at?.slice(0, 10) === today);
  if (todays.length === 0) return null;

  // 유튜브 API 키가 나중에(오늘 이미 한 번 생성된 뒤에) 설정된 경우, 캐시된 오늘치가
  // 전부 링크 없음(youtube_url/thumbnail_url 다 null)일 수 있다 — 그걸 그대로 "오늘 이미
  // 있음"으로 재사용하면 새 키로 다시 생성해도 절대 실제 링크를 못 받아온다(캐시 미스로
  // 취급 안 하니 POST가 다시 안 불림). 항목이 하나라도 링크를 갖고 있으면 정상 캐시로
  // 보고, 전부 없을 때만 "아직 제대로 안 된 것"으로 판단해 캐시를 안 쓰고 새로 생성한다.
  const allLinksMissing = todays.every((item) => !item.youtube_url && !item.thumbnail_url);
  if (allLinksMissing) return null;

  return {
    items: todays.map((item) => ({
      recipeId: item.recipe_id,
      name: item.name,
      category: item.category,
      youtubeUrl: item.youtube_url,
      thumbnailUrl: item.thumbnail_url,
      reason: item.reason,
      recommendedAt: item.recommended_at,
      targetNutrientLabel: null,
    })),
    basis: null,
  };
}

// POST .../recipe-recommendations — 오늘 배정 반찬 기준으로 새로 생성한다(LLM 호출).
// 사용자가 화면을 여는 것 자체가 "이 대상자의 추천을 보고 싶다"는 실제 액션이라
// resolveBackendWardAccess를 쓴다(meal-log-store.ts의 submitMealLogPhotos와 같은 이유 —
// 필요하면 백엔드 User를 새로 만들어도 된다).
async function generateRecipeRecommendations(
  identity: WardIdentity
): Promise<RecipeRecommendationResult | null> {
  const access = await resolveBackendWardAccess(identity);
  if (!access) return null;

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/users/${access.backendWardId}/recipe-recommendations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({ limit: DEFAULT_LIMIT }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    const data = (await response.json()) as { basis: string; items: RawGenerateItem[] };
    return {
      items: data.items.map((item) => ({
        recipeId: item.recipe_id,
        name: item.name,
        category: item.category,
        youtubeUrl: item.youtube_url,
        thumbnailUrl: item.thumbnail_url,
        reason: item.reason,
        recommendedAt: item.recommended_at,
        targetNutrientLabel: item.target_nutrient_label,
      })),
      basis: data.basis,
    };
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// records-view.tsx(이용자 본인)/report-view.tsx(보호자)가 부르는 진입점 — 오늘치가 이미
//있으면 그걸 쓰고, 없으면 새로 생성한다. 실패(백엔드 접근 불가 등)하면 null — 호출부는
// "추천을 불러오는 중"과 "추천 결과 없음(0건)"을 구분해야 하므로, 완전 실패는 그와
// 다른 상태(예: 카드 자체를 숨김)로 처리하는 게 자연스럽다.
export async function fetchRecipeRecommendations(
  identity: WardIdentity
): Promise<RecipeRecommendationResult | null> {
  const cached = await fetchTodayFromHistory(identity);
  if (cached) return cached;
  return await generateRecipeRecommendations(identity);
}
