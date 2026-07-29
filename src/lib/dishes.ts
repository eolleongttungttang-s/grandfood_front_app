// 반찬 "카탈로그" — B2C 흐름의 2단계(AI 반찬 매칭)가 "한정된 반찬 세트 안에서 조합을 고르는 것"이라,
// 예전처럼 조건별로 미리 정해둔 식단 이름 하나(예: "저염 관리형 식단")를 보여주는 게 아니라,
// 실제로 고를 수 있는 개별 반찬 목록이 먼저 있어야 한다. 이 파일이 그 목록의 원본이다.

import { PARTNER_STORES } from "@/lib/partner-stores";

export type DishCategory = "밥" | "국" | "메인" | "나물" | "김치";

// wards.ts의 기존 ALLERGY_POOL과 동일한 항목("없음" 제외 — 반찬 하나가 여러 알레르기 유발 성분을 가질 수 있어서
// "없음"이라는 단일 값 대신 빈 배열([])로 "해당 없음"을 표현한다).
export type AllergyTag = "해산물" | "메밀" | "갑각류" | "우유" | "견과류";

export type Dish = {
  id: string;
  storeId: string;
  name: string;
  category: DishCategory;
  kcal: number;
  sodiumMg: number;
  proteinG: number;
  allergyTags: AllergyTag[];
  ingredients: string[];
  imageEmoji: string;
};

// 매장마다 파는 반찬 이름/영양성분은 같고 매장(storeId)만 다르다고 가정한 목업 단순화.
// 실제로는 매장마다 레시피가 다르겠지만, 지금 목적은 "카탈로그에서 조합을 고른다"는 화면 흐름을
// 검증하는 것이지 실제 매장별 메뉴 차별화가 아니라서 템플릿 하나를 여러 매장에 복제하는 방식을 택했다.
type DishTemplate = Omit<Dish, "id" | "storeId">;

const DISH_TEMPLATES: DishTemplate[] = [
  // 밥
  { name: "잡곡밥", category: "밥", kcal: 300, sodiumMg: 5, proteinG: 6, allergyTags: [], ingredients: ["잡곡", "쌀"], imageEmoji: "🍚" },
  { name: "흰쌀밥", category: "밥", kcal: 310, sodiumMg: 2, proteinG: 5, allergyTags: [], ingredients: ["쌀"], imageEmoji: "🍚" },
  { name: "현미밥", category: "밥", kcal: 290, sodiumMg: 3, proteinG: 6, allergyTags: [], ingredients: ["현미"], imageEmoji: "🍚" },
  // 국 — 나트륨 낮은 것(저염된장국/맑은무국)과 높은 것(미역국)을 함께 둬서
  // 추천 로직(recommendation.ts)이 고혈압/심부전 여부에 따라 고를 수 있게 한다.
  { name: "저염된장국", category: "국", kcal: 60, sodiumMg: 380, proteinG: 5, allergyTags: [], ingredients: ["된장", "두부"], imageEmoji: "🍲" },
  { name: "맑은무국", category: "국", kcal: 40, sodiumMg: 320, proteinG: 3, allergyTags: [], ingredients: ["무", "다시마"], imageEmoji: "🍲" },
  { name: "미역국", category: "국", kcal: 70, sodiumMg: 520, proteinG: 4, allergyTags: [], ingredients: ["미역", "소고기"], imageEmoji: "🍲" },
  // 메인 — 고단백/저염(닭가슴살찜)과 고염(제육볶음), 해산물 알레르기 태그(고등어구이)까지 다양하게 구성.
  { name: "두부조림", category: "메인", kcal: 180, sodiumMg: 450, proteinG: 14, allergyTags: [], ingredients: ["두부", "간장"], imageEmoji: "🍢" },
  { name: "닭가슴살찜", category: "메인", kcal: 200, sodiumMg: 300, proteinG: 26, allergyTags: [], ingredients: ["닭가슴살"], imageEmoji: "🍗" },
  { name: "고등어구이", category: "메인", kcal: 250, sodiumMg: 520, proteinG: 22, allergyTags: ["해산물"], ingredients: ["고등어"], imageEmoji: "🐟" },
  { name: "제육볶음", category: "메인", kcal: 320, sodiumMg: 700, proteinG: 20, allergyTags: [], ingredients: ["돼지고기", "고추장"], imageEmoji: "🥘" },
  // 나물
  { name: "시금치나물", category: "나물", kcal: 45, sodiumMg: 180, proteinG: 3, allergyTags: [], ingredients: ["시금치"], imageEmoji: "🥬" },
  { name: "브로콜리나물", category: "나물", kcal: 40, sodiumMg: 150, proteinG: 3, allergyTags: [], ingredients: ["브로콜리"], imageEmoji: "🥦" },
  { name: "나물무침", category: "나물", kcal: 50, sodiumMg: 220, proteinG: 2, allergyTags: [], ingredients: ["콩나물"], imageEmoji: "🥗" },
  // 김치
  { name: "배추김치", category: "김치", kcal: 30, sodiumMg: 480, proteinG: 1, allergyTags: [], ingredients: ["배추", "젓갈"], imageEmoji: "🥬" },
  { name: "깍두기", category: "김치", kcal: 35, sodiumMg: 460, proteinG: 1, allergyTags: [], ingredients: ["무", "젓갈"], imageEmoji: "🥕" },
];

function slugify(name: string): string {
  return name.replace(/\s+/g, "");
}

// 매장 × 템플릿 조합으로 카탈로그를 만든다. 매장마다 하드코딩된 배열을 따로 두는 대신
// 이렇게 생성하면, 나중에 반찬을 하나 추가/수정할 때 DISH_TEMPLATES 한 곳만 고치면 된다.
export const DISH_CATALOG: Dish[] = PARTNER_STORES.flatMap((store) =>
  DISH_TEMPLATES.map((template) => ({
    ...template,
    id: `${store.id}-${slugify(template.name)}`,
    storeId: store.id,
  }))
);

export function getDish(id: string): Dish | undefined {
  return DISH_CATALOG.find((d) => d.id === id);
}

// TODO(backend): GET /stores/:storeId/dishes — 파트너 매장이 실제로 등록한 반찬 목록 조회.
// 지금은 매장마다 등록 화면이 없어 전역 DISH_CATALOG를 storeId로 필터링하는 것으로 대신한다.
export async function fetchDishCatalog(storeId: string): Promise<Dish[]> {
  return DISH_CATALOG.filter((d) => d.storeId === storeId);
}
