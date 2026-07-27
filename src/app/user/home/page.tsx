"use client";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { HomeView } from "@/components/user/home-view";

export default function UserHomePage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  const detail = getWardDetail(ward);
  return <HomeView name={account.name} ward={ward} detail={detail} />;
}
