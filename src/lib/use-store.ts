"use client";

import { useSyncExternalStore } from "react";
import { createLocalStore } from "@/lib/local-store";

export function useLocalStore<T>(store: ReturnType<typeof createLocalStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.read, store.getServerSnapshot);
}
