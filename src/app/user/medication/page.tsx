"use client";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { MedicationAdviceView } from "@/components/user/medication-advice-view";

export default function UserMedicationPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  return <MedicationAdviceView ward={ward} />;
}
