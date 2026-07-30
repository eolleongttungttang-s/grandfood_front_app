// B2C 전환의 핵심 개념: 어르신(Ward)은 더 이상 "정부 위탁 시설(facility)"에 속하지 않고,
// 실제 반찬을 만들어 배송하는 "파트너 반찬가게"에 속한다.
// 사회복지사(caseWorker)가 하던 역할(문의 응대)도 이제 매장 지원 전화번호로 대체된다.

export type PartnerStore = {
  id: string;
  name: string;
  region: string;
  supportPhone: string;
  /** 이 매장이 배송 가능한 시간대 (예: 점심 배송 / 저녁 배송) */
  deliveryWindows: string[];
};

// 기존 3개 ward의 주소(역삼1동/청담동/대치2동)에 맞춰 파트너 매장을 하나씩 배정했다.
// 실제 서비스에서는 매장이 지역별로 여러 개일 수 있지만, 목업 단계에서는 1지역 1매장으로 단순화.
export const PARTNER_STORES: PartnerStore[] = [
  {
    id: "store-yeoksam",
    name: "역삼 건강반찬",
    region: "역삼동",
    supportPhone: "02-555-0101",
    deliveryWindows: ["11:30~13:00", "17:30~19:00"],
  },
  {
    id: "store-cheongdam",
    name: "청담 저염반찬",
    region: "청담동",
    supportPhone: "02-555-0202",
    deliveryWindows: ["12:00~13:30"],
  },
  {
    id: "store-daechi",
    name: "대치 실버반찬",
    region: "대치동",
    supportPhone: "02-555-0303",
    deliveryWindows: ["11:00~12:30", "18:00~19:30"],
  },
];

export function getPartnerStore(id: string): PartnerStore | undefined {
  return PARTNER_STORES.find((s) => s.id === id);
}
