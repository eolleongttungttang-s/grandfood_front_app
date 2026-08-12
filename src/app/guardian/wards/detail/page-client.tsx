"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { fetchWardMealDashboard, WardMealDashboard } from "@/lib/ward-meal-dashboard";
import { WardDetailView } from "@/components/guardian/ward-detail-view";

export function GuardianWardDetailPageClient() {
  const id = useSearchParams().get("id");
  const { account } = useSession();

  // id별로 결과를 태깅해둔다 — id가 바뀌면(다른 대상자로 이동) 아직 새 응답이 안 왔을 때
  // 이전 대상자의 값이 잠깐 보이지 않도록, 아래에서 태그가 현재 id와 다르면 로딩 중으로 취급한다.
  const [mealDashboardState, setMealDashboardState] = useState<{
    id: string;
    dashboard: WardMealDashboard;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchWardMealDashboard(id).then((result) => {
      if (!cancelled) setMealDashboardState({ id, dashboard: result });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // null이면 "아직 응답 안 옴"(로딩 중) — notifications-view.tsx와 같은 패턴.
  const mealDashboard = mealDashboardState?.id === id ? mealDashboardState.dashboard : null;

  if (!account) return null;

  const ward = id ? getWard(id) : undefined;
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

  const detail = getWardDetail(ward);
  return (
    <WardDetailView
      ward={ward}
      detail={detail}
      guardianName={account.name}
      mealDashboard={mealDashboard}
    />
  );
}
