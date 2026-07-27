"use client";

import { useSession } from "@/lib/session";
import { CompanionView } from "@/components/user/companion-view";

export default function UserCompanionPage() {
  const { account } = useSession();
  if (!account) return null;

  return <CompanionView name={account.name} />;
}
