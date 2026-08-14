"use client";

// "식사 체크인·잔반 분석" 단계 — 식전/식후 사진을 남기고 칸(compartment)별 잔반율까지 분석한다.
// 예전엔 사진 없이 "완식/남김" 버튼만 누르는 빠른 체크(quickMealCheckStore)도 따로 있었는데,
// 실제 사진으로 잔반을 확인할 수 있는 이상 자가 신고 버튼은 중복이라 없앴다(2026-08-14 피드백,
// 홈 화면에 이 사진 체크인을 그대로 옮기며 정리). 그 원탭 버튼을 실제 백엔드에 저장하던
// submitQuickMealCheck(grandfood_backend 145ee63)도 호출부가 없어져 같이 제거했다 — 백엔드
// 엔드포인트(POST .../meal-logs/quick-check) 자체는 남아있지만 이제 프론트 어디서도 안 쓴다.

import { createLocalStore } from "@/lib/local-store";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { API_BASE_URL } from "@/lib/api-config";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// 사진 업로드(submitMealLogPhotos)는 일반 API 호출보다 넉넉하게 UPLOAD_TIMEOUT_MS를 쓴다 —
// backend-auth.ts 등과 동일한 관례.
const UPLOAD_TIMEOUT_MS = 30_000;

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
  let response: Response;
  try {
    response = await promise;
  } catch (err) {
    // wellness-calls.ts/rag-chat.ts와 같은 관례 — AbortError(타임아웃)를 여기서 먼저
    // 잡아 안내 문구로 바꿔둔다. 안 그러면 원본 DOMException이 그대로 diet-view.tsx의
    // catch까지 올라가는데, 거기는 TypeError만 "서버에 연결할 수 없어요"로 특별 취급하고
    // DOMException은 걸러내지 못해 "잔반 분석 요청에 실패했어요"라는 애매한 문구로
    // 뭉개진다(코드 리뷰 지적 — 이 파일의 다른 timeout-aware 호출부들과 관례가 달랐음).
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
  if (!response.ok) {
    throw new Error(`잔반 분석 요청이 실패했어요 (status ${response.status})`);
  }

  const entry: MealLogEntry = await response.json();
  mealLogStore.update((prev) => ({ ...prev, [params.wardId]: [...(prev[params.wardId] ?? []), entry] }));
  return entry;
}
