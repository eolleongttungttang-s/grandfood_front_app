"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { registerCareProfile, skipCareProfile } from "@/lib/care-profile";
import { healthProfileStore, registerHealthProfile, toBackendActivityLevel } from "@/lib/health-profile";
import {
  backendWardIdMapStore,
  getBackendConditionFlags,
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
  }

  // 키/몸무게/혈압/혈당은 registerElderFromInviteBackend()로 실제 백엔드 User에도 실어
  // 보내지만(위 함수), 그 값이 로컬 화면(건강 프로필 카드 등)에도 바로 보이려면
  // health-profile.ts의 로컬 저장소에도 남겨야 한다 — 두 저장소가 서로 다른 목적이라
  // (health-profile.ts 상단 주석 참고) 하나로 합치지 않고 각자 저장한다.
  //
  // RegisterHealthProfileCommand의 기존 4개 필드(systolicBP 등)는 옵셔널이 아니라서,
  // "모르겠어요"로 건너뛴 값을 무작정 0으로 채우면 화면에 "0mmHg" 같은 가짜 숫자가
  // 뜬다 — 그래서 기존에 저장된 값이 있으면 그 값을 유지하고, 이번에 새로 입력한
  // 값만 덮어쓴다. (완전 첫 입력이고 전부 건너뛴 경우엔 이 로컬 저장은 그냥 생략해서,
  // wards.ts의 시드 기반 기본값이 계속 쓰이게 둔다 — 0을 저장하는 것보다 낫다.)
  async function saveHealthMetricsLocally(health: HealthMetricsForm) {
    if (!wardId) return;
    const existing = healthProfileStore.read()[wardId];
    const hasAnyValue = Object.values(health).some((v) => v !== undefined);
    if (!existing && !hasAnyValue) return;

    await registerHealthProfile({
      wardId,
      source: "self_reported",
      systolicBP: health.systolicBP ?? existing?.systolicBP ?? 0,
      fastingGlucose: health.fastingGlucose ?? existing?.fastingGlucose ?? 0,
      hba1c: existing?.hba1c ?? 0,
      weightKg: health.weightKg ?? existing?.weightKg ?? 0,
      heightCm: health.heightCm ?? existing?.heightCm,
      diastolicBP: health.diastolicBP ?? existing?.diastolicBP,
      activityLevel: health.activityLevel ?? existing?.activityLevel,
    });
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
          router.push("/user/home");
        }}
        onSkip={async (partial, answeredStep, health) => {
          await skipCareProfile(wardId, partial, answeredStep);
          await saveHealthMetricsLocally(health);
          await registerBackendUserIfNeeded(health);
          router.push("/user/home");
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
