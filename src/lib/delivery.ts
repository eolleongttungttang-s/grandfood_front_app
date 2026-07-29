"use client";

// "조리·배송" 단계. 기존 getDeliveryHistory()는 인자를 하나도 받지 않아서, 실제로는 대상자가
// 누구든 항상 똑같은 5개 배송 기록을 보여주는 버그가 있었다(호출부에서 wardId를 넘길 방법 자체가 없었음).
// 이번에 진짜 store로 바꾸면서 ward별로 다른 배송 이력을 갖도록 함께 고쳤다.

import { createLocalStore } from "@/lib/local-store";

export type DeliveryStatus = "예정" | "완료" | "취소";

export type DeliveryRecord = {
  id: string;
  wardId: string;
  storeId: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DeliveryStatus;
  comboId?: string;
};

// 기존 정적 배열(5개, 모든 ward 공통)을 ward별 시드 데이터로 나눴다.
const SEED_DELIVERIES: Record<string, DeliveryRecord[]> = {
  "001": [
    { id: "dv-001-1", wardId: "001", storeId: "store-yeoksam", scheduledDate: "2026.07.28", scheduledTime: "12:30", status: "예정" },
    { id: "dv-001-2", wardId: "001", storeId: "store-yeoksam", scheduledDate: "2026.07.27", scheduledTime: "12:14", status: "완료" },
    { id: "dv-001-3", wardId: "001", storeId: "store-yeoksam", scheduledDate: "2026.07.26", scheduledTime: "12:20", status: "완료" },
    { id: "dv-001-4", wardId: "001", storeId: "store-yeoksam", scheduledDate: "2026.07.25", scheduledTime: "12:11", status: "완료" },
    { id: "dv-001-5", wardId: "001", storeId: "store-yeoksam", scheduledDate: "2026.07.24", scheduledTime: "12:18", status: "완료" },
  ],
  "006": [
    { id: "dv-006-1", wardId: "006", storeId: "store-cheongdam", scheduledDate: "2026.07.28", scheduledTime: "12:00", status: "예정" },
    { id: "dv-006-2", wardId: "006", storeId: "store-cheongdam", scheduledDate: "2026.07.27", scheduledTime: "12:05", status: "완료" },
    { id: "dv-006-3", wardId: "006", storeId: "store-cheongdam", scheduledDate: "2026.07.26", scheduledTime: "11:58", status: "완료" },
  ],
  "008": [
    { id: "dv-008-1", wardId: "008", storeId: "store-daechi", scheduledDate: "2026.07.28", scheduledTime: "12:00", status: "예정" },
    { id: "dv-008-2", wardId: "008", storeId: "store-daechi", scheduledDate: "2026.07.27", scheduledTime: "12:02", status: "완료" },
    { id: "dv-008-3", wardId: "008", storeId: "store-daechi", scheduledDate: "2026.07.26", scheduledTime: "18:10", status: "완료" },
    { id: "dv-008-4", wardId: "008", storeId: "store-daechi", scheduledDate: "2026.07.25", scheduledTime: "18:05", status: "완료" },
  ],
};

export const deliveryStore = createLocalStore<Record<string, DeliveryRecord[]>>(
  "grandfood-app-delivery",
  SEED_DELIVERIES
);

export function wardDeliveries(all: Record<string, DeliveryRecord[]>, wardId: string): DeliveryRecord[] {
  return all[wardId] ?? [];
}

// TODO(backend): GET /wards/:id/deliveries — 배송 이력 조회.
export async function fetchDeliveryHistory(wardId: string): Promise<DeliveryRecord[]> {
  return wardDeliveries(deliveryStore.read(), wardId);
}
