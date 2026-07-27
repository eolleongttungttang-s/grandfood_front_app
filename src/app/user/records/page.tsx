"use client";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { RecordsView } from "@/components/user/records-view";

export default function UserRecordsPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  const detail = getWardDetail(ward);
  return <RecordsView detail={detail} />;
}
