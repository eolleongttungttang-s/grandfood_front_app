"use client";

import { usePathname } from "next/navigation";
import { Home, UserRound } from "lucide-react";

import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { RequireRole } from "@/components/app/require-role";
import { GuardianWardSync } from "@/components/guardian/guardian-ward-sync";

// "알림" 탭은 뺀다(2026-08-19 피드백) — /guardian/notifications 페이지 자체는 남겨둔다,
// ward-list-view.tsx의 SOS 배너가 여전히 그리로 링크한다(대상자 SOS는 놓치면 안 되는
// 안전 관련 알림이라 페이지/라우트까지 없애면 안 됨). 상시 탭에서만 뺀다.
const TABS = [
  { label: "홈", href: "/guardian/home", icon: Home },
  { label: "마이", href: "/guardian/profile", icon: UserRound },
];

// 대상자 상세 화면(/guardian/wards/detail)은 자체적으로 개요/건강/기록 하단 탭을 그린다
// (ward-detail-view.tsx) — 전역 탭(홈/마이)과 같이 뜨면 화면 아래에 탭바가 두 줄 겹친다.
const ROUTES_WITH_OWN_BOTTOM_NAV = ["/guardian/wards/detail"];

export default function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasOwnBottomNav = ROUTES_WITH_OWN_BOTTOM_NAV.includes(pathname);

  return (
    <RequireRole role="guardian">
      <GuardianWardSync />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        {!hasOwnBottomNav && <BottomTabBar items={TABS} />}
      </div>
    </RequireRole>
  );
}
