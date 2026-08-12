// "건강 프로필 등록" 단계. B2G 모델에서는 사회복지사가 국가검진표를 스캔해 올려줬지만,
// B2C에서는 어르신/보호자 본인이 직접 입력하거나 마이데이터 연동으로 가져온다.
// 아직 아무도 등록하지 않은 ward는 wards.ts가 만들어주는 seed 기반 기본값(fallback)을 그대로 쓰므로,
// 이 store가 비어 있어도 기존 화면들은 지금처럼 잘 작동한다.

import { createLocalStore } from "@/lib/local-store";

export type HealthProfileSource = "self_reported" | "mydata_linked";

// KDRI 원본 신체활동수준(PAL) 4단계. grandfood_backend의 ActivityLevel도 이제 IOM(2005)/
// KDRI 2020 EER 산출 기준 4단계(SEDENTARY/LOW_ACTIVE/ACTIVE/VERY_ACTIVE, health/
// nutrition_targets.py)를 그대로 쓰므로 1:1로 대응한다 — 예전엔 백엔드가 3단계뿐이라
// toBackendActivityLevel()로 값을 눌러서 보내는 임시 다리가 있었는데, 지금은 그냥
// 값 이름만 스네이크케이스 영문으로 바꿔주면 된다.
export type ActivityLevel = "inactive" | "light" | "active" | "very_active";

export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, string> = {
  inactive: "비활동적 (운동 안 함, 주로 앉아서·누워서 생활)",
  light: "저활동적 (가벼운 운동·걷기 주 1~3회)",
  active: "활동적 (중강도 운동 주 3~5회)",
  very_active: "매우 활동적 (고강도 운동 주 6회 이상)",
};

export type BackendActivityLevel = "sedentary" | "low_active" | "active" | "very_active";

export function toBackendActivityLevel(level: ActivityLevel): BackendActivityLevel {
  switch (level) {
    case "inactive":
      return "sedentary";
    case "light":
      return "low_active";
    case "active":
      return "active";
    case "very_active":
      return "very_active";
  }
}

export type RegisterHealthProfileCommand = {
  wardId: string;
  source: HealthProfileSource;
  systolicBP: number;
  fastingGlucose: number;
  hba1c: number;
  weightKg: number;
  // 아래 3개는 이번에 새로 추가됨 — 기존 값과 달리 optional이다. 기존 필드는 항상 값이
  // 있었던 것처럼 화면에서 바로 렌더링하는 곳이 많아서(옵셔널로 바꾸면 그 화면들을 전부
  // 방어 코드로 고쳐야 함), 새 필드만 "입력 안 했을 수도 있음"을 타입으로 남겨둔다.
  heightCm?: number;
  diastolicBP?: number;
  activityLevel?: ActivityLevel;
};

export type HealthProfileView = RegisterHealthProfileCommand & { updatedAt: string };

export const healthProfileStore = createLocalStore<Record<string, HealthProfileView>>(
  "grandfood-app-health-profile",
  {}
);

export function getHealthProfile(wardId: string, fallback: HealthProfileView): HealthProfileView {
  return healthProfileStore.read()[wardId] ?? fallback;
}

// TODO(backend): POST /wards/:id/health-profile — 검진 결과를 텍스트로 직접 입력해 등록.
export async function registerHealthProfile(cmd: RegisterHealthProfileCommand): Promise<HealthProfileView> {
  const view: HealthProfileView = { ...cmd, updatedAt: new Date().toISOString() };
  healthProfileStore.update((prev) => ({ ...prev, [cmd.wardId]: view }));
  return view;
}

// TODO(backend): POST /wards/:id/health-profile/mydata-link — 마이데이터(예: 건강보험공단) OAuth 콜백 처리.
// 실제로는 사용자가 마이데이터 인증을 마치면 서버가 검진 수치를 받아와 채워준다.
// 목업에서는 실제 연동 없이, 현재 값(있다면 fallback)의 source만 "mydata_linked"로 바꿔 흉내낸다.
export async function linkMyDataProfile(
  wardId: string,
  fallback: HealthProfileView
): Promise<HealthProfileView> {
  const current = getHealthProfile(wardId, fallback);
  const view: HealthProfileView = { ...current, source: "mydata_linked", updatedAt: new Date().toISOString() };
  healthProfileStore.update((prev) => ({ ...prev, [wardId]: view }));
  return view;
}
