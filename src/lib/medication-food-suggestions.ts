"use client";

// 합의안 2번 "약물표 -> 기피음식 자동 제안"의 데이터를 만든다.
//
// 새 백엔드 API가 필요 없다 — 이미 있는 POST /medication/advise(medication.ts의
// adviseByGroups)가 돌려주는 food_cautions를 그대로 "제안" 목록으로 쓴다. 자동으로
// 기피음식에 채워 넣지 않고 "이런 이유로 조심하면 좋아요, 기피 목록에 추가할까요?"까지만
// 보여주고 실제로 추가할지는 사용자가 고른다 — 자동 확정은 AI 진단처럼 보여 법적
// 리스크가 있다는 게 팀 합의 내용이다(김민영 우려, 상혁 동의).
//
// grandfood_backend/src/domains/medication/service.py의 build_advice()가 이미
// food_cautions를 만들어주는지 확인용/agenda_final_avoid_food_suggestion/backend/
// smoke_test.py로 실제 표(CSV) 데이터로 확인했다 — catalog.py나 CSV를 하나도 안 고치고
// 그대로 동작한다.

import { adviseByGroups, FoodCaution } from "@/lib/medication";

// care-profile.ts의 MEDICATION_POOL(한국어 라벨) -> 백엔드 medication/catalog.py 코드.
// backend-auth.ts의 CONDITION_LABEL_TO_BACKEND_FLAG와 같은 이유로 둔다 — 화면은 한국어
// 라벨로 고르게 하고, API는 코드로 받는다.
//
// 골다공증약/치매약(osteoporosis/dementia)은 catalog.py의 DRUG_GROUPS엔 처음부터
// 있었지만 health/service.py의 MedicationFlag enum엔 2026-08-21에야 추가됐다 — 그 전엔
// 이 값을 medication_flags로 보내면 백엔드가 요청 전체를 422로 거부했다(같이 실리는
// condition_flags·키·몸무게까지 저장 실패하는 문제로 이어짐, backend-auth.ts의
// getBackendMedicationFlags 참고). 지금은 MedicationFlag/rag의 라벨 매핑까지 다 맞춰서
// 이 매핑표가 가리키는 두 값 모두 정상 동작한다.
export const MEDICATION_LABEL_TO_BACKEND_FLAG: Record<string, string> = {
  "혈압약": "blood_pressure",
  "당뇨약": "diabetes",
  "관절염약(소염진통제)": "arthritis_pain_reliever",
  "고지혈증약": "dyslipidemia",
  "심장약": "heart",
  "수면제 · 신경안정제": "sedative",
  "항응고제(와파린 등)": "anticoagulant",
  "골다공증약": "osteoporosis",
  "치매약": "dementia",
};

// 마이페이지에 GET /users/{id}의 medication_flags(코드)를 화면에 보여줄 때 쓰는 역방향
// 매핑 — 위 표를 그대로 뒤집은 것이다. profile-view.tsx가 이걸 쓴다.
export const BACKEND_MEDICATION_FLAG_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(MEDICATION_LABEL_TO_BACKEND_FLAG).map(([label, flag]) => [flag, label])
);

export type FoodSuggestion = {
  food: string;
  reason: string;
  /** medication.ts 상단 "⚠️ 화면에 반드시 지켜야 할 것" 2번(출처를 같이 보여줄 것) —
   *  MedicationFoodSuggestionStep.tsx가 이 필드를 reason과 함께 툴팁에 넣어서 보여준다. */
  source: string;
};

export type FoodSuggestionResult = {
  suggestions: FoodSuggestion[];
  /** medication.ts 상단 "⚠️ 화면에 반드시 지켜야 할 것" 1번(항상 노출) — 약군이
   *  하나도 없거나(codes.length === 0) 제안이 아예 없으면 null(호출부가 그 경우 카드
   *  자체를 안 그리므로 보여줄 자리가 없다). */
  consultNotice: string | null;
};

/** 선택한 약(한국어 라벨)을 근거로 "조심하면 좋은 음식" 제안 목록을 가져온다.
 *
 * MEDICATION_POOL에 없는 라벨(예: 기타 약 자유 입력)은 매핑이 없어 조용히 무시한다 —
 * 근거 표 자체가 표준화된 약군 코드로만 조회되는 구조라, 자유 텍스트 약 이름으로는
 * 애초에 조회할 방법이 없다(medication/service.py 상단 설명 참고).
 */
export async function fetchFoodSuggestions(medicationLabels: string[]): Promise<FoodSuggestionResult> {
  const codes = medicationLabels
    .map((label) => MEDICATION_LABEL_TO_BACKEND_FLAG[label])
    .filter((code): code is string => code !== undefined);

  if (codes.length === 0) return { suggestions: [], consultNotice: null };

  const advice = await adviseByGroups({ medicationGroups: codes });
  return { suggestions: dedupeByFood(advice.foodCautions), consultNotice: advice.consultNotice };
}

// 같은 음식이 여러 약군 근거로 중복 등장할 수 있다(예: 자몽이 혈압약/심장약/수면제 등
// 여러 근거에서 동시에 나옴) — 화면에 같은 체크박스가 두 번 뜨지 않게 이름 기준으로
// 한 번만 남긴다. 사유(reason)/출처(source)는 처음 매칭된 약군 것을 대표로 쓴다.
function dedupeByFood(cautions: FoodCaution[]): FoodSuggestion[] {
  const seen = new Set<string>();
  const result: FoodSuggestion[] = [];
  for (const c of cautions) {
    if (seen.has(c.food)) continue;
    seen.add(c.food);
    result.push({ food: c.food, reason: `${c.drugGroupLabel} 관련 주의`, source: c.source });
  }
  return result;
}
