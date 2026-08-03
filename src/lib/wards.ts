// WardDetail — B2C(반찬가게) 피벗의 핵심 타입. B2G(정부 위탁 돌봄) 버전에서는
// 어르신이 정부 시설(facility)에 속하고 사회복지사(caseWorker)가 담당했지만,
// 지금은 파트너 반찬가게(partnerStoreId)가 그 역할을 대신한다.
//
// Ward 타입/WARDS 배열/getWard()는 ward-registry.ts로 옮겼다 — generateStaticParams()가
// 서버(빌드 타임)에서 이 파일을 그대로 import하면, 아래에서 쓰는 건강 프로필/배송 store들
// (local-store.ts 기반, "use client")까지 같이 로드되면서 빌드가 깨지기 때문이다.
// 이 파일은 그 registry를 다시 export해서, 기존에 "@/lib/wards"에서 Ward를 가져오던
// 코드들은 그대로 두고 쓸 수 있게 했다.

import { seedFromId } from "@/lib/seed";
import { getHealthProfile, type HealthProfileView } from "@/lib/health-profile";
import { getCareProfile } from "@/lib/care-profile";
import { matchDishes, type DishCombo } from "@/lib/recommendation";
import { deliveryStore, wardDeliveries } from "@/lib/delivery";
import type { AllergyTag } from "@/lib/dishes";
import { WARDS, getWard, type Ward, type WardStatus, type MealTone } from "@/lib/ward-registry";

export { WARDS, getWard };
export type { Ward, WardStatus, MealTone };

export type WardDetail = {
  /** 진단 질환 — 설문(care-profile.ts)에 응답이 있으면 그걸, 없으면 ward-registry.ts의 대체값을 쓴다. */
  conditions: string[];
  allergies: string[];
  medications: { name: string; schedule: string }[];
  chewingNote: string;
  /** 건강 프로필 등록 단계의 결과 (자가 입력 또는 마이데이터 연동). health-profile.ts 참고 */
  healthProfile: HealthProfileView;
  /** AI 반찬 매칭 결과 — 한정된 카탈로그에서 오늘 추천된 조합. recommendation.ts 참고 */
  recommendedCombo: DishCombo;
  /** 오늘 배달 예정 시각 */
  deliveryEta: string;
  /** 오늘 잔반율(%) — 최근 응답 상태에서 추정한 요약값 (사진 기반 상세 분석은 meal-log-store.ts) */
  leftoverPercent: number;
  mealHistory: MealTone[];
  /** 다음 배송 예정일 — B2G 버전의 사회복지사 방문 일정(nextVisit)을 대체 */
  nextDeliveryDate: string;
};

const ALLERGY_POOL = ["없음", "고등어(해산물)", "메밀", "갑각류", "우유", "견과류"];

// 표시용 알레르기 라벨("고등어(해산물)")에서 반찬 매칭에 쓸 알레르기 태그("해산물")만 뽑아낸다.
// 라벨은 사람이 읽을 문구(생선 이름 포함)이고, 태그는 dishes.ts의 AllergyTag와 맞아떨어지는 값이라 분리했다.
const ALLERGY_TAG_KEYWORDS: AllergyTag[] = ["해산물", "메밀", "갑각류", "우유", "견과류"];
function labelToAllergyTag(label: string): AllergyTag | null {
  return ALLERGY_TAG_KEYWORDS.find((tag) => label.includes(tag)) ?? null;
}

// 설문(care-profile.ts)의 알레르기/기피재료는 자유 텍스트나 넓은 카테고리("해산물 · 생선")라
// dishes.ts의 좁은 AllergyTag 그대로 안 적히는 경우가 많다. 흔한 재료명 몇 개를 태그로
// 미리 매핑해둬서, "새우 알레르기 있어요" 같은 답도 실제 반찬 필터링(갑각류)에 반영되게 한다.
const ALLERGEN_KEYWORD_TO_TAG: Record<string, AllergyTag> = {
  새우: "갑각류",
  꽃게: "갑각류",
  대게: "갑각류",
  게살: "갑각류",
  랍스터: "갑각류",
  가재: "갑각류",
  고등어: "해산물",
  생선: "해산물",
  오징어: "해산물",
  조개: "해산물",
  모밀: "메밀",
  치즈: "우유",
  요거트: "우유",
  땅콩: "견과류",
  호두: "견과류",
  아몬드: "견과류",
};

function textToAllergyTags(text: string): AllergyTag[] {
  const found = new Set<AllergyTag>();
  const direct = labelToAllergyTag(text);
  if (direct) found.add(direct);
  for (const [keyword, tag] of Object.entries(ALLERGEN_KEYWORD_TO_TAG)) {
    if (text.includes(keyword)) found.add(tag);
  }
  return [...found];
}

export function getWardDetail(ward: Ward): WardDetail {
  const s = seedFromId(ward.id);

  // 설문(care-profile.ts)을 끝까지 마친 응답이 있으면 그게 진짜 정보고, ward-registry.ts의
  // conditions/시드 기반 값들은 "아직 아무도 설문에 응답 안 했을 때"의 대체값으로만 쓴다.
  const careProfile = getCareProfile(ward.id);
  const hasSurveyData = careProfile?.completed === true;

  const conditions = hasSurveyData ? careProfile.conditions : ward.conditions;
  const has = (keyword: string) => conditions.some((c) => c.includes(keyword));

  const allergies = hasSurveyData
    ? careProfile.hasAllergy && careProfile.allergyNote.trim()
      ? careProfile.allergyNote
          .split(/[,·/]/)
          .map((s2) => s2.trim())
          .filter(Boolean)
      : ["없음"]
    : [ALLERGY_POOL[s % ALLERGY_POOL.length]];

  const allergyTags = hasSurveyData
    ? [
        ...(careProfile.hasAllergy ? textToAllergyTags(careProfile.allergyNote) : []),
        ...careProfile.dislikedIngredients.flatMap(textToAllergyTags),
      ].filter((tag, i, arr) => arr.indexOf(tag) === i)
    : allergies.map(labelToAllergyTag).filter((t): t is AllergyTag => t !== null);

  const medications: { name: string; schedule: string }[] = [];
  if (hasSurveyData) {
    if (careProfile.takesMedication) {
      medications.push({
        name: careProfile.medicationNote.trim() || "복용 중 (상세 미입력)",
        schedule: "설문 응답 기준",
      });
    } else {
      medications.push({ name: "특이 복약 없음", schedule: "-" });
    }
  } else {
    if (has("고혈압")) medications.push({ name: "암로디핀 5mg", schedule: "1일 1회 · 아침" });
    if (has("당뇨")) medications.push({ name: "메트포르민 500mg", schedule: "1일 2회 · 식후" });
    if (has("심부전")) medications.push({ name: "이뇨제", schedule: "1일 1회 · 아침" });
    if (medications.length === 0) medications.push({ name: "특이 복약 없음", schedule: "-" });
  }

  const chewingNote = hasSurveyData
    ? careProfile.chewingDifficulty
      ? "설문에서 씹거나 삼키는 게 불편하다고 답하셨어요"
      : "설문에서 저작 · 삼킴에 불편함이 없다고 답하셨어요"
    : ward.age >= 85
      ? "틀니 사용 · 질긴 육류는 다짐육으로 대체하고 있어요"
      : ward.age >= 80
        ? "일반식 가능 · 질긴 음식만 주의하고 있어요"
        : "저작 · 연하 상태 정상이에요";

  // 예전엔 이 수치들이 국가검진 OCR 결과였는데, 지금은 "아직 아무도 건강 프로필을 등록/연동하지
  // 않았을 때의 기본값"이 됐다. getHealthProfile()이 실제 등록된 값이 있으면 그걸 대신 돌려준다.
  const systolicBP = 118 + (has("고혈압") ? 24 : 0) + (s % 7);
  const fastingGlucose = 92 + (has("당뇨") ? 34 : 0) + (s % 10);
  const hba1c = Number((5.6 + (has("당뇨") ? 1.3 : 0) + (s % 5) * 0.1).toFixed(1));
  const weightKg =
    (ward.gender === "여" ? 54 : 66) - Math.max(0, ward.age - 75) * 0.3;

  const fallbackHealthProfile: HealthProfileView = {
    wardId: ward.id,
    source: "self_reported",
    systolicBP,
    fastingGlucose,
    hba1c,
    weightKg: Number(weightKg.toFixed(1)),
    updatedAt: "2026.05.14",
  };
  const healthProfile = getHealthProfile(ward.id, fallbackHealthProfile);

  // AI 반찬 매칭 — 매칭 서비스(recommendation.ts)는 진단 질환/알레르기만 알 뿐 정확한 혈압·혈당
  // 수치는 모른다고 가정했으므로, 그 수치에 대한 설명은 여기서 조합의 reasons에 덧붙인다.
  const combo = matchDishes({
    wardId: ward.id,
    storeId: ward.partnerStoreId,
    conditions,
    allergyTags,
    statusHint: ward.status,
  });
  const vitalsReasons: string[] = [];
  if (has("고혈압"))
    vitalsReasons.push(`수축기 ${healthProfile.systolicBP}mmHg → 나트륨 섭취를 줄이는 게 중요해요`);
  if (has("당뇨"))
    vitalsReasons.push(`공복혈당 ${healthProfile.fastingGlucose}mg/dL → 단순당을 줄이는 게 중요해요`);
  const recommendedCombo: DishCombo = {
    ...combo,
    reasons: vitalsReasons.length > 0 ? [...vitalsReasons, ...combo.reasons] : combo.reasons,
  };

  const tailCount =
    ward.lastMeal.tone === "미응답" ? 3 : ward.lastMeal.tone === "소량" ? 2 : 0;
  const mealHistory: MealTone[] = [];
  for (let i = 0; i < 14; i++) {
    if (i >= 14 - tailCount) {
      mealHistory.push(ward.lastMeal.tone);
    } else {
      mealHistory.push((s + i) % 5 === 0 ? "소량" : "완식");
    }
  }

  const deliveryEta = ward.status === "확인 필요" ? "12:30" : "12:00";

  const leftoverPercent =
    ward.lastMeal.tone === "미응답" ? 100 : ward.lastMeal.tone === "소량" ? 55 : 5;

  // 다음 배송일 — 실제 예정된 배송이 있으면 그 날짜를, 없으면 오늘 기준 가까운 날짜를 대략 보여준다.
  const nextScheduled = wardDeliveries(deliveryStore.read(), ward.id).find((d) => d.status === "예정");
  const nextDeliveryDate = nextScheduled?.scheduledDate ?? "2026.07.29";

  return {
    conditions,
    allergies,
    medications,
    chewingNote,
    healthProfile,
    recommendedCombo,
    deliveryEta,
    leftoverPercent,
    mealHistory,
    nextDeliveryDate,
  };
}
