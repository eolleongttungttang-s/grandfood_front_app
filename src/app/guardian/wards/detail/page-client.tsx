"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { fetchWardMealDashboard, WardMealDashboard } from "@/lib/ward-meal-dashboard";
import { BackendUserProfile, fetchBackendWardProfile } from "@/lib/backend-auth";
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
    // account.loginId도 같이 넘겨서, fetchWardMealDashboard 안쪽(resolveCachedBackendWardAccess)
    // 에서 한 번 더 확인하게 한다 — 이 useEffect의 가드를 나중에 다른 화면이 깜빡 빠뜨려도
    // 안전망이 되도록.
    if (!id || !canView) return;
    const controller = new AbortController();
    fetchWardMealDashboard(id, { signal: controller.signal, viewerGuardianLoginId: account?.loginId }).then(
      (result) => {
        if (!controller.signal.aborted) setMealDashboardState({ id, dashboard: result });
      }
    );
    // 대상자를 빠르게 넘나들거나 화면을 벗어나면, 아직 안 끝난 이전 요청을 실제로
    // 취소한다(예전엔 로컬 cancelled 플래그로 "반영만" 막고, 네트워크 요청 자체는 백그라운드에
    // 계속 남아있었다 — 코드 리뷰 지적).
    return () => controller.abort();
  }, [id, canView, account?.loginId]);

  // null이면 "아직 응답 안 옴"(로딩 중) — notifications-view.tsx와 같은 패턴.
  const mealDashboard = mealDashboardState?.id === id ? mealDashboardState.dashboard : null;

  // 건강 프로필 6개 필드(키/몸무게/활동수준/혈압/공복혈당) — GET /users/{id}가 이제
  // 이 값들을 실제로 돌려주므로(PR#95), profile-view.tsx(이용자 본인 마이 화면)와 같은
  // 방식으로 여기서도 로컬 목업(detail.healthProfile) 대신 서버 값을 우선한다. 보호자는
  // 항상 실제 세션이 있어(자가등록 이용자와 달리 fetchBackendWardProfile이 막힐 이유가
  // 없음) 이 대상자가 실제 백엔드에 한 번이라도 등록된 적 있으면 정상적으로 값이 온다.
  const [backendProfileState, setBackendProfileState] = useState<{
    id: string;
    profile: BackendUserProfile | null;
  } | null>(null);

  useEffect(() => {
    if (!id || !canView) return;
    let cancelled = false;
    fetchBackendWardProfile({
      mockWardId: id,
      name: ward?.name ?? "",
      age: ward?.age ?? 0,
      address: ward?.address ?? "",
    }).then((result) => {
      if (!cancelled) setBackendProfileState({ id, profile: result });
    });
    return () => {
      cancelled = true;
    };
  }, [id, canView, ward?.name, ward?.age, ward?.address]);

  const backendProfile = backendProfileState?.id === id ? backendProfileState.profile : null;

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
      backendProfile={backendProfile}
    />
  );
}
