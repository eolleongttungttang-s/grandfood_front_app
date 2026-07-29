// "레시피 · 유튜브 추천" — B2C 흐름에서 완전히 새로 생긴 기능이라 참고할 기존 로직이 없다.
// 실제로는 결핍 영양소 + 잔반 식재료를 기반으로 외부 레시피/유튜브 검색 API를 호출하겠지만,
// 지금은 고정된 후보 목록(RECIPE_POOL)에서 조건에 맞는 것만 골라 돌려주는 것으로 흉내낸다.

import type { HealthInsight, NutrientDeficiency } from "@/lib/health-insights";

// 레시피는 "정상"을 대상으로 추천할 일이 없으므로, 실제 결핍 상태만 받도록 타입을 좁혔다.
type ActualDeficiency = Exclude<NutrientDeficiency, "정상">;

export type RecipeRecommendation = {
  id: string;
  title: string;
  targetNutrient: ActualDeficiency;
  youtubeUrl: string;
  thumbnailEmoji: string;
  /** 이 레시피가 활용하는 재료 — HealthInsight.frequentLeftoverIngredients와 겹치면 더 위로 노출한다 */
  usesIngredient?: string;
};

const RECIPE_POOL: RecipeRecommendation[] = [
  {
    id: "recipe-protein-tofu",
    title: "두부 스테이크로 단백질 보충하기",
    targetNutrient: "단백질부족",
    youtubeUrl: "https://www.youtube.com/results?search_query=두부+스테이크+레시피",
    thumbnailEmoji: "🍢",
    usesIngredient: "두부",
  },
  {
    id: "recipe-protein-chicken",
    title: "저염 닭가슴살 스팀 요리",
    targetNutrient: "단백질부족",
    youtubeUrl: "https://www.youtube.com/results?search_query=닭가슴살+저염+요리",
    thumbnailEmoji: "🍗",
    usesIngredient: "닭가슴살",
  },
  {
    id: "recipe-sodium-soup",
    title: "나트륨 낮춘 맑은국 끓이기",
    targetNutrient: "나트륨과다",
    youtubeUrl: "https://www.youtube.com/results?search_query=저염+맑은국+레시피",
    thumbnailEmoji: "🍲",
    usesIngredient: "무",
  },
  {
    id: "recipe-sodium-namul",
    title: "간 슴슴하게 나물 무치는 법",
    targetNutrient: "나트륨과다",
    youtubeUrl: "https://www.youtube.com/results?search_query=저염+나물+레시피",
    thumbnailEmoji: "🥬",
    usesIngredient: "시금치",
  },
];

// TODO(backend): GET /wards/:id/recipe-recommendations?nutrient=...&ingredient=... — 결핍 영양소 +
// 잔반 식재료 기반 추천. 실제로는 서버가 외부 레시피/유튜브 검색 API를 호출해 캐싱된 결과를 준다.
export async function getRecipeRecommendations(insight: HealthInsight): Promise<RecipeRecommendation[]> {
  const targets = insight.deficiencies.filter((d): d is ActualDeficiency => d !== "정상");
  if (targets.length === 0) return [];

  const matched = RECIPE_POOL.filter((r) => targets.includes(r.targetNutrient));
  // 잔반으로 남은 재료를 활용할 수 있는 레시피를 우선순위로 앞에 둔다.
  return [...matched].sort((a, b) => {
    const aUses = a.usesIngredient && insight.frequentLeftoverIngredients.includes(a.usesIngredient) ? 1 : 0;
    const bUses = b.usesIngredient && insight.frequentLeftoverIngredients.includes(b.usesIngredient) ? 1 : 0;
    return bUses - aUses;
  });
}
