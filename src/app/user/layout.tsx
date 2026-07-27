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
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
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
