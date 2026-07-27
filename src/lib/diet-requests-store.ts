"use client";

import { createLocalStore } from "@/lib/local-store";

export type DietChangeRequest = {
  id: string;
  wardId: string;
  requestedBy: string;
  note: string;
  timestamp: number;
};

export const dietRequestsStore = createLocalStore<DietChangeRequest[]>(
  "grandfood-app-diet-requests",
  []
);

export function requestDietChange(wardId: string, requestedBy: string, note: string) {
  dietRequestsStore.update((prev) => [
    { id: crypto.randomUUID(), wardId, requestedBy, note, timestamp: Date.now() },
    ...prev,
  ]);
}
