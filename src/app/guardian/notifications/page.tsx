import { GUARDIAN_NOTIFICATIONS } from "@/lib/notifications";
import { NotificationsView } from "@/components/guardian/notifications-view";

export default function GuardianNotificationsPage() {
  return <NotificationsView items={GUARDIAN_NOTIFICATIONS} />;
}
