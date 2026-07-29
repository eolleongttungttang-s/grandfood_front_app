// Ward/WardDetail — B2C(반찬가게) 피벗의 핵심 타입. B2G(정부 위탁 돌봄) 버전에서는
// 어르신이 정부 시설(facility)에 속하고 사회복지사(caseWorker)가 담당했지만,
// 지금은 파트너 반찬가게(partnerStoreId)가 그 역할을 대신한다.

import { seedFromId } from "@/lib/seed";
import { getHealthProfile, type HealthProfileView } from "@/lib/health-profile";
import { matchDishes, type DishCombo } from "@/lib/recommendation";
import { deliveryStore, wardDeliveries } from "@/lib/delivery";
import type { AllergyTag } from "@/lib/dishes";

export type WardStatus = "확인 필요" | "관찰중" | "양호";
export type MealTone = "완식" | "소량" | "미응답";

export type Ward = {
  id: string;
  name: string;
  age: number;
  gender: "여" | "남";
  address: string;
  /** 담당 반찬가게. B2G 버전의 facility/caseWorker(정부 시설·사회복지사)를 대체 —
   *  문의도 이제 이 매장으로 하면 된다 (partner-stores.ts 참고). */
  partnerStoreId: string;
  /** 보호자 화면에서 보여줄 관계 표기 (본인 화면에서는 사용하지 않음) */
  relationToGuardian: string;
  /** 여러 부모님(양가)을 등록해 관리하는 경우 구분용 그룹명 */
  familyGroup: string;
  /** 이 대상자를 함께 보고 있는 다른 보호자 (형제자매 등 가족 공유) */
  coGuardians: string[];
  conditions: string[];
  status: WardStatus;
  lastMeal: { tone: MealTone; label: string };
};

export const WARDS: Ward[] = [
  {
    id: "001",
    name: "박순자",
    age: 82,
    gender: "여",
    address: "역삼1동",
    partnerStoreId: "store-yeoksam",
    relationToGuardian: "어머니",
    familyGroup: "본가",
    coGuardians: ["박은정 (딸)"],
    conditions: ["고혈압", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "3일째 미응답" },
  },
  {
    id: "006",
    name: "한상옥",
    age: 88,
    gender: "여",
    address: "청담동",
    partnerStoreId: "store-cheongdam",
    relationToGuardian: "할머니",
    familyGroup: "본가",
    coGuardians: [],
    conditions: ["치매 초기", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "4일째 미응답" },
  },
  {
    id: "008",
    name: "윤태식",
    age: 91,
    gender: "남",
    address: "대치2동",
    partnerStoreId: "store-daechi",
    relationToGuardian: "할아버지",
    familyGroup: "처가",
    coGuardians: ["윤서연 (아내)"],
    conditions: ["심부전", "고혈압"],
    status: "관찰중",
    lastMeal: { tone: "소량", label: "어제 소량 섭취" },
  },
];

export function getWard(id: string): Ward | undefined {
  return WARDS.find((w) => w.id === id);
}

export type WardDetail = {
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

export function getWardDetail(ward: Ward): WardDetail {
  const s = seedFromId(ward.id);
  const has = (keyword: string) => ward.conditions.some((c) => c.includes(keyword));
  const allergies = [ALLERGY_POOL[s % ALLERGY_POOL.length]];
  const allergyTags = allergies.map(labelToAllergyTag).filter((t): t is AllergyTag => t !== null);

  const medications: { name: string; schedule: string }[] = [];
  if (has("고혈압")) medications.push({ name: "암로디핀 5mg", schedule: "1일 1회 · 아침" });
  if (has("당뇨")) medications.push({ name: "메트포르민 500mg", schedule: "1일 2회 · 식후" });
  if (has("심부전")) medications.push({ name: "이뇨제", schedule: "1일 1회 · 아침" });
  if (medications.length === 0)
    medications.push({ name: "특이 복약 없음", schedule: "-" });

  const chewingNote =
    ward.age >= 85
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
    conditions: ward.conditions,
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
