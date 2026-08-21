"use client";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { NotificationsView } from "@/components/user/notifications-view";

export default function UserNotificationsPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  return <NotificationsView ward={ward} />;
}
