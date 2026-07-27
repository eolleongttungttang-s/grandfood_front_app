import { Ward, WardDetail } from "@/lib/wards";

export type ReportPeriod = "주간" | "월간";

export type NutritionReport = {
  period: ReportPeriod;
  rangeLabel: string;
  completeRate: number;
  avgSodiumMg: number;
  avgProteinG: number;
  avgKcal: number;
  notes: string[];
};

export function getNutritionReport(
  ward: Ward,
  detail: WardDetail,
  period: ReportPeriod
): NutritionReport {
  const completeCount = detail.mealHistory.filter((m) => m === "완식").length;
  const completeRate = Math.round((completeCount / detail.mealHistory.length) * 100);

  const notes: string[] = [];
  if (completeRate < 70) notes.push("최근 섭취 완료율이 낮아 담당자 확인이 필요해요.");
  if (detail.diet.sodiumMg <= 1500) notes.push("저염식 목표치를 꾸준히 지키고 있어요.");
  notes.push(`목표 단백질 ${detail.diet.proteinG}g 기준으로 식단이 구성되고 있어요.`);

  return {
    period,
    rangeLabel: period === "주간" ? "2026.07.21 ~ 2026.07.27" : "2026년 7월",
    completeRate,
    avgSodiumMg: detail.diet.sodiumMg,
    avgProteinG: detail.diet.proteinG,
    avgKcal: detail.diet.kcal,
    notes,
  };
}
