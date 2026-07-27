"use client";

import { createLocalStore } from "@/lib/local-store";

export type MealCheckStatus = "완식" | "남김" | null;

/** wardId -> 오늘 "다 먹었어요/남겼어요" 체크 상태 */
export const mealCheckStore = createLocalStore<Record<string, MealCheckStatus>>(
  "grandfood-app-meal-check",
  {}
);

export function setMealCheck(wardId: string, status: MealCheckStatus) {
  mealCheckStore.update((prev) => ({ ...prev, [wardId]: status }));
}
