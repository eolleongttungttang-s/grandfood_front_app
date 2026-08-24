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

// backend-auth.ts의 BackendUserProfile.activityLevel(GET /users/{id} 응답, PR#95부터
// 노출됨)을 화면 표시용 ActivityLevel/ACTIVITY_LEVEL_LABEL로 되돌리는 역방향 매핑 —
// toBackendActivityLevel과 정확히 반대다.
export function fromBackendActivityLevel(level: BackendActivityLevel): ActivityLevel {
  switch (level) {
    case "sedentary":
      return "inactive";
    case "low_active":
      return "light";
    case "active":
      return "active";
    case "very_active":
      return "very_active";
  }
}

export type RegisterHealthProfileCommand = {
  wardId: string;
  source: HealthProfileSource;
  // systolicBP/fastingGlucose/weightKg는 한때 필수(number)였다 — 그런데 설문을 일부만
  // 답하고(예: 키·몸무게만) 혈압 단계 전에 건너뛰면, 저장부가 "값 없음"을 표현할 방법이
  // 없어 0을 채워 넣었고, 그 0이 보호자 상세 화면에 "혈압 0mmHg"처럼 실제 측정값인 양
  // 그대로 보였다(코드 리뷰 지적). heightCm/diastolicBP/activityLevel과 같은 방식으로
  // optional로 바꿔서 "입력 안 함"을 undefined로 정직하게 표현한다 — 읽는 쪽(wards.ts의
  // 추천 사유 문구, ward-detail-view.tsx/records-view.tsx)은 각자 `!= null` 가드로 대응.
  systolicBP?: number;
  fastingGlucose?: number;
  hba1c: number;
  weightKg?: number;
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

// invite/survey/page.tsx(신규 가입)와 user/survey/page.tsx(재방문 수정)가 똑같이 하는
// 병합 — "이번 설문에서 새로 답한 값이 있으면 그걸, 없으면 기존 저장값을 유지하고, 둘 다
// 없으면 undefined로 남겨서 가짜 0을 만들지 않는다." 두 파일에 각자 복제돼 있던 걸
// 여기 하나로 모았다(코드 리뷰 지적 — 따로 두면 세 번째 호출부가 생겼을 때 같은 0-fill
// 버그를 또 심기 쉽다). health 파라미터는 care-survey-view.tsx의 HealthMetricsForm과
// 구조가 같지만, 순환 import를 피하려고 그 타입을 직접 import하지 않고 구조적으로만 맞춘다.
export function mergeHealthMetrics(
  wardId: string,
  health: {
    heightCm?: number;
    weightKg?: number;
    systolicBP?: number;
    diastolicBP?: number;
    fastingGlucose?: number;
    activityLevel?: ActivityLevel;
  },
  existing: HealthProfileView | undefined
): RegisterHealthProfileCommand {
  return {
    wardId,
    source: "self_reported",
    systolicBP: health.systolicBP ?? existing?.systolicBP,
    fastingGlucose: health.fastingGlucose ?? existing?.fastingGlucose,
    hba1c: existing?.hba1c ?? 0,
    weightKg: health.weightKg ?? existing?.weightKg,
    heightCm: health.heightCm ?? existing?.heightCm,
    diastolicBP: health.diastolicBP ?? existing?.diastolicBP,
    activityLevel: health.activityLevel ?? existing?.activityLevel,
  };
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
