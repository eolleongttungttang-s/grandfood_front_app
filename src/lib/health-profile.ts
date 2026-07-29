// "건강 프로필 등록" 단계. B2G 모델에서는 사회복지사가 국가검진표를 스캔해 올려줬지만,
// B2C에서는 어르신/보호자 본인이 직접 입력하거나 마이데이터 연동으로 가져온다.
// 아직 아무도 등록하지 않은 ward는 wards.ts가 만들어주는 seed 기반 기본값(fallback)을 그대로 쓰므로,
// 이 store가 비어 있어도 기존 화면들은 지금처럼 잘 작동한다.

import { createLocalStore } from "@/lib/local-store";

export type HealthProfileSource = "self_reported" | "mydata_linked";

export type RegisterHealthProfileCommand = {
  wardId: string;
  source: HealthProfileSource;
  systolicBP: number;
  fastingGlucose: number;
  hba1c: number;
  weightKg: number;
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
