"use client";

import { createLocalStore } from "@/lib/local-store";

export type SosEvent = {
  id: string;
  wardId: string;
  wardName: string;
  timestamp: number;
  acknowledged: boolean;
};

export const sosStore = createLocalStore<SosEvent[]>("grandfood-app-sos", []);

export function raiseSos(wardId: string, wardName: string) {
  sosStore.update((prev) => [
    { id: crypto.randomUUID(), wardId, wardName, timestamp: Date.now(), acknowledged: false },
    ...prev,
  ]);
}

export function acknowledgeSos(id: string) {
  sosStore.update((prev) =>
    prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e))
  );
}
