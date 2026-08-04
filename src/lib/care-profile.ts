// "생활·돌봄 정보" 최초 설문. 앱을 처음 시작하기 전(초대 동의 직후) 한 번 받고,
// 이후엔 마이(프로필) 화면에서 언제든 다시 입력해 고칠 수 있다.
// health-profile.ts(혈압 등 검진 수치)와 달리, 여기는 "생활 습관·돌봄" 쪽 정보라 파일을 분리했다.

import { createLocalStore } from "@/lib/local-store";

export type LivingArrangement = "alone" | "with_family" | "care_facility";
export type MobilityLevel = "independent" | "needs_assistance" | "bedridden";

export const DISLIKED_INGREDIENT_POOL = [
  "돼지고기",
  "소고기",
  "닭고기",
  "해산물 · 생선",
  "우유 · 유제품",
  "견과류",
  "향신료(마늘·파 등 강한 향)",
  "맵고 자극적인 음식",
] as const;

// 추천 로직(recommendation.ts)이 저염/고단백 여부를 판단할 때 보는 것과 같은 질환명.
// 지금까지 ward-registry.ts에 하드코딩돼 있던 가짜 conditions를 대체하는 실제 입력값.
export const CONDITION_POOL = ["고혈압", "당뇨", "심부전", "신장질환", "치매", "관절염"] as const;

export type RegisterCareProfileCommand = {
  wardId: string;
  mealsPerDay: 1 | 2 | 3 | 4;
  livingArrangement: LivingArrangement;
  dislikedIngredients: string[];
  dislikedIngredientsNote: string;
  hasAllergy: boolean;
  allergyNote: string;
  conditions: string[];
  conditionsNote: string;
  takesMedication: boolean;
  medicationNote: string;
  chewingDifficulty: boolean;
  mobilityLevel: MobilityLevel;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
};

export type CareProfileView = RegisterCareProfileCommand & {
  /** 설문을 끝까지 마쳤는지. "나중에 할게요"로 건너뛴 경우 false로 남아 보호자 화면에 미완료로 보인다. */
  completed: boolean;
  updatedAt: string;
  /**
   * "나중에 할게요"로 건너뛸 때, 실제로 답하고 지나간 단계 수(0~CARE_SURVEY_TOTAL_STEPS).
   * 이 값보다 뒤에 있는 단계의 필드는 사용자가 답한 게 아니라 EMPTY_CARE_PROFILE_COMMAND의
   * 기본값이 그대로 들어있는 것이므로, 화면에서 실제 답변처럼 보여주면 안 된다.
   * completed:true(끝까지 완료)면 전 단계가 답변된 것으로 취급한다.
   */
  answeredStep: number;
};

// care-survey-view.tsx의 각 설문 단계(step)가 어떤 필드를 채우는지에 대한 단일 소스.
// 두 파일이 어긋나면 진행도 판정이 틀어지므로, step 번호를 직접 쓰지 말고 이 상수를 참조할 것.
export const CARE_SURVEY_STEP = {
  mealsPerDay: 0,
  livingArrangement: 1,
  dislikedIngredients: 2,
  allergy: 3,
  conditions: 4,
  medication: 5,
  chewingDifficulty: 6,
  mobility: 7,
  emergencyContact: 8,
} as const;

export const CARE_SURVEY_TOTAL_STEPS = Object.keys(CARE_SURVEY_STEP).length;

export function isCareProfileStepAnswered(
  profile: CareProfileView,
  step: number
): boolean {
  return profile.completed || profile.answeredStep > step;
}

export const EMPTY_CARE_PROFILE_COMMAND: RegisterCareProfileCommand = {
  wardId: "",
  mealsPerDay: 3,
  livingArrangement: "with_family",
  dislikedIngredients: [],
  dislikedIngredientsNote: "",
  hasAllergy: false,
  allergyNote: "",
  conditions: [],
  conditionsNote: "",
  takesMedication: false,
  medicationNote: "",
  chewingDifficulty: false,
  mobilityLevel: "independent",
  emergencyContactName: "",
  emergencyContactRelation: "",
  emergencyContactPhone: "",
};

export const LIVING_ARRANGEMENT_LABEL: Record<LivingArrangement, string> = {
  alone: "혼자 거주",
  with_family: "가족과 동거",
  care_facility: "요양시설",
};

export const MOBILITY_LABEL: Record<MobilityLevel, string> = {
  independent: "혼자 잘 걸어다님",
  needs_assistance: "보행 시 도움 필요",
  bedridden: "누워서 지내는 시간 많음",
};

export const careProfileStore = createLocalStore<Record<string, CareProfileView>>(
  "grandfood-app-care-profile",
  {}
);

export function getCareProfile(wardId: string): CareProfileView | undefined {
  return careProfileStore.read()[wardId];
}

// TODO(backend): POST /wards/:id/care-profile — 최초 설문(생활·돌봄 정보) 등록.
export async function registerCareProfile(cmd: RegisterCareProfileCommand): Promise<CareProfileView> {
  const view: CareProfileView = {
    ...cmd,
    completed: true,
    answeredStep: CARE_SURVEY_TOTAL_STEPS,
    updatedAt: new Date().toISOString(),
  };
  careProfileStore.update((prev) => ({ ...prev, [cmd.wardId]: view }));
  return view;
}

// TODO(backend): POST /wards/:id/care-profile/skip — "나중에 할게요"로 건너뛴 사실만 기록.
// 지금까지 입력한 값은 남기되 completed만 false로 저장해, 보호자 화면에 "설문 미완료"로 표시할 수 있게 한다.
export async function skipCareProfile(
  wardId: string,
  partial: RegisterCareProfileCommand,
  answeredStep: number
): Promise<CareProfileView> {
  const view: CareProfileView = {
    ...partial,
    completed: false,
    answeredStep,
    updatedAt: new Date().toISOString(),
  };
  careProfileStore.update((prev) => ({ ...prev, [wardId]: view }));
  return view;
}
