"use client";

// records-view.tsx(이용자 본인)와 report-view.tsx(보호자)가 거의 똑같은 "레시피 · 유튜브
// 추천" 카드 목록을 그려서 하나로 뺐다 — recipe-recommendations.ts가 실제 백엔드에
// 연결되면서(grandfood_backend GET/POST .../recipe-recommendations) 항목 모양이 통째로
// 바뀌었는데(예전 로컬 목업의 title/thumbnailEmoji/youtubeUrl(항상 값 있음) →
// name/thumbnailUrl(이미지, null 가능)/youtubeUrl(null 가능)), 두 화면에 따로 마크업을
// 두면 한쪽만 고치고 잊어버리기 쉽다.

import type { RecipeRecommendationItem } from "@/lib/recipe-recommendations";

export function RecipeRecommendationList({
  recipes,
}: {
  /** null = 아직 불러오는 중(또는 조회 실패). [] = 불러왔는데 추천할 게 없음. */
  recipes: RecipeRecommendationItem[] | null;
}) {
  if (recipes === null) {
    return <p className="text-sm text-muted-foreground">추천을 불러오는 중이에요...</p>;
  }
  if (recipes.length === 0) {
    return <p className="text-sm text-muted-foreground">지금은 특별히 추천할 레시피가 없어요.</p>;
  }
  return (
    <>
      {recipes.map((recipe) => {
        const content = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {recipe.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 유튜브 썸네일이라 next/image 최적화 대상이 아님
                  <img
                    src={recipe.thumbnailUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="text-lg">🍽️</span>
                )}
                {recipe.name}
              </span>
              {recipe.targetNutrientLabel && (
                <span className="shrink-0 text-xs text-muted-foreground">{recipe.targetNutrientLabel}</span>
              )}
            </div>
            {/* 왜 이 레시피를 추천했는지 — 백엔드가 오늘 배정 반찬의 부족분을 근거로
                직접 지어주는 문장이다(recipe-recommendations.ts 참고). 이 문장이 없으면
                영양소 배지만으로는 "그래서 왜"가 안 보인다. */}
            {recipe.reason && (
              <p className="text-xs leading-relaxed text-muted-foreground">{recipe.reason}</p>
            )}
          </>
        );
        const className =
          "flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted";
        // youtube_url이 null이면(링크 해소 실패 — 유튜브 API 키 미설정 등) 추천 자체는
        // 유효하니 링크 없이 텍스트만 보여준다(recipe-recommendations.ts 타입 주석 참고).
        return recipe.youtubeUrl ? (
          <a
            key={recipe.recipeId}
            href={recipe.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className={className}
          >
            {content}
          </a>
        ) : (
          <div key={recipe.recipeId} className={className}>
            {content}
          </div>
        );
      })}
    </>
  );
}
