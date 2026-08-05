"use client";

import { useSession } from "@/lib/session";
import { getWards } from "@/lib/wards";
import { WardListView } from "@/components/guardian/ward-list-view";

export default function GuardianHomePage() {
  const { account } = useSession();
  if (!account) return null;

  const wards = getWards().filter((w) => account.wardIds?.includes(w.id));
  return <WardListView name={account.name} wards={wards} />;
}
