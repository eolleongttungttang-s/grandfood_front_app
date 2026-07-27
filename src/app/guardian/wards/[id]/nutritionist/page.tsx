"use client";

import { useParams } from "next/navigation";
import Link from "next/link";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { NutritionistHistoryView } from "@/components/guardian/nutritionist-history-view";

export default function GuardianWardNutritionistPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useSession();

  if (!account) return null;

  const ward = getWard(id);
  const canView = ward && account.wardIds?.includes(ward.id);

  if (!ward || !canView) {
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

  return <NutritionistHistoryView ward={ward} />;
}
