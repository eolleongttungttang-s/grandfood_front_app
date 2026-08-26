"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { getCareProfile, registerCareProfile, skipCareProfile } from "@/lib/care-profile";
import {
  healthProfileStore,
  mergeHealthMetrics,
  registerHealthProfile,
  toBackendActivityLevel,
} from "@/lib/health-profile";
import {
  backendWardIdMapStore,
  deriveElderBackendPassword,
  getBackendConditionFlags,
  getBackendMedicationFlags,
  loginUserBackend,
  registerElderFromInviteBackend,
} from "@/lib/backend-auth";
import { CareSurveyView, HealthMetricsForm } from "@/components/invite/care-survey-view";
import { TopBar } from "@/components/app/top-bar";

const GENDER_TO_BACKEND: Record<"여" | "남", "female" | "male"> = { 여: "female", 남: "male" };

function InviteSurveyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;

  if (!account || !wardId || !ward) return null;

  // code가 있으면(QR 초대로 들어와 방금 registerBackendUserIfNeeded로 실제 계정을 만든
  // 최초 가입) 튜토리얼로 보낸다. code가 없는 재방문("생활 정보 수정")은 그대로 홈으로.
  const afterCompleteHref = code ? "/user/tutorial" : "/user/home";

  // 초대 동의(consent-view.tsx) 직후엔 아직 질환 설문 전이라 실제 백엔드 User를 안
  // 만들어뒀다 — 여기, 설문이 끝난(또는 건너뛴) 이 시점에야 condition_flags까지
  // 채워서 POST /wards/invites/{code}/register를 부른다. code가 없으면(예: 마이
  // 화면의 "생활 정보 수정"처럼 초대 경로가 아닌 재방문) 조용히 건너뛴다 — 이미
  // 어딘가에서 계정이 만들어졌을 대상자라 여기서 새로 만들 이유가 없다.
  async function registerBackendUserIfNeeded(health: HealthMetricsForm) {
    if (!code || !wardId || !account) return;
    const result = await registerElderFromInviteBackend(code, {
      name: account.name,
      birthDate: account.birthDate ?? "",
      phone: account.phone,
      address: account.address ?? "",
      planType: account.planType ?? "basic",
      conditionFlags: getBackendConditionFlags(wardId),
      medicationFlags: getBackendMedicationFlags(wardId),
      foodRestrictions: getCareProfile(wardId)?.medicationFoodAvoidances ?? [],
      ttsCallConsent: account.ttsCallConsent,
      gender: GENDER_TO_BACKEND[ward!.gender],
      heightCm: health.heightCm,
      weightKg: health.weightKg,
      activityLevel: health.activityLevel ? toBackendActivityLevel(health.activityLevel) : undefined,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      return;
    }
    // ensureBackendWardId()(rag-chat.ts/meal-log-store.ts)의 캐시를 미리 채워둔다 —
    // 이미 방금 만든 User라 다시 POST /wards로 만들 필요가 없다는 걸 알려주는 것.
    backendWardIdMapStore.update((prev) => ({ ...prev, [wardId]: result.userId }));

    // 방금 백엔드가 이 어르신 본인의 로그인 수단도 같이 만들어줬다(invite/service.py의
    // register_elder_from_invite, login_id=이름/password=전화번호 뒷자리 4자리로 결정론적
    // 생성) — 그런데 그 응답엔 access_token이 없다(UserResponse만 돌려줌, 로그인 응답이
    // 아니라서). 여기서 바로 한 번 로그인해 backendUserSessionStore를 채워두지 않으면,
    // 어르신 본인 기기에서 온보딩 직후 곧장 AI 반찬 추천 등을 눌러도 다시 로그아웃→로그인을
    // 해야만 자기 토큰이 생긴다 — consent-view.tsx가 계산한 것과 같은 공식(
    // deriveElderBackendPassword)이라 여기서 실패할 일은 사실상 없다(이름 충돌로 백엔드가
    // login_id를 못 만들어준 극히 드문 경우만 예외 — 그때도 조용히 넘어간다, 다음 로그인
    // 시도 때 다시 시도됨).
    await loginUserBackend(account.loginId, deriveElderBackendPassword(account.phone));
  }

  // 키/몸무게/혈압/혈당은 registerElderFromInviteBackend()로 실제 백엔드 User에도 실어
  // 보내지만(위 함수), 그 값이 로컬 화면(건강 프로필 카드 등)에도 바로 보이려면
  // health-profile.ts의 로컬 저장소에도 남겨야 한다 — 두 저장소가 서로 다른 목적이라
  // (health-profile.ts 상단 주석 참고) 하나로 합치지 않고 각자 저장한다.
  //
  // "모르겠어요"로 건너뛴 값은 기존에 저장된 값이 있으면 그 값을 유지하고, 없으면
  // undefined(미입력)로 그대로 둔다 — 실제 병합은 health-profile.ts의 mergeHealthMetrics()
  // (user/survey/page.tsx와 공유).
  async function saveHealthMetricsLocally(health: HealthMetricsForm) {
    if (!wardId) return;
    const existing = healthProfileStore.read()[wardId];
    const hasAnyValue = Object.values(health).some((v) => v !== undefined);
    if (!existing && !hasAnyValue) return;

    await registerHealthProfile(mergeHealthMetrics(wardId, health, existing));
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="생활 정보 입력" subtitle="더 꼭 맞는 식단을 위해 몇 가지만 여쭤볼게요" />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        onComplete={async (cmd, health) => {
          await registerCareProfile(cmd);
          await saveHealthMetricsLocally(health);
          await registerBackendUserIfNeeded(health);
          toast.success("입력해주셔서 감사해요!");
          router.push(afterCompleteHref);
        }}
        onSkip={async (partial, answeredStep, health) => {
          await skipCareProfile(wardId, partial, answeredStep);
          await saveHealthMetricsLocally(health);
          await registerBackendUserIfNeeded(health);
          router.push(afterCompleteHref);
        }}
      />
    </div>
  );
}

export default function InviteSurveyPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col" />}>
      <InviteSurveyPageContent />
    </Suspense>
  );
}
