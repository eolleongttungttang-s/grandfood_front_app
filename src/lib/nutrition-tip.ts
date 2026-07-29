import { WardDetail } from "@/lib/wards";

export function getNutritionTip(detail: WardDetail): string {
  if (detail.recommendedCombo.totalProteinG >= 65) {
    return "오늘은 단백질을 더 챙기세요. 두부·생선·고기 반찬을 남기지 말아 주세요.";
  }
  if (detail.recommendedCombo.totalSodiumMg <= 1500) {
    return "오늘은 국물을 적게 드시는 게 좋아요. 짠 음식은 조금만 드세요.";
  }
  return "오늘도 골고루 든든하게 챙겨 드세요.";
}
