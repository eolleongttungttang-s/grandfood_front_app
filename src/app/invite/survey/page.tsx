"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { registerCareProfile, skipCareProfile } from "@/lib/care-profile";
import {
  backendWardIdMapStore,
  getBackendConditionFlags,
  registerElderFromInviteBackend,
} from "@/lib/backend-auth";
import { CareSurveyView } from "@/components/invite/care-survey-view";
import { TopBar } from "@/components/app/top-bar";

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
  async function registerBackendUserIfNeeded() {
    if (!code || !wardId || !account) return;
    const result = await registerElderFromInviteBackend(code, {
      name: account.name,
      birthDate: account.birthDate ?? "",
      phone: account.phone,
      address: account.address ?? "",
      planType: account.planType ?? "basic",
      conditionFlags: getBackendConditionFlags(wardId),
      ttsCallConsent: account.ttsCallConsent,
    });
    if ("error" in result) {
      toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      return;
    }
    // ensureBackendWardId()(rag-chat.ts/meal-log-store.ts)의 캐시를 미리 채워둔다 —
    // 이미 방금 만든 User라 다시 POST /wards로 만들 필요가 없다는 걸 알려주는 것.
    backendWardIdMapStore.update((prev) => ({ ...prev, [wardId]: result.userId }));
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="생활 정보 입력" subtitle="더 꼭 맞는 식단을 위해 몇 가지만 여쭤볼게요" />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        onComplete={async (cmd) => {
          await registerCareProfile(cmd);
          await registerBackendUserIfNeeded();
          toast.success("입력해주셔서 감사해요!");
          router.push("/user/home");
        }}
        onSkip={async (partial, answeredStep) => {
          await skipCareProfile(wardId, partial, answeredStep);
          await registerBackendUserIfNeeded();
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
