import { Ward, WardDetail } from "@/lib/wards";
import { recentKstDateKeys } from "@/lib/ward-meal-dashboard";

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

// 예전엔 이 자리가 "2026.07.21 ~ 2026.07.27"/"2026년 7월"로 하드코딩돼 있었다 — 화면에 실제
// 백엔드 수치(완료율·영양소 평균)가 섞여 나와도 기간 라벨만은 항상 그 고정 문자열이라, 오늘
// 날짜가 그 범위를 한참 지나도 안 바뀌는 티가 났다(2026-08-26 피드백, "목업인 거 같은데").
// recentKstDateKeys가 report-view.tsx의 실제 조회 기간(주간 7일/월간 30일 rolling)과 같은
// 기준(KST)으로 날짜를 만들어주므로 그대로 재사용한다.
function formatRangeLabel(period: ReportPeriod): string {
  const days = period === "주간" ? 7 : 30;
  const keys = recentKstDateKeys(days);
  const start = keys[0].replaceAll("-", ".");
  const end = keys[keys.length - 1].replaceAll("-", ".");
  if (period === "주간") return `${start} ~ ${end}`;
  const [year, month] = keys[keys.length - 1].split("-");
  return `${year}년 ${Number(month)}월`;
}

export function getNutritionReport(
  ward: Ward,
  detail: WardDetail,
  period: ReportPeriod
): NutritionReport {
  const completeCount = detail.mealHistory.filter((m) => m === "완식").length;
  const completeRate = Math.round((completeCount / detail.mealHistory.length) * 100);

  const notes: string[] = [];
  if (completeRate < 70) notes.push("최근 섭취 완료율이 낮아 확인이 필요해요.");
  if (detail.recommendedCombo.totalSodiumMg <= 1500) notes.push("저염 목표치를 꾸준히 지키고 있어요.");
  notes.push(`오늘 조합 기준 단백질 ${detail.recommendedCombo.totalProteinG}g으로 구성되어 있어요.`);

  return {
    period,
    rangeLabel: formatRangeLabel(period),
    completeRate,
    avgSodiumMg: detail.recommendedCombo.totalSodiumMg,
    avgProteinG: detail.recommendedCombo.totalProteinG,
    avgKcal: detail.recommendedCombo.totalKcal,
    notes,
  };
}
