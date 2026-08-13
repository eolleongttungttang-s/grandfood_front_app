"use client";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { ProfileView } from "@/components/user/profile-view";

export default function UserProfilePage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  const detail = getWardDetail(ward);
  return <ProfileView account={account} ward={ward} detail={detail} />;
}
