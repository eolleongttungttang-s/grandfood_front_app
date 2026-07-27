"use client";

import { Bell, Home, UserRound } from "lucide-react";

import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { RequireRole } from "@/components/app/require-role";

const TABS = [
  { label: "홈", href: "/guardian/home", icon: Home },
  { label: "알림", href: "/guardian/notifications", icon: Bell },
  { label: "마이", href: "/guardian/profile", icon: UserRound },
];

export default function GuardianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole role="guardian">
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        <BottomTabBar items={TABS} />
      </div>
    </RequireRole>
  );
}
