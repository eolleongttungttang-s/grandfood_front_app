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
import { getBackendConditionFlags, submitSelfHealthProfileBackend } from "@/lib/backend-auth";
import { CareSurveyView } from "@/components/invite/care-survey-view";
import { TopBar } from "@/components/app/top-bar";
import { useLocalStore } from "@/lib/use-store";

function UserSurveyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // signup/page.tsx가 회원가입 직후 최초 온보딩으로 보낼 때만 이 값을 붙인다 — 마이 화면의
  // "생활 정보 수정"으로 재방문한 경우(값 없음)와 완료 후 이동할 곳을 구분하는 데 쓴다.
  const isOnboarding = searchParams.get("onboarding") === "1";
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;
  useLocalStore(careProfileStore);

  if (!account || !wardId || !ward) return null;

  const existing = getCareProfile(wardId);
  const destination = isOnboarding ? "/user/home" : "/user/profile";

  // 설문(conditions)이 저장된 직후 백엔드 건강 프로필도 같이 채운다 — 자가등록
  // (registerUserBackend)은 건강 프로필을 안 만들기 때문에, 이 호출 없이는 AI 반찬 추천이
  // 구조적으로 항상 404(health-profile 없음)였다. 실패해도(서버 일시 장애 등) 로컬 설문
  // 저장 자체는 이미 끝났으니 화면 이동은 막지 않는다.
  async function syncBackendHealthProfile() {
    if (!wardId || !ward) return;
    const result = await submitSelfHealthProfileBackend({
      mockWardId: wardId,
      name: ward.name,
      age: ward.age,
      address: ward.address,
      conditionFlags: getBackendConditionFlags(wardId),
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="생활 정보 수정" subtitle="언제든 다시 입력하실 수 있어요" />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        initialValues={existing}
        onComplete={async (cmd) => {
          await registerCareProfile(cmd);
          await syncBackendHealthProfile();
          toast.success("생활 정보를 저장했어요.");
          router.push(destination);
        }}
        onSkip={async (partial, answeredStep) => {
          await skipCareProfile(wardId, partial, answeredStep);
          await syncBackendHealthProfile();
          router.push(destination);
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
