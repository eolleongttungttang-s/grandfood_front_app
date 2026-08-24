import { NutrientDeficiency } from "@/lib/health-insights";

// 예전엔 WardDetail.recommendedCombo(항상 목업인 로컬 매칭 결과)의 나트륨/단백질 합계를
// 기준으로 문구를 골랐다 — 실제 건강 상태·식사 데이터와 무관하게 항상 같은 목업 조합만
// 봤다는 뜻(2026-08-24 피드백, "이 공지사항 완전 목업이지?"). health-insights.ts의
// deriveHealthInsight가 이미 실제 목표치(BMR/TDEE) 대비 오늘 배정 반찬 영양가로 결핍을
// 판단하고 있어서(records-view.tsx "오늘 영양성분 분석"과 동일 기준), 그 결과를 그대로
// 받아 문구만 고른다 — 화면마다 기준이 어긋나지 않도록 판단 로직은 여기서 새로 만들지 않는다.
export function getNutritionTip(deficiencies: NutrientDeficiency[]): string {
  if (deficiencies.includes("단백질부족")) {
    return "오늘은 단백질을 더 챙기세요. 두부·생선·고기 반찬을 남기지 말아 주세요.";
  }
  if (deficiencies.includes("나트륨과다")) {
    return "오늘은 국물을 적게 드시는 게 좋아요. 짠 음식은 조금만 드세요.";
  }
  return "오늘도 골고루 든든하게 챙겨 드세요.";
}
