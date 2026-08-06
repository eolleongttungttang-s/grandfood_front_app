"use client";

import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
import { AssistantChatView } from "@/components/user/assistant-chat-view";

export default function UserAssistantPage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account || !ward) return null;

  return <AssistantChatView ward={ward} name={account.name} />;
}
