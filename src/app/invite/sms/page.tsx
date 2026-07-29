"use client";

import { MOCK_INVITE } from "@/lib/invite";
import { SmsView } from "@/components/invite/sms-view";

export default function InviteSmsPage() {
  return <SmsView invite={MOCK_INVITE} />;
}
