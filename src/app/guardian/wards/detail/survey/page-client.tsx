"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import {
  careProfileStore,
  EMPTY_CARE_PROFILE_COMMAND,
  getCareProfile,
  MedicationEntry,
  registerCareProfile,
  RegisterCareProfileCommand,
  skipCareProfile,
} from "@/lib/care-profile";
import {
  fromBackendActivityLevel,
  healthProfileStore,
  HealthProfileView,
  registerHealthProfile,
  toBackendActivityLevel,
} from "@/lib/health-profile";
import { CareSurveySection, CareSurveyView, HealthMetricsForm } from "@/components/invite/care-survey-view";
import {
  BACKEND_CONDITION_FLAG_TO_LABEL,
  BackendUserProfile,
  conditionLabelsToBackendFlags,
  fetchBackendWardProfile,
  medicationEntriesToBackendFlags,
  submitSelfHealthProfileBackend,
} from "@/lib/backend-auth";
import { BACKEND_MEDICATION_FLAG_TO_LABEL } from "@/lib/medication-food-suggestions";
import { syncMedicationFoodRestrictions } from "@/lib/medication-food-restrictions";
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

  // user/survey/page.tsx와 같은 이유 — "저장 시 이어받기" 기준을 로컬 저장소만이 아니라
  // 백엔드 값 우선으로 바꾼다(2026-08-24 버그 리포트: 복용약만 추가해도 이미 저장돼 있던
  // 키/체중/활동수준/혈압/공복혈당이 새 스냅샷 행에서 null로 덮어써지던 문제).
  const [backendProfile, setBackendProfile] = useState<BackendUserProfile | null>(null);
  // user/survey/page.tsx의 backendProfileLoaded와 같은 이유 — CareSurveyView는 initialValues를
  // 마운트 시점에 딱 한 번만 읽어서, 이 fetch가 끝나기 전에 그려버리면 진단 질환/복용 중인 약을
  // 그냥 지나치기만 해도 "아직 안 불러온 빈 값"이 저장된다(2026-08-24 재현됨).
  const [backendProfileLoaded, setBackendProfileLoaded] = useState(false);
  useEffect(() => {
    if (!ward) return;
    let cancelled = false;
    fetchBackendWardProfile({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }).then(
      (result) => {
        if (cancelled) return;
        setBackendProfile(result);
        setBackendProfileLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ward?.id, ward?.name, ward?.age, ward?.address]);

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

  const localExisting = getCareProfile(wardId);
  // 진단 받은 질환 / 복용 중인 약 — user/survey/page.tsx와 같은 이유로 backendProfile을
  // 우선한다(2026-08-24 재발 버그: "복용 중인 약물... 계속 생활 정보 수정 뜨는데").
  const existing: RegisterCareProfileCommand | undefined = backendProfile
    ? {
        ...(localExisting ?? { ...EMPTY_CARE_PROFILE_COMMAND, wardId }),
        takesMedication: backendProfile.medicationFlags.length > 0,
        medications: backendProfile.medicationFlags.map((flag): MedicationEntry => {
          const name = BACKEND_MEDICATION_FLAG_TO_LABEL[flag] ?? flag;
          return localExisting?.medications.find((m) => m.name === name) ?? { name, timings: [], products: [] };
        }),
        conditions: backendProfile.conditionFlags.map((flag) => BACKEND_CONDITION_FLAG_TO_LABEL[flag] ?? flag),
      }
    : localExisting;
  const localExistingHealth = healthProfiles[wardId];
  const existingHealth: HealthProfileView | undefined =
    backendProfile || localExistingHealth
      ? {
          wardId,
          source: localExistingHealth?.source ?? "self_reported",
          systolicBP: backendProfile?.bloodPressureSystolic ?? localExistingHealth?.systolicBP,
          diastolicBP: backendProfile?.bloodPressureDiastolic ?? localExistingHealth?.diastolicBP,
          fastingGlucose: backendProfile?.fastingGlucoseMgDl ?? localExistingHealth?.fastingGlucose,
          heightCm: backendProfile?.heightCm ?? localExistingHealth?.heightCm,
          weightKg: backendProfile?.weightKg ?? localExistingHealth?.weightKg,
          activityLevel: backendProfile?.activityLevel
            ? fromBackendActivityLevel(backendProfile.activityLevel)
            : localExistingHealth?.activityLevel,
          hba1c: localExistingHealth?.hba1c ?? 0,
          updatedAt: localExistingHealth?.updatedAt ?? new Date(0).toISOString(),
        }
      : undefined;
  const afterCompleteHref = `/guardian/wards/detail?id=${wardId}`;
  // user/survey/page.tsx와 동일 — ?section 없이 들어오면 예전 그대로 15문항 통합 흐름.
  const sectionParam = searchParams.get("section");
  const section: CareSurveySection =
    sectionParam === "care" || sectionParam === "health" ? sectionParam : "both";

  // user/survey/page.tsx의 saveHealthMetrics와 같은 이유(개별 필드 단위로 병합, 신체 수치를
  // 하나도 안 넣어도 condition_flags는 항상 백엔드로 보내야 함)로 거의 동일하게 구성했다.
  async function saveHealthMetrics(health: HealthMetricsForm, careCmd: RegisterCareProfileCommand) {
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
    const systolicBP = health.systolicBP ?? existingHealth?.systolicBP;
    const diastolicBP = health.diastolicBP ?? existingHealth?.diastolicBP;
    const fastingGlucose = health.fastingGlucose ?? existingHealth?.fastingGlucose;
    const result = await submitSelfHealthProfileBackend({
      mockWardId: ward.id,
      name: ward.name,
      age: ward.age,
      address: ward.address,
      conditionFlags: conditionLabelsToBackendFlags(careCmd.conditions),
      medicationFlags: medicationEntriesToBackendFlags(
        careCmd.takesMedication,
        careCmd.medications,
        careCmd.customMedications
      ),
      conditionsNote: careCmd.conditionsNote || undefined,
      gender: ward.gender === "여" ? "female" : "male",
      heightCm,
      weightKg,
      activityLevel: activityLevel ? toBackendActivityLevel(activityLevel) : undefined,
      bloodPressureSystolic: systolicBP,
      bloodPressureDiastolic: diastolicBP,
      fastingGlucoseMgDl: fastingGlucose,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 다시 로그인하면 활성화돼요.");
      return;
    }

    const avoidances = careCmd.medicationFoodAvoidances;
    if (avoidances.length > 0) {
      await syncMedicationFoodRestrictions(
        { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
        avoidances
      );
    }
  }

  const sectionLabel = section === "health" ? "건강 프로필" : "생활 정보";
  if (!backendProfileLoaded) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title={`${ward.name}님 ${sectionLabel} 수정`} subtitle="언제든 다시 입력하실 수 있어요" />
        <p className="px-5 py-6 text-sm text-muted-foreground">불러오는 중이에요...</p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={`${ward.name}님 ${sectionLabel} 수정`} subtitle="언제든 다시 입력하실 수 있어요" />
      <CareSurveyView
        wardId={ward.id}
        wardName={ward.name}
        section={section}
        initialValues={existing}
        initialHealthValues={existingHealth}
        onComplete={async (cmd, health) => {
          // user/survey/page.tsx와 같은 이유 — 건강 프로필만 고치는 흐름에선 생활 정보를
          // completed:true로 확정하면 안 된다.
          if (section !== "health") await registerCareProfile(cmd);
          await saveHealthMetrics(health, cmd);
          toast.success("입력해주셔서 감사해요!");
          router.push(afterCompleteHref);
        }}
        onSkip={async (partial, answeredStep, health) => {
          if (section !== "health") await skipCareProfile(ward.id, partial, answeredStep);
          await saveHealthMetrics(health, partial);
          router.push(afterCompleteHref);
        }}
      />
    </div>
  );
}

export { GuardianWardSurveyPageClient };
