"use client";

import { CalendarCheck, Home, Salad, UserRound } from "lucide-react";

import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { RequireRole } from "@/components/app/require-role";

const TABS = [
  { label: "홈", href: "/user/home", icon: Home },
  { label: "식단", href: "/user/diet", icon: Salad },
  { label: "섭취기록", href: "/user/records", icon: CalendarCheck },
  { label: "마이", href: "/user/profile", icon: UserRound },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="user">
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        <BottomTabBar items={TABS} />
      </div>
    </RequireRole>
  );
}
