"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import {
  careProfileStore,
  getCareProfile,
  registerCareProfile,
  skipCareProfile,
} from "@/lib/care-profile";
import { CareSurveyView } from "@/components/invite/care-survey-view";
import { TopBar } from "@/components/app/top-bar";
import { useLocalStore } from "@/lib/use-store";

export default function UserSurveyPage() {
  const router = useRouter();
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;
  useLocalStore(careProfileStore);

  if (!account || !wardId || !ward) return null;

  const existing = getCareProfile(wardId);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="생활 정보 수정" subtitle="언제든 다시 입력하실 수 있어요" />
      <CareSurveyView
        wardId={wardId}
        wardName={ward.name}
        initialValues={existing}
        onComplete={async (cmd) => {
          await registerCareProfile(cmd);
          toast.success("생활 정보를 저장했어요.");
          router.push("/user/profile");
        }}
        onSkip={async (partial, answeredStep) => {
          await skipCareProfile(wardId, partial, answeredStep);
          router.push("/user/profile");
        }}
      />
    </div>
  );
}
