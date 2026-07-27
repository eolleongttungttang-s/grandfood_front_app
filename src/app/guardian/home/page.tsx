"use client";

import { useSession } from "@/lib/session";
import { WARDS } from "@/lib/wards";
import { WardListView } from "@/components/guardian/ward-list-view";

export default function GuardianHomePage() {
  const { account } = useSession();
  if (!account) return null;

  const wards = WARDS.filter((w) => account.wardIds?.includes(w.id));
  return <WardListView name={account.name} wards={wards} />;
}
