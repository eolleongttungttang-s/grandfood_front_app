"use client";

import { useSession } from "@/lib/session";
import { WARDS } from "@/lib/wards";
import { GuardianProfileView } from "@/components/guardian/guardian-profile-view";

export default function GuardianProfilePage() {
  const { account } = useSession();
  if (!account) return null;

  const wards = WARDS.filter((w) => account.wardIds?.includes(w.id));
  return <GuardianProfileView account={account} wards={wards} />;
}
