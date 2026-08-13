"use client";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { SelfSubscriptionView } from "@/components/user/subscription-view";

export default function UserSubscriptionPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  return <SelfSubscriptionView ward={ward} />;
}
