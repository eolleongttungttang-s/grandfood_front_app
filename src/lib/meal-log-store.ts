"use client";

// "식사 체크인·잔반 분석" 단계. 기존 meal-check-store.ts는 "완식/남김" 버튼 한 번 탭하는 게 전부였는데,
// B2C 흐름에서는 식전/식후 사진을 남기고 칸(compartment)별 잔반율까지 분석해야 한다.
// 그래서 기존의 간단한 탭 기록(quickMealCheckStore로 이름만 바꿔 그대로 유지 — 홈 화면의 빠른 체크는
// 굳이 사진 없이도 되는 편이 나아서 없애지 않았다)과, 새로 추가하는 사진 기반 기록(mealLogStore)을
// 분리해서 둔다.
//
// quickMealCheckStore는 grandfood_backend 145ee63부터 로컬 전용이 아니다 — 원탭도
// submitQuickMealCheck으로 실제 백엔드에 저장된다(사진 기반 실제 기록이 이미 있으면
// applied:false로 무시됨). 다만 로컬 스토어는 여전히 남겨둔다 — 네트워크 왕복 없이 버튼을
// 누른 즉시 "오늘 체크: 완식" 표시/TTS를 보여주는 낙관적(optimistic) 캐시 용도.

import { createLocalStore } from "@/lib/local-store";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { API_BASE_URL } from "@/lib/api-config";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { todayDateString } from "@/lib/banchan-recommendation";

// backend-auth.ts 등과 동일한 관례 — 사진 업로드(submitMealLogPhotos)만 일반 API 호출보다
// 넉넉하게 UPLOAD_TIMEOUT_MS를 따로 쓴다.
const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 30_000;

export type QuickMealStatus = "완식" | "남김" | null;

type QuickMealCheckEntry = { date: string; status: QuickMealStatus };

/** wardId -> 오늘 "다 먹었어요/남겼어요" 빠른 체크 상태 (기존 meal-check-store.ts와 동일한 용도).
 *  status만 저장하던 예전 스키마는 날짜가 없어서, 어제 누른 체크가 오늘도 그대로 남아있는
 *  문제가 있었다 — date를 같이 저장해 오늘 게 아니면 무시한다(getTodayQuickMealCheck 참고).
 *  키를 v2로 바꿔서 옛 스키마(QuickMealStatus만 저장)가 새 타입인 척 섞여 들어오는 걸 막는다. */
export const quickMealCheckStore = createLocalStore<Record<string, QuickMealCheckEntry>>(
  "grandfood-app-meal-check-v2",
  {}
);

export function setQuickMealCheck(wardId: string, status: QuickMealStatus) {
  quickMealCheckStore.update((prev) => ({ ...prev, [wardId]: { date: todayDateString(), status } }));
}

/** 오늘 날짜로 찍힌 체크만 유효하다고 본다 — 날짜가 다르면(어제 이전) "오늘은 아직 체크
 *  안 함"과 같게 취급한다. */
export function getTodayQuickMealCheck(
  all: Record<string, QuickMealCheckEntry>,
  wardId: string
): QuickMealStatus {
  const entry = all[wardId];
  if (!entry || entry.date !== todayDateString()) return null;
  return entry.status;
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
// 직접 호출해 확인함). 이 엔드포인트는 보호자 Bearer 토큰(본인 대상자) 또는 자가등록 개인 이용자
// 본인의 Bearer 토큰(자기 자신) 둘 다 받는다(backend PR — get_current_elder_app_caller). 그래서
// 호출 전에 backend-auth.ts의 resolveBackendWardAccess로 둘 중 실제로 쓸 수 있는 토큰/UUID를 먼저
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
  const access = await resolveBackendWardAccess({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!access) {
    throw new Error(
      "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 사진을 업로드할 수 있어요."
    );
  }

  const formData = new FormData();
  formData.append("mealSlot", params.mealSlot);
  formData.append("comboId", params.comboId);
  formData.append("beforePhoto", params.beforePhoto);
  formData.append("afterPhoto", params.afterPhoto);

  // fetchWithTimeout을 거쳐야 토큰 만료(401) 시 세션 만료 안내 + 로그아웃이 자동으로
  // 걸린다(fetch-with-timeout.ts의 notifySessionExpiredIfNeeded 참고) — 예전엔 여기만
  // raw fetch를 써서 사진 업로드 중 토큰이 만료되면 이 안내 없이 그냥 에러 문구만 뜨고
  // 세션은 만료된 채로 남아있었다(2026-08-14 발견).
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/wards/${access.backendWardId}/meal-logs`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access.accessToken}` },
      body: formData,
    },
    UPLOAD_TIMEOUT_MS
  );
  const response = await promise;
  clearRequestTimeout();
  if (!response.ok) {
    throw new Error(`잔반 분석 요청이 실패했어요 (status ${response.status})`);
  }

  const entry: MealLogEntry = await response.json();
  mealLogStore.update((prev) => ({ ...prev, [params.wardId]: [...(prev[params.wardId] ?? []), entry] }));
  return entry;
}

export type QuickMealCheckResult = {
  id: string;
  wardId: string;
  mealSlot: MealSlot;
  /** 이미 사진 기반 실제 기록이 있는 끼니라 이번 원탭이 반영 안 됐으면 false — 그때는
   *  status도 항상 null이다(백엔드가 실제 기록을 덮어쓰지 않고 그대로 둔다). */
  applied: boolean;
  status: "완식" | "남김" | null;
  loggedAt: string;
};

// POST /wards/:id/meal-logs/quick-check — 사진 찍을 여유가 없을 때 홈 화면 원탭("완식"/
// "남김")을 실제 백엔드에 근사 기록으로 남긴다(grandfood_backend 145ee63, 2026-08-14).
// submitMealLogPhotos와 인증/대상자 해석 방식이 같다 — resolveBackendWardAccess로 보호자/
// 자가등록 본인 토큰 중 실제로 쓸 수 있는 걸 먼저 확보한다.
export async function submitQuickMealCheck(params: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
  mealSlot: MealSlot;
  status: "완식" | "남김";
}): Promise<QuickMealCheckResult> {
  const access = await resolveBackendWardAccess({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!access) {
    throw new Error(
      "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 기록을 남길 수 있어요."
    );
  }

  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/wards/${access.backendWardId}/meal-logs/quick-check`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mealSlot: params.mealSlot, status: params.status }),
    },
    REQUEST_TIMEOUT_MS
  );
  const response = await promise;
  clearRequestTimeout();
  if (!response.ok) {
    throw new Error(`식사 체크 기록에 실패했어요 (status ${response.status})`);
  }
  return (await response.json()) as QuickMealCheckResult;
}
