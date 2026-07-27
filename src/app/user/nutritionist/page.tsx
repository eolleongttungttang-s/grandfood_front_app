"use client";

import { useSession } from "@/lib/session";
import { NutritionistChatView } from "@/components/user/nutritionist-chat-view";

export default function UserNutritionistPage() {
  const { account } = useSession();
  if (!account?.selfWardId) return null;

  return <NutritionistChatView wardId={account.selfWardId} name={account.name} />;
}
