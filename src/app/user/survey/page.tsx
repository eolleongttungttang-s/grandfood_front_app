"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import {
  careProfileStore,
  getCareProfile,
  registerCareProfile,
  skipCareProfile,
} from "@/lib/care-profile";
import {
  healthProfileStore,
  registerHealthProfile,
  toBackendActivityLevel,
} from "@/lib/health-profile";
import { CareSurveyView, HealthMetricsForm } from "@/components/invite/care-survey-view";
import { getBackendConditionFlags, submitSelfHealthProfileBackend } from "@/lib/backend-auth";
import { TopBar } from "@/components/app/top-bar";
import { useLocalStore } from "@/lib/use-store";

function UserSurveyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /signup(이용자 본인 직접가입) 직후엔 ?first=1을 달고 이 화면으로 온다 — QR 초대 경로가
  // 동의 직후 항상 /invite/survey를 거치는 것과 똑같이, 혼자 가입해도 첫 화면부터 생활 정보를
  // 물어보게 하기 위함. 마이 화면의 "생활 정보 수정" 재방문과는 제목/완료 후 이동 위치만 다르다.
  const isFirstTime = searchParams.get("first") === "1";
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;
  useLocalStore(careProfileStore);
  const healthProfiles = useLocalStore(healthProfileStore);

  if (!account || !wardId || !ward) return null;

  const existing = getCareProfile(wardId);
  const existingHealth = healthProfiles[wardId];
  const afterCompleteHref = isFirstTime ? "/user/home" : "/user/profile";

  // invite/survey/page.tsx와 같은 이유(개별 필드 단위로, 값이 하나도 없으면 0이 아니라
  // undefined 그대로 유지)로 병합해서 저장한다 — 다만 여기는 재방문(마이 화면)이라 실제
  // 백엔드 User 등록은 이미 끝나 있으므로 그건 안 한다.
  async function saveHealthMetrics(health: HealthMetricsForm) {
    if (!wardId) return;
    const hasAnyValue = Object.values(health).some((v) => v !== undefined);
    if (!existingHealth && !hasAnyValue) return;

    await registerHealthProfile({
      wardId,
      source: "self_reported",
      systolicBP: health.systolicBP ?? existingHealth?.systolicBP,
      fastingGlucose: health.fastingGlucose ?? existingHealth?.fastingGlucose,
      hba1c: existingHealth?.hba1c ?? 0,
      weightKg: health.weightKg ?? existingHealth?.weightKg,
      heightCm: health.heightCm ?? existingHealth?.heightCm,
      diastolicBP: health.diastolicBP ?? existingHealth?.diastolicBP,
      activityLevel: health.activityLevel ?? existingHealth?.activityLevel,
    });

    if (!ward) return;
    // 로컬 저장과 별개로 실제 백엔드 건강 프로필도 채운다 — POST /users/{user_id}/health-profile.
    // 자가등록(보호자 없이 가입) 이용자는 이 호출이 없으면 백엔드에 HealthProfile 자체가
    // 영영 안 생겨서 AI 반찬 추천이 항상 404였다(backend-auth.ts submitSelfHealthProfileBackend
    // 주석 참고). 실패해도(서버 일시 장애 등) 로컬 저장은 이미 끝났으니 화면 이동은 막지 않는다.
    const heightCm = health.heightCm ?? existingHealth?.heightCm;
    const weightKg = health.weightKg ?? existingHealth?.weightKg;
    const activityLevel = health.activityLevel ?? existingHealth?.activityLevel;
    const result = await submitSelfHealthProfileBackend({
      mockWardId: wardId,
      name: ward.name,
      age: ward.age,
      address: ward.address,
      conditionFlags: getBackendConditionFlags(wardId),
      gender: ward.gender === "여" ? "female" : "male",
      heightCm,
      weightKg,
      activityLevel: activityLevel ? toBackendActivityLevel(activityLevel) : undefined,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title={isFirstTime ? "생활 정보 입력" : "생활 정보 수정"}
        subtitle={isFirstTime ? "더 꼭 맞는 식단을 위해 몇 가지만 여쭤볼게요" : "언제든 다시 입력하실 수 있어요"}
      />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        initialValues={existing}
        initialHealthValues={existingHealth}
        onComplete={async (cmd, health) => {
          await registerCareProfile(cmd);
          await saveHealthMetrics(health);
          toast.success("입력해주셔서 감사해요!");
          router.push(afterCompleteHref);
        }}
        onSkip={async (partial, answeredStep, health) => {
          await skipCareProfile(wardId, partial, answeredStep);
          await saveHealthMetrics(health);
          router.push(afterCompleteHref);
        }}
      />
    </div>
  );
}

export default function UserSurveyPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col" />}>
      <UserSurveyPageContent />
    </Suspense>
  );
}
