"use client";

// "식사 체크인·잔반 분석" 단계. 기존 meal-check-store.ts는 "완식/남김" 버튼 한 번 탭하는 게 전부였는데,
// B2C 흐름에서는 식전/식후 사진을 남기고 칸(compartment)별 잔반율까지 분석해야 한다.
// 그래서 기존의 간단한 탭 기록(quickMealCheckStore로 이름만 바꿔 그대로 유지 — 홈 화면의 빠른 체크는
// 굳이 사진 없이도 되는 편이 나아서 없애지 않았다)과, 새로 추가하는 사진 기반 기록(mealLogStore)을
// 분리해서 둔다.

import { createLocalStore } from "@/lib/local-store";
import { ensureBackendWardId, getBackendGuardianSessionForWard } from "@/lib/backend-auth";
import { API_BASE_URL } from "@/lib/api-config";

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

/** 현재 시각 기준 식사 시간대 (11시 이전=아침, 11~17시=점심, 그 외=저녁). */
export function getCurrentMealSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 11) return "아침";
  if (hour < 17) return "점심";
  return "저녁";
}

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

// POST /wards/:id/meal-logs — 식전/식후 사진을 실제로 백엔드에 업로드해서 잔반 분석을 요청한다.
// grandfood_backend에 배포되어 있는 실제 엔드포인트 (Container App `grandfood`, 2026-08-04 curl로
// 직접 호출해 확인함). 이 엔드포인트는 로그인한 보호자의 Bearer 토큰 + 실제 UUID ward_id를 요구한다
// (보호자 본인 소유 어르신이 아니면 403). 그래서 호출 전에 backend-auth.ts로 실제 토큰/UUID를 먼저
// 확보한다 — 목업 wardId("001" 등)와 로컬 세션(session.tsx)만으로는 이 요청이 통과하지 않는다.
// leftoverRatePercent/compartments는 아직 Vision 분석이 붙지 않아 백엔드에서 0/[]로 고정 응답한다.
export async function submitMealLogPhotos(params: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
  mealSlot: MealSlot;
  /** 오늘 추천받은 조합 id — 서버가 잔반 사진을 어떤 반찬 구성과 비교해야 하는지 알아야 하므로 함께 보낸다 */
  comboId: string;
  beforePhoto: File;
  afterPhoto: File;
}): Promise<MealLogEntry> {
  const session = getBackendGuardianSessionForWard(params.wardId);
  if (!session) {
    throw new Error("이 대상자를 관리하는 보호자 계정으로 로그인해야 사진을 업로드할 수 있어요.");
  }

  const backendWardId = await ensureBackendWardId({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!backendWardId) {
    throw new Error("대상자 정보를 서버에 등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const formData = new FormData();
  formData.append("mealSlot", params.mealSlot);
  formData.append("comboId", params.comboId);
  formData.append("beforePhoto", params.beforePhoto);
  formData.append("afterPhoto", params.afterPhoto);

  const response = await fetch(`${API_BASE_URL}/wards/${backendWardId}/meal-logs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`잔반 분석 요청이 실패했어요 (status ${response.status})`);
  }

  const entry: MealLogEntry = await response.json();
  mealLogStore.update((prev) => ({ ...prev, [params.wardId]: [...(prev[params.wardId] ?? []), entry] }));
  return entry;
}
