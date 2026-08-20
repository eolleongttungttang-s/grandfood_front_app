"use client";

// home-view.tsx의 "오늘의 추천 반찬 조합"과 diet-view.tsx의 같은 카드+"오늘 메뉴 구성"이
// 지금까지 recommendation.ts의 목업(matchDishes)만 그렸다 — AI 반찬 추천(banchan-
// recommendation.ts)이 실제로 붙은 뒤에도 이 카드는 그대로 목업이라, 같은 화면 안에 "오늘의
// 추천 반찬 조합"(목업: 현미밥·미역국·제육볶음...)과 "AI 반찬 추천" 달력(실제: 닭가슴살볶음·
// 고등어구이...)이 서로 다른 답을 보여주는 문제가 있었다(2026-08-13 피드백, "카드 내용이
// 안 맞는다"). 오늘 실제 AI 추천이 있으면 그걸 쓰고, 아직 없으면(구독 전/생성 전/실패)
// 기존 목업으로 자연스럽게 폴백하도록 이 함수 하나로 판단을 모은다 — 두 화면이 각자 이
// 분기를 따로 하면 하나만 고치고 잊어버리기 쉽다.

import {
  BackendMealType,
  BanchanSuitability,
  getRecommendationForDate,
  MonthlyBanchanRecommendation,
  todayDateString,
} from "@/lib/banchan-recommendation";
import { DishCombo } from "@/lib/recommendation";

export type TodayMenuItem = {
  /** dishId(목업) 또는 banchanId(실제) — dislikesStore.toggleDislike는 임의의 문자열 키를
   *  받게 이미 만들어져 있어서(dislikes-store.ts), 실제 반찬도 그대로 재사용할 수 있다. */
  id: string;
  name: string;
  /** 실제 데이터는 100g당 값이고 목업은 그 반찬 1인분 값이라 단위가 다르다 — 아래 total*은
   *  그 값들을 그대로 합산한 "이 조합 전체" 근사치일 뿐, 정밀한 총 섭취량이 아니다(달력
   *  카드도 같은 100g당 값을 그대로 보여주므로 이 화면만 다른 기준을 새로 만들지 않는다). */
  kcal: number | null;
  sodiumMg: number | null;
  proteinG: number | null;
  /** 목업 항목엔 적합도 개념이 없어 null. */
  suitability: BanchanSuitability | null;
};

export type TodayMenu = {
  items: TodayMenuItem[];
  totalKcal: number;
  totalSodiumMg: number;
  totalProteinG: number;
  reasons: string[];
  /** true면 실제 AI 반찬 추천, false면 아직 실제 추천이 없어 목업으로 대체된 상태 —
   *  화면이 "대표 반찬 이모지"처럼 목업 카탈로그에만 있는 정보를 쓸지 판단하는 데 쓴다. */
  isReal: boolean;
  /** 오늘 몫이 지금 한창 생성되고 있는 중(status: "generating"). 이 경우엔 목업으로
   *  폴백하지 않는다 — "AI가 지금 고르고 있다"는 게 화면에 뜬 상태에서 바로 아래에
   *  무관한 목업 반찬(현미밥·미역국...)이 나오면 그게 이미 나온 실제 결과처럼 보여서
   *  헷갈린다는 피드백(2026-08-13). 호출부가 isGenerating일 때 items는 비어 있는 채로
   *  "생성 중" 문구를 보여줘야 한다. */
  isGenerating: boolean;
};

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/** isGenerating일 때 화면(JSX)과 TTS 문장 양쪽이 공통으로 쓰는 안내 문구 — diet-view.tsx/
 *  home-view.tsx/ward-detail-view.tsx 6곳에 그대로 복붙돼 있던 걸 하나로 모았다(2026-08-13
 *  코드리뷰 지적: 문구를 바꿀 때 한 곳을 빠뜨리면 화면마다 문구가 달라진다). */
export const TODAY_MENU_GENERATING_MESSAGE =
  "AI가 오늘 반찬을 고르고 있어요. 완료되면 자동으로 채워져요.";

// mealType을 넘기면 오늘 그 끼니(아침/점심/저녁)의 반찬만 돌려준다 — 2026-08-19 정책
// 변경으로 B2C 매일 배송도 끼니별로 다른 반찬을 받으므로(grandfood_backend
// BanchanDeliveryScheduler.schedule_daily_deliveries 참고) 이제 실제로 의미가 있다.
// 안 넘기면(undefined) 예전처럼 그날 전체를 돌려준다.
export function resolveTodayMenu(
  combo: DishCombo,
  monthly: MonthlyBanchanRecommendation | null,
  mealType?: BackendMealType
): TodayMenu {
  const real = getRecommendationForDate(monthly, todayDateString(), mealType);
  // items.length > 0을 조건에 넣지 않는다 — 생성이 끝났는데(done) 오늘 몫이 정말 0개인
  // 극히 드문 경우까지 목업으로 폴백하면, AI 반찬 추천 달력(이 날은 배정된 반찬이
  // 없어요)과 또 서로 다른 답을 보여주게 된다. done이면 items가 비어 있어도 그대로
  // "실제 추천 결과(오늘은 없음)"로 취급한다 — 호출부가 items.length === 0 && isReal일
  // 때 빈 상태 문구를 보여줘야 한다.
  if (real && real.status === "done") {
    const items: TodayMenuItem[] = [...real.items]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((item) => ({
        id: item.banchanId,
        name: item.name,
        kcal: item.caloriePer100g,
        sodiumMg: item.sodiumPer100g,
        proteinG: item.proteinPer100g,
        suitability: item.suitability,
      }));
    return {
      items,
      totalKcal: sum(items.map((i) => i.kcal)),
      totalSodiumMg: sum(items.map((i) => i.sodiumMg)),
      totalProteinG: sum(items.map((i) => i.proteinG)),
      reasons: [...new Set(real.items.map((i) => i.reason).filter((r): r is string => !!r))],
      isReal: true,
      isGenerating: false,
    };
  }

  if (real && real.status === "generating") {
    return {
      items: [],
      totalKcal: 0,
      totalSodiumMg: 0,
      totalProteinG: 0,
      reasons: [],
      isReal: false,
      isGenerating: true,
    };
  }

  return {
    items: combo.items.map((item) => ({
      id: item.dishId,
      name: item.name,
      kcal: item.kcal,
      sodiumMg: item.sodiumMg,
      proteinG: item.proteinG,
      suitability: null,
    })),
    totalKcal: combo.totalKcal,
    totalSodiumMg: combo.totalSodiumMg,
    totalProteinG: combo.totalProteinG,
    reasons: combo.reasons,
    isReal: false,
    isGenerating: false,
  };
}
