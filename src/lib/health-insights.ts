// "건강데이터 결합 해석" 단계 — 건강 프로필/오늘의 추천 조합(WardDetail)과 최근 식사 기록(잔반
// 분석 결과)을 합쳐서 "지금 이 어르신에게 주의할 신호가 있는지" 판단한다.
// reports.ts/nutrition-tip.ts와 같은 계열의 순수 파생 계산이라 TODO(backend) 마커를 붙이지 않았다 —
// 이미 fetch로 가져온 데이터를 클라이언트에서 조합해 해석하는 것뿐이라, 이 계산 자체는 실제
// 서비스에서도 프론트/백엔드 어느 쪽에 있어도 상관없다 (reports.ts가 그랬던 것처럼).

import type { Ward, WardDetail } from "@/lib/wards";
import type { MealLogEntry } from "@/lib/meal-log-store";
import { getDish } from "@/lib/dishes";

export type NutrientDeficiency = "단백질부족" | "나트륨과다" | "정상";

export type HealthInsight = {
  wardId: string;
  generatedAt: string;
  deficiencies: NutrientDeficiency[];
  /** 최근 잔반율이 높았던 반찬들의 재료 — 레시피 추천이 "이 재료로 뭘 해먹을지" 고르는 데 쓴다 */
  frequentLeftoverIngredients: string[];
  /** true면 보호자에게 푸시 알림을 보낼 만한 신호 (notifications.ts의 "잔반이상" 타입과 연결) */
  abnormal: boolean;
  summary: string;
};

const LOW_PROTEIN_THRESHOLD_G = 55;
const HIGH_SODIUM_THRESHOLD_MG = 1800;
const HIGH_LEFTOVER_THRESHOLD_PERCENT = 40;

export function deriveHealthInsight(
  ward: Ward,
  detail: WardDetail,
  recentMealLogs: MealLogEntry[]
): HealthInsight {
  const deficiencies: NutrientDeficiency[] = [];
  if (detail.recommendedCombo.totalProteinG < LOW_PROTEIN_THRESHOLD_G) deficiencies.push("단백질부족");
  if (detail.recommendedCombo.totalSodiumMg > HIGH_SODIUM_THRESHOLD_MG) deficiencies.push("나트륨과다");
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
