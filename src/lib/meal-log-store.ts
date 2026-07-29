"use client";

// "식사 체크인·잔반 분석" 단계. 기존 meal-check-store.ts는 "완식/남김" 버튼 한 번 탭하는 게 전부였는데,
// B2C 흐름에서는 식전/식후 사진을 남기고 칸(compartment)별 잔반율까지 분석해야 한다.
// 그래서 기존의 간단한 탭 기록(quickMealCheckStore로 이름만 바꿔 그대로 유지 — 홈 화면의 빠른 체크는
// 굳이 사진 없이도 되는 편이 나아서 없애지 않았다)과, 새로 추가하는 사진 기반 기록(mealLogStore)을
// 분리해서 둔다.

import { createLocalStore } from "@/lib/local-store";
import type { DishCombo } from "@/lib/recommendation";

export type QuickMealStatus = "완식" | "남김" | null;

/** wardId -> 오늘 "다 먹었어요/남겼어요" 빠른 체크 상태 (기존 meal-check-store.ts와 동일한 용도) */
export const quickMealCheckStore = createLocalStore<Record<string, QuickMealStatus>>(
  "grandfood-app-meal-check",
  {}
);

export function setQuickMealCheck(wardId: string, status: QuickMealStatus) {
  quickMealCheckStore.update((prev) => ({ ...prev, [wardId]: status }));
}

export type MealSlot = "아침" | "점심" | "저녁";

/** 반찬 하나(칸 하나)의 잔반율. 실제로는 비전 모델이 식전/식후 사진을 비교해 계산한다. */
export type MealLogCompartment = {
  dishId: string;
  name: string;
  leftoverPercent: number;
};

export type MealLogEntry = {
  id: string;
  wardId: string;
  mealSlot: MealSlot;
  loggedAt: string;
  beforePhotoRef: string | null;
  afterPhotoRef: string | null;
  leftoverRatePercent: number;
  compartments: MealLogCompartment[];
};

/** wardId -> 시간순 식사 기록 목록 (최신이 배열 끝) */
export const mealLogStore = createLocalStore<Record<string, MealLogEntry[]>>("grandfood-app-meal-log", {});

export function wardMealLogs(all: Record<string, MealLogEntry[]>, wardId: string): MealLogEntry[] {
  return all[wardId] ?? [];
}

// TODO(backend): POST /wards/:id/meal-logs (multipart: beforePhoto, afterPhoto) — 식전/식후 사진 업로드.
// 실제로는 비전 모델이 사진을 분석해 칸(compartment)별 잔반율을 계산해서 응답으로 돌려준다.
// 사진 업로드 UI와 실제 이미지 분석(ML)은 이번 작업 범위 밖이라, 목업은 업로드 자체를 흉내내지 않고
// seed 대신 간단한 난수로 "그럴듯한 잔반율"만 채워 응답 모양(MealLogEntry)만 맞춰둔다.
export async function submitMealLogPhotos(params: {
  wardId: string;
  mealSlot: MealSlot;
  beforePhotoRef: string | null;
  afterPhotoRef: string | null;
  combo: DishCombo;
}): Promise<MealLogEntry> {
  const compartments: MealLogCompartment[] = params.combo.items.map((item) => ({
    dishId: item.dishId,
    name: item.name,
    leftoverPercent: Math.floor(Math.random() * 60), // 0~59% — 실제로는 비전 모델 출력값으로 대체
  }));
  const entry: MealLogEntry = {
    id: `meallog-${params.wardId}-${Date.now()}`,
    wardId: params.wardId,
    mealSlot: params.mealSlot,
    loggedAt: new Date().toISOString(),
    beforePhotoRef: params.beforePhotoRef,
    afterPhotoRef: params.afterPhotoRef,
    leftoverRatePercent: Math.round(
      compartments.reduce((sum, c) => sum + c.leftoverPercent, 0) / compartments.length
    ),
    compartments,
  };
  mealLogStore.update((prev) => ({ ...prev, [params.wardId]: [...(prev[params.wardId] ?? []), entry] }));
  return entry;
}
