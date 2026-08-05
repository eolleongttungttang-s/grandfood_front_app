"use client";

import { useSession } from "@/lib/session";
import { getWards } from "@/lib/wards";
import { SubscriptionView } from "@/components/guardian/subscription-view";

export default function GuardianSubscriptionPage() {
  const { account } = useSession();
  if (!account) return null;

  const wards = getWards().filter((w) => account.wardIds?.includes(w.id));
  return <SubscriptionView wards={wards} />;
}
