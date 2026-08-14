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
import { CARE_SURVEY_STEP, getCareProfile, isCareProfileStepAnswered } from "@/lib/care-profile";
import { matchDishes, type DishCombo } from "@/lib/recommendation";
import { deliveryStore, wardDeliveries } from "@/lib/delivery";
import { PARTNER_STORES } from "@/lib/partner-stores";
import type { AllergyTag } from "@/lib/dishes";
import {
  WARDS,
  getWard,
  getWards,
  addWard,
  newWardDefaults,
  type Ward,
  type WardStatus,
  type MealTone,
} from "@/lib/ward-registry";

export { WARDS, getWard, getWards, addWard, newWardDefaults };
export type { Ward, WardStatus, MealTone };

export function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// 보호자 초대 동의(consent-view.tsx)든 이용자 본인 직접가입(signup/page.tsx)이든, 새 Ward를
// 만드는 규칙은 똑같다 — 담당 매장을 고를 사람(보호자)이 아직 없거나 알 수 없을 때는 첫 번째
// 파트너 매장으로 기본 배정하고, 나머지는 newWardDefaults()의 초기값을 그대로 쓴다. 두 곳에서
// 따로따로 이 리터럴을 만들면 규칙이 바뀔 때 한쪽만 고쳐지는 사고가 나기 쉬워 하나로 합쳤다.
export function createSelfWard(params: {
  id: string;
  name: string;
  birthDate: string;
  gender: "여" | "남";
  address: string;
}): Ward {
  return {
    id: params.id,
    name: params.name,
    age: calculateAge(params.birthDate),
    gender: params.gender,
    address: params.address,
    partnerStoreId: PARTNER_STORES[0].id,
    ...newWardDefaults(),
  };
}

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

  // 설문(care-profile.ts)에 실제로 답한 문항만 진짜 정보로 쓰고, ward-registry.ts의
  // conditions/시드 기반 값들은 "그 문항까지 아직 답 안 했을 때"의 대체값으로만 쓴다.
  // 예전엔 completed(끝까지 다 마쳤는지) 하나로만 갈랐는데, 그러면 "나중에 할게요"로
  // 건너뛰기 전에 실제로 답한 문항(예: 진단 질환에서 관절염 선택)까지도 전부 무시되고
  // ward-registry.ts의 가짜 값(고혈압/당뇨 등)이 뜨는 버그가 있었다 — 문항 단위로 갈라야 한다.
  const careProfile = getCareProfile(ward.id);
  const isAnswered = (step: number) => careProfile !== undefined && isCareProfileStepAnswered(careProfile, step);

  const hasConditionsData = isAnswered(CARE_SURVEY_STEP.conditions);
  const hasAllergyData = isAnswered(CARE_SURVEY_STEP.allergy);
  const hasDislikedIngredientsData = isAnswered(CARE_SURVEY_STEP.dislikedIngredients);
  const hasMedicationData = isAnswered(CARE_SURVEY_STEP.medication);
  const hasChewingData = isAnswered(CARE_SURVEY_STEP.chewingDifficulty);

  const conditions = hasConditionsData ? careProfile!.conditions : ward.conditions;
  const has = (keyword: string) => conditions.some((c) => c.includes(keyword));

  const allergies = hasAllergyData
    ? careProfile!.hasAllergy && careProfile!.allergyNote.trim()
      ? careProfile!.allergyNote
          .split(/[,·/]/)
          .map((s2) => s2.trim())
          .filter(Boolean)
      : ["없음"]
    : [ALLERGY_POOL[s % ALLERGY_POOL.length]];

  const allergyTags = [
    ...(hasAllergyData
      ? careProfile!.hasAllergy
        ? textToAllergyTags(careProfile!.allergyNote)
        : []
      : allergies.map(labelToAllergyTag).filter((t): t is AllergyTag => t !== null)),
    ...(hasDislikedIngredientsData ? careProfile!.dislikedIngredients.flatMap(textToAllergyTags) : []),
  ].filter((tag, i, arr) => arr.indexOf(tag) === i);

  const medications: { name: string; schedule: string }[] = [];
  if (hasMedicationData) {
    if (careProfile!.takesMedication) {
      // 목록에서 고른 약(medications)과 기타로 직접 적은 약(customMedications) 둘 다 이름+
      // 복용시간을 따로 들고 있어서(2026-08-14 피드백 — 기타 약이 여러 개면 각자 언제
      // 먹는지 구분돼야 함), 하나로 합쳐서 약마다 한 줄씩 보여준다.
      //
      // 이름이 빈 채로 남을 수 있다("기타 약 추가"만 누르고 이름을 안 적은 경우) — care-
      // survey-view.tsx의 설문 개요 화면은 이런 항목을 .filter(Boolean)으로 걸러내는데
      // 여기서도 안 걸러내면, 아래 소비자들(ward-detail-view.tsx/diet-view.tsx)이
      // key={m.name}으로 렌더링하다 빈 이름이 여러 개면 key 충돌까지 난다(코드 리뷰
      // 지적). trim 후 빈 이름은 건너뛰고, 같은 이름이 두 번 들어오는 경우(예: 목록에서
      // "혈압약"도 고르고 기타에도 "혈압약"이라고 또 적은 경우)도 같은 이유로 처음
      // 것만 남긴다.
      const seenNames = new Set<string>();
      for (const med of [...careProfile!.medications, ...careProfile!.customMedications]) {
        const name = med.name.trim();
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        medications.push({
          name,
          schedule: med.timings.length > 0 ? med.timings.join(" · ") : "복용 시간 미입력",
        });
      }
      if (medications.length === 0) {
        medications.push({ name: "복용 중 (상세 미입력)", schedule: "설문 응답 기준" });
      }
    } else {
      medications.push({ name: "특이 복약 없음", schedule: "-" });
    }
  } else {
    if (has("고혈압")) medications.push({ name: "암로디핀 5mg", schedule: "1일 1회 · 아침" });
    if (has("당뇨")) medications.push({ name: "메트포르민 500mg", schedule: "1일 2회 · 식후" });
    if (has("심부전")) medications.push({ name: "이뇨제", schedule: "1일 1회 · 아침" });
    if (medications.length === 0) medications.push({ name: "특이 복약 없음", schedule: "-" });
  }

  const chewingNote = hasChewingData
    ? careProfile!.chewingDifficulty
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
  // healthProfile.systolicBP/fastingGlucose는 이제 optional이라(설문에서 건너뛰면
  // undefined) — 이 추천 사유 문구에선 "미입력"을 보여줄 자리가 없으니, 바로 위에서
  // 계산해둔 시드 기반 수치로 대체한다(정확한 값은 아니지만, 대상자 상세 화면 자체는
  // 이미 healthProfile을 그대로 넘겨서 "미입력" 표시를 따로 한다 — 여기는 그 값과 별개).
  const vitalsReasons: string[] = [];
  if (has("고혈압"))
    vitalsReasons.push(
      `수축기 ${healthProfile.systolicBP ?? systolicBP}mmHg → 나트륨 섭취를 줄이는 게 중요해요`
    );
  if (has("당뇨"))
    vitalsReasons.push(
      `공복혈당 ${healthProfile.fastingGlucose ?? fastingGlucose}mg/dL → 단순당을 줄이는 게 중요해요`
    );
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
