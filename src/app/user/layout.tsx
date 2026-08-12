"use client";

import { CalendarCheck, Home, Salad, UserRound } from "lucide-react";

import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { RequireRole } from "@/components/app/require-role";
import { SosButton } from "@/components/user/sos-button";
import { useSession } from "@/lib/session";

const TABS = [
  { label: "홈", href: "/user/home", icon: Home },
  { label: "식단", href: "/user/diet", icon: Salad },
  { label: "섭취기록", href: "/user/records", icon: CalendarCheck },
  { label: "마이", href: "/user/profile", icon: UserRound },
];

function UserShell({ children }: { children: React.ReactNode }) {
  const { account } = useSession();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* SosButton이 이 컨테이너 기준 absolute(right-4 bottom-20)라 화면 높이와 무관하게 늘
          같은 자리에 떠 있다 — 콘텐츠가 짧은 화면(홈 등)에서는 그 자리를 실제 콘텐츠가 차지해
          버튼과 겹칠 수 있어서, 모든 이용자 화면에 공통으로 하단 여유 공간을 준다. */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-28">{children}</main>
      {account?.selfWardId && (
        <SosButton wardId={account.selfWardId} wardName={account.name} />
      )}
      <BottomTabBar items={TABS} />
    </div>
  );
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="user">
      <UserShell>{children}</UserShell>
    </RequireRole>
  );
}
