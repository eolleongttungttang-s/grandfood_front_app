"use client";

import { createLocalStore } from "@/lib/local-store";

/** wardId -> 복약 알림 on/off */
export const medicationReminderStore = createLocalStore<Record<string, boolean>>(
  "grandfood-app-med-reminder",
  {}
);

export function setMedicationReminder(wardId: string, enabled: boolean) {
  medicationReminderStore.update((prev) => ({ ...prev, [wardId]: enabled }));
}
