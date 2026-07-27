import { createLocalStore } from "@/lib/local-store";

export type Plan = {
  id: string;
  name: string;
  priceWon: number;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "라이트",
    priceWon: 39000,
    features: ["평일 점심 배달", "기본 건강 리포트"],
  },
  {
    id: "standard",
    name: "스탠다드",
    priceWon: 59000,
    features: ["매일 점심 · 저녁 배달", "주간 건강 리포트", "영양사 상담 월 1회"],
  },
  {
    id: "premium",
    name: "프리미엄",
    priceWon: 89000,
    features: [
      "매일 아침 · 점심 · 저녁 배달",
      "주간 · 월간 건강 리포트",
      "영양사 상담 무제한",
      "SOS 우선 대응",
    ],
  },
];

export const PAYMENT_METHOD = { brand: "국민카드", last4: "4821" };

export const subscriptionStore = createLocalStore<string>(
  "grandfood-app-plan",
  "standard"
);

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
