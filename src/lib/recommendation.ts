// "AI 반찬 매칭" 단계의 목업. 실제로는 학습된 추천 모델이 하겠지만, 지금은
// "건강 조건에 맞는 카테고리별 반찬을 규칙 기반으로 고른다"는 동일한 입출력 모양만 흉내낸다.
//
// 일부러 Ward/WardDetail 타입을 import하지 않고 평평한(flat) command만 받게 만들었다 —
// 실제 매칭 서버도 어르신의 전체 데이터가 아니라 "이 매장에서, 이 조건/알레르기를 가진 사람에게
// 뭘 추천할지" 정도의 값만 전달받을 것이기 때문에, 나중에 백엔드로 바뀌어도 이 함수의
// 입력/출력 모양은 그대로 유지될 수 있다.

import { seedFromId } from "@/lib/seed";
import { DISH_CATALOG, getDish, type AllergyTag, type Dish, type DishCategory } from "@/lib/dishes";

// 소수 값 여러 개를 reduce로 더하면 부동소수점 오차가 그대로 쌓여 "24.630000000000003"처럼
// 노출될 수 있다(2026-08-21 버그 리포트, today-menu.ts의 sum()과 동일한 원인) — 소수점
// 둘째 자리에서 반올림해 지운다.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type MatchDishesCommand = {
  wardId: string;
  storeId: string;
  conditions: string[];
  allergyTags: AllergyTag[];
  statusHint: "확인 필요" | "관찰중" | "양호";
};

export type DishComboItem = {
  dishId: string;
  name: string;
  kcal: number;
  sodiumMg: number;
  proteinG: number;
};

export type DishCombo = {
  comboId: string;
  wardId: string;
  storeId: string;
  items: DishComboItem[];
  totalKcal: number;
  totalSodiumMg: number;
  totalProteinG: number;
  reasons: string[];
  matchedAt: string;
};

const CATEGORY_ORDER: DishCategory[] = ["밥", "국", "메인", "나물", "김치"];

function has(conditions: string[], keyword: string): boolean {
  return conditions.some((c) => c.includes(keyword));
}

// 이 매장 카탈로그에서, 대상자가 알레르기 있는 반찬을 먼저 제외한 후보만 남긴다.
function eligibleDishes(storeId: string, allergyTags: AllergyTag[]): Dish[] {
  return DISH_CATALOG.filter(
    (d) => d.storeId === storeId && !d.allergyTags.some((tag) => allergyTags.includes(tag))
  );
}

function toComboItem(dish: Dish): DishComboItem {
  return { dishId: dish.id, name: dish.name, kcal: dish.kcal, sodiumMg: dish.sodiumMg, proteinG: dish.proteinG };
}

// seed가 실제 백엔드 호출 시각처럼 매번 달라져도(requestNewCombo) 같은 로직을 재사용할 수 있도록
// "조합을 만드는 계산" 자체는 matchDishes/requestNewCombo가 공유하는 이 함수 하나에만 있다.
function buildCombo(cmd: MatchDishesCommand, seed: number): DishCombo {
  const needsLowSodium = has(cmd.conditions, "고혈압") || has(cmd.conditions, "당뇨") || has(cmd.conditions, "심부전");
  const needsHighProtein = has(cmd.conditions, "당뇨") || cmd.statusHint === "확인 필요";
  const candidates = eligibleDishes(cmd.storeId, cmd.allergyTags);

  const dishes: Dish[] = CATEGORY_ORDER.map((category) => {
    const inCategory = candidates.filter((d) => d.category === category);
    const pool = inCategory.length > 0 ? inCategory : candidates; // 안전장치: 후보가 없으면 매장 전체에서

    if (category === "메인" && needsHighProtein) {
      const byProtein = [...pool].sort((a, b) => b.proteinG - a.proteinG);
      if (byProtein.length > 0) return byProtein[0];
    }
    if (needsLowSodium) {
      return [...pool].sort((a, b) => a.sodiumMg - b.sodiumMg)[0];
    }
    // 저염/고단백 조건이 없으면 seed로 결정적으로 하나를 고른다 (매번 같은 조합이 나오게).
    return pool[seed % pool.length];
  });

  const reasons: string[] = [];
  if (needsLowSodium) reasons.push("나트륨 제한이 필요해 저염 반찬 위주로 구성했어요");
  if (needsHighProtein) reasons.push("단백질 보강이 필요해 단백질 함량이 높은 메인 반찬을 골랐어요");
  if (cmd.allergyTags.length > 0) reasons.push(`${cmd.allergyTags.join(", ")} 알레르기 유발 반찬은 제외했어요`);
  if (reasons.length === 0) reasons.push("특별한 위험 요인이 없어 표준 조합으로 구성했어요");

  return {
    comboId: `combo-${cmd.wardId}-${seed}`,
    wardId: cmd.wardId,
    storeId: cmd.storeId,
    items: dishes.map(toComboItem),
    totalKcal: round2(dishes.reduce((sum, d) => sum + d.kcal, 0)),
    totalSodiumMg: round2(dishes.reduce((sum, d) => sum + d.sodiumMg, 0)),
    totalProteinG: round2(dishes.reduce((sum, d) => sum + d.proteinG, 0)),
    reasons,
    matchedAt: new Date().toISOString(),
  };
}

// wards.ts의 getWardDetail()이 렌더마다 동기적으로 호출하는 "오늘의 추천". ward id 기반 고정 seed라
// 새로고침해도 같은 조합이 나온다.
export function matchDishes(cmd: MatchDishesCommand): DishCombo {
  return buildCombo(cmd, seedFromId(cmd.wardId));
}

// TODO(backend): POST /wards/:id/recommendations — 사용자가 "다시 추천받기"를 눌러 새 조합을 명시적으로 요청.
// matchDishes()와 계산 로직은 같지만, 호출 시각을 seed로 써서 매번 다른 조합이 나오게 한다.
// 실제 백엔드가 붙으면 이 함수 몸통만 fetch(`/wards/${cmd.wardId}/recommendations`, {method:"POST"})로 바뀌고,
// 반환 타입(DishCombo)과 호출부는 그대로 유지된다.
export async function requestNewCombo(cmd: MatchDishesCommand): Promise<DishCombo> {
  return buildCombo(cmd, Date.now());
}

// TODO(backend): PATCH /wards/:id/recommendations/:comboId/items/:dishId — 반찬 1개를 다른 걸로 교체.
// 실제 서버라면 알레르기/카테고리 일치 여부를 다시 검증하겠지만, 목업은 카탈로그에서 찾은 값을 그대로 반영한다.
export async function swapComboItem(
  combo: DishCombo,
  dishId: string,
  replacementDishId: string
): Promise<DishCombo> {
  const replacement = getDish(replacementDishId);
  if (!replacement) return combo;

  const items = combo.items.map((item) => (item.dishId === dishId ? toComboItem(replacement) : item));
  return {
    ...combo,
    items,
    totalKcal: round2(items.reduce((sum, i) => sum + i.kcal, 0)),
    totalSodiumMg: round2(items.reduce((sum, i) => sum + i.sodiumMg, 0)),
    totalProteinG: round2(items.reduce((sum, i) => sum + i.proteinG, 0)),
  };
}
