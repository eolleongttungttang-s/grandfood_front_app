"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { careProfileStore, getCareProfile, registerCareProfile, skipCareProfile } from "@/lib/care-profile";
import { healthProfileStore, registerHealthProfile, toBackendActivityLevel } from "@/lib/health-profile";
import { CareSurveyView, HealthMetricsForm } from "@/components/invite/care-survey-view";
import { getBackendConditionFlags, submitSelfHealthProfileBackend } from "@/lib/backend-auth";
import { TopBar } from "@/components/app/top-bar";
import { useLocalStore } from "@/lib/use-store";

// user/survey/page.tsx(어르신 본인이 자기 정보를 고치는 화면)와 거의 같은 화면이지만, 대상
// wardId를 account.selfWardId가 아니라 쿼리스트링(?id=)으로 받는다 — 보호자가 관리하는
// 여러 대상자 중 하나를 골라 들어오기 때문이다(report/nutritionist 등 다른 guardian/wards/
// detail/* 페이지와 동일한 패턴). 예전엔 이 화면 자체가 없어서, ward-detail-view.tsx의
// "건강 프로필" 카드(성별/키/체중/활동량)가 읽기 전용이었고 보호자가 대신 입력해줄 방법이
// 없었다 — 대상자 본인이 스스로 /user/survey로 들어가야만 채워지는데, 어르신이 앱을 거의
// 안 쓰는 경우엔 그마저도 기대하기 어려웠다(2026-08-18 피드백).
//
// 실제 백엔드 동기화(submitSelfHealthProfileBackend)는 이 대상자로 로그인한 적 없어도
// 된다 — resolveBackendWardAccess(backend-auth.ts)가 mockWardId만 보고 "이 대상자를
// 관리하는 보호자가 누구든" 그 보호자 세션을 먼저 확인하므로, 지금 로그인한 보호자
// 계정으로 바로 반영된다.
function GuardianWardSurveyPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wardId = searchParams.get("id");
  const { account } = useSession();
  const ward = wardId ? getWard(wardId) : undefined;
  const canView = ward && account?.wardIds?.includes(ward.id);
  useLocalStore(careProfileStore);
  const healthProfiles = useLocalStore(healthProfileStore);

  if (!account || !wardId || !ward || !canView) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          열람 권한이 없거나 존재하지 않는 대상자예요.
        </p>
        <Link href="/guardian/home" className="text-sm font-semibold text-primary">
          대상자 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const existing = getCareProfile(wardId);
  const existingHealth = healthProfiles[wardId];
  const afterCompleteHref = `/guardian/wards/detail?id=${wardId}`;

  // user/survey/page.tsx의 saveHealthMetrics와 같은 이유(개별 필드 단위로 병합, 신체 수치를
  // 하나도 안 넣어도 condition_flags는 항상 백엔드로 보내야 함)로 거의 동일하게 구성했다.
  async function saveHealthMetrics(health: HealthMetricsForm) {
    if (!ward) return;
    const hasAnyValue = Object.values(health).some((v) => v !== undefined);
    if (existingHealth || hasAnyValue) {
      await registerHealthProfile({
        wardId: ward.id,
        source: "self_reported",
        systolicBP: health.systolicBP ?? existingHealth?.systolicBP,
        fastingGlucose: health.fastingGlucose ?? existingHealth?.fastingGlucose,
        hba1c: existingHealth?.hba1c ?? 0,
        weightKg: health.weightKg ?? existingHealth?.weightKg,
        heightCm: health.heightCm ?? existingHealth?.heightCm,
        diastolicBP: health.diastolicBP ?? existingHealth?.diastolicBP,
        activityLevel: health.activityLevel ?? existingHealth?.activityLevel,
      });
    }

    const heightCm = health.heightCm ?? existingHealth?.heightCm;
    const weightKg = health.weightKg ?? existingHealth?.weightKg;
    const activityLevel = health.activityLevel ?? existingHealth?.activityLevel;
    const result = await submitSelfHealthProfileBackend({
      mockWardId: ward.id,
      name: ward.name,
      age: ward.age,
      address: ward.address,
      conditionFlags: getBackendConditionFlags(ward.id),
      gender: ward.gender === "여" ? "female" : "male",
      heightCm,
      weightKg,
      activityLevel: activityLevel ? toBackendActivityLevel(activityLevel) : undefined,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 다시 로그인하면 활성화돼요.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={`${ward.name}님 생활 정보 수정`} subtitle="언제든 다시 입력하실 수 있어요" />
      <CareSurveyView
        wardId={ward.id}
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
          await skipCareProfile(ward.id, partial, answeredStep);
          await saveHealthMetrics(health);
          router.push(afterCompleteHref);
        }}
      />
    </div>
  );
}

export { GuardianWardSurveyPageClient };
