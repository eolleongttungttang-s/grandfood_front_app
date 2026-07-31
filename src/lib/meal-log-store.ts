"use client";

// "식사 체크인·잔반 분석" 단계. 기존 meal-check-store.ts는 "완식/남김" 버튼 한 번 탭하는 게 전부였는데,
// B2C 흐름에서는 식전/식후 사진을 남기고 칸(compartment)별 잔반율까지 분석해야 한다.
// 그래서 기존의 간단한 탭 기록(quickMealCheckStore로 이름만 바꿔 그대로 유지 — 홈 화면의 빠른 체크는
// 굳이 사진 없이도 되는 편이 나아서 없애지 않았다)과, 새로 추가하는 사진 기반 기록(mealLogStore)을
// 분리해서 둔다.

import { createLocalStore } from "@/lib/local-store";

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

// 실제 백엔드 서버 주소. grandfood_backend는 uvicorn 기본 포트(8000)로 뜨니 그 값을 기본값으로 뒀다.
// 이 앱은 next.config.ts에서 output:"export"로 정적 export하기 때문에, 이 값은 "실행 중에" 바뀌는
// 게 아니라 빌드할 때 process.env에서 읽혀 번들에 그대로 박힌다 — 배포 환경마다 API 주소가 다르면
// 빌드 전에 .env.local(또는 CI 환경변수)에 NEXT_PUBLIC_API_BASE_URL을 설정해야 한다.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// POST /wards/:id/meal-logs — 식전/식후 사진을 실제로 백엔드에 업로드해서 잔반 분석을 요청한다.
// grandfood_backend에는 아직 이 엔드포인트가 없어서(팀원이 구현 예정), 지금은 호출하면 연결 실패/404가
// 나는 게 정상이다 — docs/backend-api-contract.md의 4번 항목대로 엔드포인트가 생기면 그대로 연결된다.
export async function submitMealLogPhotos(params: {
  wardId: string;
  mealSlot: MealSlot;
  /** 오늘 추천받은 조합 id — 서버가 잔반 사진을 어떤 반찬 구성과 비교해야 하는지 알아야 하므로 함께 보낸다 */
  comboId: string;
  beforePhoto: File;
  afterPhoto: File;
}): Promise<MealLogEntry> {
  const formData = new FormData();
  formData.append("mealSlot", params.mealSlot);
  formData.append("comboId", params.comboId);
  formData.append("beforePhoto", params.beforePhoto);
  formData.append("afterPhoto", params.afterPhoto);

  const response = await fetch(`${API_BASE_URL}/wards/${params.wardId}/meal-logs`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`잔반 분석 요청이 실패했어요 (status ${response.status})`);
  }

  const entry: MealLogEntry = await response.json();
  mealLogStore.update((prev) => ({ ...prev, [params.wardId]: [...(prev[params.wardId] ?? []), entry] }));
  return entry;
}
