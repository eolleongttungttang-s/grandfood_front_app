"use client";

import { Suspense, useEffect, useState } from "react";
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
  fromBackendActivityLevel,
  healthProfileStore,
  HealthProfileView,
  registerHealthProfile,
  toBackendActivityLevel,
} from "@/lib/health-profile";
import { CareSurveySection, CareSurveyView, HealthMetricsForm } from "@/components/invite/care-survey-view";
import {
  BackendUserProfile,
  fetchBackendWardProfile,
  getBackendConditionFlags,
  getBackendMedicationFlags,
  submitSelfHealthProfileBackend,
} from "@/lib/backend-auth";
import { syncMedicationFoodRestrictions } from "@/lib/medication-food-restrictions";
import { TopBar } from "@/components/app/top-bar";
import { useLocalStore } from "@/lib/use-store";

function UserSurveyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /signup(이용자 본인 직접가입) 직후엔 ?first=1을 달고 이 화면으로 온다 — QR 초대 경로가
  // 동의 직후 항상 /invite/survey를 거치는 것과 똑같이, 혼자 가입해도 첫 화면부터 생활 정보를
  // 물어보게 하기 위함. 마이 화면의 "생활 정보 수정" 재방문과는 제목/완료 후 이동 위치만 다르다.
  const isFirstTime = searchParams.get("first") === "1";
  // 마이 화면의 "생활 정보 다시 입력하기"가 아니라 다른 화면(예: 식단 화면의 "나의 하루
  // 목표" 빈 상태 안내)에서 여기로 들어온 경우, 완료 후 그 화면으로 돌아가고 싶어한다 —
  // 예전엔 재방문이면 무조건 /user/profile로 보내서, 식단을 보려고 들어왔는데 마이
  // 페이지로 떨어지는 게 어색했다(2026-08-18 피드백). ?returnTo가 있으면 그걸 우선한다 —
  // "/"로 시작하고 "//"로 시작하지 않는 내부 경로만 허용한다("//evil.com"은 프로토콜
  // 상대 URL이라 브라우저가 외부 도메인으로 취급한다, 오픈 리다이렉트 방지).
  const returnToParam = searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/") && !returnToParam.startsWith("//")
      ? returnToParam
      : null;
  // 마이 화면이 "생활 정보"/"건강 프로필" 두 카드를 각자 따로 수정할 수 있게 진입점을
  // 나눴다(2026-08-21 피드백) — ?section 없이 들어오면(최초 온보딩, /signup?first=1) 예전
  // 그대로 15문항을 한 흐름으로 묻는다.
  const sectionParam = searchParams.get("section");
  const section: CareSurveySection =
    sectionParam === "care" || sectionParam === "health" ? sectionParam : "both";
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;
  useLocalStore(careProfileStore);
  const healthProfiles = useLocalStore(healthProfileStore);

  // 이 화면(재방문 "생활 정보"/"건강 프로필" 수정)이 값을 이어받는 기준이 지금까지
  // healthProfileStore(로컬 브라우저 저장소)뿐이었다 — 다른 기기/세션에서 입력한 값은
  // 이 브라우저 로컬엔 없으니, 여기서 아무 항목이나 다시 저장하면(예: 복용약만 추가)
  // 백엔드에 실제로 있던 키/체중/활동수준/혈압/공복혈당까지 새 스냅샷 행에서 null로
  // 덮어써졌다(마이 화면 PR#95로 "표시"는 백엔드 우선으로 고쳤지만 "저장 시 이어받기"는
  // 안 고쳐서 재발 — 2026-08-24 버그 리포트).
  const [backendProfile, setBackendProfile] = useState<BackendUserProfile | null>(null);
  useEffect(() => {
    if (!wardId || !ward) return;
    let cancelled = false;
    fetchBackendWardProfile({ mockWardId: wardId, name: ward.name, age: ward.age, address: ward.address }).then(
      (result) => {
        if (!cancelled) setBackendProfile(result);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [wardId, ward?.name, ward?.age, ward?.address]);

  if (!account || !wardId || !ward) return null;

  const existing = getCareProfile(wardId);
  const localExistingHealth = healthProfiles[wardId];
  // 필드 단위로 백엔드 값을 우선하고, 백엔드에 없는 값(hba1c 등 로컬 전용 필드 포함)만
  // 로컬 저장값으로 채운다.
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
  const afterCompleteHref = returnTo || (isFirstTime ? "/user/home" : "/user/profile");

  // invite/survey/page.tsx와 같은 이유(개별 필드 단위로, 값이 하나도 없으면 0이 아니라
  // undefined 그대로 유지)로 병합해서 저장한다 — 다만 여기는 재방문(마이 화면)이라 실제
  // 백엔드 User 등록은 이미 끝나 있으므로 그건 안 한다.
  async function saveHealthMetrics(health: HealthMetricsForm) {
    if (!wardId || !ward) return;
    // 로컬 저장은 실제로 입력된(또는 예전에 입력된) 값이 있을 때만 한다 — 값이 하나도
    // 없는데 저장하면 healthProfileStore에 전부 undefined인 빈 레코드가 생긴다.
    const hasAnyValue = Object.values(health).some((v) => v !== undefined);
    if (existingHealth || hasAnyValue) {
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
    }

    // 백엔드 동기화는 위 로컬 저장과 무관하게 항상 시도한다 — 키/몸무게 등 신체 수치를
    // 하나도 안 넣고 질환 체크리스트만 답한 경우(가장 흔한 경로)에도 condition_flags는
    // 보내야 한다. 로컬 저장 쪽 early return과 여기를 하나로 묶으면, 신체 수치를 안 넣은
    // 사용자는 조건만 답했어도 POST /users/{user_id}/health-profile이 아예 안 나가서
    // 백엔드에 HealthProfile이 영영 안 생기는 문제가 있었다(자가등록 이용자의 AI 반찬
    // 추천이 항상 404였던 원인 — backend-auth.ts submitSelfHealthProfileBackend 주석
    // 참고). 실패해도(서버 일시 장애 등) 로컬 저장은 이미 끝났으니 화면 이동은 막지 않는다.
    const heightCm = health.heightCm ?? existingHealth?.heightCm;
    const weightKg = health.weightKg ?? existingHealth?.weightKg;
    const activityLevel = health.activityLevel ?? existingHealth?.activityLevel;
    const systolicBP = health.systolicBP ?? existingHealth?.systolicBP;
    const diastolicBP = health.diastolicBP ?? existingHealth?.diastolicBP;
    const fastingGlucose = health.fastingGlucose ?? existingHealth?.fastingGlucose;
    const result = await submitSelfHealthProfileBackend({
      mockWardId: wardId,
      name: ward.name,
      age: ward.age,
      address: ward.address,
      conditionFlags: getBackendConditionFlags(wardId),
      medicationFlags: getBackendMedicationFlags(wardId),
      conditionsNote: getCareProfile(wardId)?.conditionsNote || undefined,
      gender: ward.gender === "여" ? "female" : "male",
      heightCm,
      weightKg,
      activityLevel: activityLevel ? toBackendActivityLevel(activityLevel) : undefined,
      bloodPressureSystolic: systolicBP,
      bloodPressureDiastolic: diastolicBP,
      fastingGlucoseMgDl: fastingGlucose,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      return;
    }

    // 약물표 제안 중 확정한 음식들 — 설문에서 고른 값을 그대로 전체 목록으로 보낸다
    // (홈 화면에 별도 "제한 음식" 토글 UI가 없어 기존 값과 합칠 필요가 없음, dislikes와
    // 다른 점).
    const avoidances = getCareProfile(wardId)?.medicationFoodAvoidances ?? [];
    if (avoidances.length > 0) {
      await syncMedicationFoodRestrictions(
        { mockWardId: wardId, name: ward.name, age: ward.age, address: ward.address },
        avoidances
      );
    }
  }

  const sectionLabel = section === "health" ? "건강 프로필" : "생활 정보";
  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title={isFirstTime ? "생활 정보 입력" : `${sectionLabel} 수정`}
        subtitle={isFirstTime ? "더 꼭 맞는 식단을 위해 몇 가지만 여쭤볼게요" : "언제든 다시 입력하실 수 있어요"}
      />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        section={section}
        initialValues={existing}
        initialHealthValues={existingHealth}
        onComplete={async (cmd, health) => {
          // "건강 프로필"만 고치는 흐름에선 생활 정보(care-profile) 쪽은 이번에 전혀 안
          // 건드렸으니 registerCareProfile을 호출하면 안 된다 — 그러면 아직 한 번도 안
          // 물어본 생활 정보 문항까지 EMPTY_CARE_PROFILE_COMMAND 기본값 그대로
          // completed:true로 확정돼버린다(2026-08-21, 분리하며 발견).
          if (section !== "health") await registerCareProfile(cmd);
          await saveHealthMetrics(health);
          toast.success("입력해주셔서 감사해요!");
          router.push(afterCompleteHref);
        }}
        onSkip={async (partial, answeredStep, health) => {
          if (section !== "health") await skipCareProfile(wardId, partial, answeredStep);
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
