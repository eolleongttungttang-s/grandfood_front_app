"use client";

import { MOCK_INVITE, inviteFormStore } from "@/lib/invite";
import { useLocalStore } from "@/lib/use-store";
import { ConsentView } from "@/components/invite/consent-view";

export default function InviteConsentPage() {
  const formState = useLocalStore(inviteFormStore);

  return <ConsentView guardianName={MOCK_INVITE.guardianName} defaultValues={formState} />;
}
