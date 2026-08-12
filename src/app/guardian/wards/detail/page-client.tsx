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
  const ward = id ? getWard(id) : undefined;
  const canView = !!(ward && account?.wardIds?.includes(ward.id));

  // id별로 결과를 태깅해둔다 — id가 바뀌면(다른 대상자로 이동) 아직 새 응답이 안 왔을 때
  // 이전 대상자의 값이 잠깐 보이지 않도록, 아래에서 태그가 현재 id와 다르면 로딩 중으로 취급한다.
  const [mealDashboardState, setMealDashboardState] = useState<{
    id: string;
    dashboard: WardMealDashboard;
  } | null>(null);

  useEffect(() => {
    // 권한 확인(canView)보다 먼저 fetch가 나가면 안 된다 — 이 앱은 한 브라우저에 여러 보호자
    // 계정 세션이 캐시될 수 있는 구조라, URL의 id를 다른 보호자(B)가 관리하는 대상자로 바꾸면
    // canView가 나중에 거부하기 전에 이미 B 계정의 캐시된 토큰으로 실제 요청이 나갈 수 있었다.
    if (!id || !canView) return;
    let cancelled = false;
    fetchWardMealDashboard(id).then((result) => {
      if (!cancelled) setMealDashboardState({ id, dashboard: result });
    });
    return () => {
      cancelled = true;
    };
  }, [id, canView]);

  // null이면 "아직 응답 안 옴"(로딩 중) — notifications-view.tsx와 같은 패턴.
  const mealDashboard = mealDashboardState?.id === id ? mealDashboardState.dashboard : null;

  if (!account) return null;

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
