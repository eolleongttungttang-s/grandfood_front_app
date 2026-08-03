"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { registerCareProfile, skipCareProfile } from "@/lib/care-profile";
import { CareSurveyView } from "@/components/invite/care-survey-view";
import { TopBar } from "@/components/app/top-bar";

export default function InviteSurveyPage() {
  const router = useRouter();
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;

  if (!account || !wardId || !ward) return null;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="생활 정보 입력" subtitle="더 꼭 맞는 식단을 위해 몇 가지만 여쭤볼게요" />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        onComplete={async (cmd) => {
          await registerCareProfile(cmd);
          toast.success("입력해주셔서 감사해요!");
          router.push("/user/home");
        }}
        onSkip={async (partial) => {
          await skipCareProfile(wardId, partial);
          router.push("/user/home");
        }}
      />
    </div>
  );
}
