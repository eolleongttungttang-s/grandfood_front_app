"use client";

import { useSession } from "@/lib/session";
import { getWards } from "@/lib/wards";
import { GuardianProfileView } from "@/components/guardian/guardian-profile-view";

export default function GuardianProfilePage() {
  const { account } = useSession();
  if (!account) return null;

  const wards = getWards().filter((w) => account.wardIds?.includes(w.id));
  return <GuardianProfileView account={account} wards={wards} />;
}
