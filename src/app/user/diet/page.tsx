"use client";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { DietView } from "@/components/user/diet-view";

export default function UserDietPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  const detail = getWardDetail(ward);
  return <DietView ward={ward} detail={detail} />;
}
