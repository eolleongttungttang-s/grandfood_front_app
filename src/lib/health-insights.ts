// "건강데이터 결합 해석" 단계 — 오늘 실제 배정된 반찬의 영양가 합과 그 사람의 목표치(BMR/TDEE
// 기반, banchan-recommendation.ts)를 비교해서 "지금 이 어르신에게 주의할 신호가 있는지" 판단한다.
// reports.ts/nutrition-tip.ts와 같은 계열의 순수 파생 계산이라 TODO(backend) 마커를 붙이지 않았다 —
// 이미 fetch로 가져온 데이터를 클라이언트에서 조합해 해석하는 것뿐이라, 이 계산 자체는 실제
// 서비스에서도 프론트/백엔드 어느 쪽에 있어도 상관없다 (reports.ts가 그랬던 것처럼).
//
// 예전엔 WardDetail.recommendedCombo(옛 목업 결합)의 고정 임계값(단백질 55g 미만/나트륨
// 1800mg 초과)으로 판단했는데, 그 임계값이 사람마다 다른 실제 목표치와 무관해서 records-
// view.tsx의 "오늘 영양성분 분석"과 기준이 어긋났다 — 이제 같은 목표치 기반으로 통일한다
// (2026-08-18 피드백, computeTodayNutritionSnapshot 참고).

import type { Ward } from "@/lib/wards";
import type { MealLogEntry } from "@/lib/meal-log-store";
import type { TodayNutritionSnapshot } from "@/lib/banchan-recommendation";
import { getDish } from "@/lib/dishes";

export type NutrientDeficiency = "단백질부족" | "나트륨과다" | "정상";

export type HealthInsight = {
  wardId: string;
  generatedAt: string;
  deficiencies: NutrientDeficiency[];
  /** 최근 잔반율이 높았던 반찬들의 재료 — 레시피 추천이 "이 재료로 뭘 해먹을지" 고르는 데 쓴다.
   *  잔반을 고려하지 않아야 하는 화면(예: 이용자 섭취기록의 오늘 결핍 기반 추천)은 빈 배열의
   *  recentMealLogs를 넘기면 이 값도 자연히 빈 배열이 된다. */
  frequentLeftoverIngredients: string[];
  /** true면 보호자에게 푸시 알림을 보낼 만한 신호 (notifications.ts의 "잔반이상" 타입과 연결) */
  abnormal: boolean;
  summary: string;
};

// 목표치 대비 몇 %부터 "부족/과다"로 볼지 — 딱 100%로 잡으면 목표치에 살짝만 못 미쳐도 매번
// 경고가 떠서 너무 시끄럽다. 목표치가 없으면(건강 프로필 미입력 등) 그 항목은 판단하지 않는다.
const LOW_PROTEIN_RATIO = 0.9;
const HIGH_SODIUM_RATIO = 1.1;
const HIGH_LEFTOVER_THRESHOLD_PERCENT = 40;

export function deriveHealthInsight(
  ward: Ward,
  todayNutrition: TodayNutritionSnapshot,
  recentMealLogs: MealLogEntry[]
): HealthInsight {
  const deficiencies: NutrientDeficiency[] = [];
  if (todayNutrition.hasData) {
    if (
      todayNutrition.targetProteinG != null &&
      todayNutrition.proteinG < todayNutrition.targetProteinG * LOW_PROTEIN_RATIO
    ) {
      deficiencies.push("단백질부족");
    }
    if (
      todayNutrition.targetSodiumMg != null &&
      todayNutrition.sodiumMg > todayNutrition.targetSodiumMg * HIGH_SODIUM_RATIO
    ) {
      deficiencies.push("나트륨과다");
    }
  }
  if (deficiencies.length === 0) deficiencies.push("정상");

  // 최근 기록에서 "많이 남긴"(잔반율 40% 이상) 반찬의 재료를 모아, 2번 이상 반복된 것만 남긴다 —
  // 한 번 우연히 남긴 반찬 재료까지 추천에 반영하면 너무 시끄러워서, 반복성을 최소한의 기준으로 뒀다.
  const leftoverIngredientCounts = new Map<string, number>();
  for (const log of recentMealLogs) {
    for (const compartment of log.compartments) {
      if (compartment.leftoverPercent < HIGH_LEFTOVER_THRESHOLD_PERCENT) continue;
      const dish = getDish(compartment.dishId);
      for (const ingredient of dish?.ingredients ?? []) {
        leftoverIngredientCounts.set(ingredient, (leftoverIngredientCounts.get(ingredient) ?? 0) + 1);
      }
    }
  }
  const frequentLeftoverIngredients = [...leftoverIngredientCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([ingredient]) => ingredient);

  const abnormal =
    !deficiencies.includes("정상") || ward.lastMeal.tone === "미응답" || frequentLeftoverIngredients.length > 0;

  const summary = abnormal
    ? "최근 식사 데이터에서 주의가 필요한 신호가 발견됐어요."
    : "최근 건강 · 식사 데이터가 안정적이에요.";

  return {
    wardId: ward.id,
    generatedAt: new Date().toISOString(),
    deficiencies,
    frequentLeftoverIngredients,
    abnormal,
    summary,
  };
}
