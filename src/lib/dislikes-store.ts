"use client";

import { createLocalStore } from "@/lib/local-store";

/** wardId -> 기피로 표시한 메뉴 항목 id 목록 */
export const dislikesStore = createLocalStore<Record<string, string[]>>(
  "grandfood-app-dislikes",
  {}
);

export function toggleDislike(wardId: string, itemId: string) {
  dislikesStore.update((prev) => {
    const current = prev[wardId] ?? [];
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    return { ...prev, [wardId]: next };
  });
}

export function wardDislikes(all: Record<string, string[]>, wardId: string) {
  return all[wardId] ?? [];
}
