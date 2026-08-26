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
  MealStaple,
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
  totalCarbsG: number;
  /** BMR/TDEE+KDRI 기반 "하루" 목표치(banchan-recommendation.ts의 DateRecommendation과 동일) —
   *  이 메뉴 자체는 한 끼(mealType)만 담고 있어도 목표치는 하루 기준 그대로 넘어온다. 화면
   *  쪽에서 끼니 수만큼 나눠 "이 끼니의 목표"를 근사해야 한다(diet-view.tsx MEALS_PER_DAY
   *  참고) — 하루 목표를 한 끼 합계에 그대로 들이대면 항상 30%대로만 보여 의미가 없다.
   *  온보딩에 성별/키/체중/활동량이 다 있어야 채워지고, 없으면 null(2026-08-21 피드백:
   *  나트륨/단백질/열량 숫자만 있고 목표 대비 비교가 없어 어르신이 좋고 나쁨을 판단하기
   *  어렵다는 지적에 대응). 목업(isReal: false) 조합은 실제 건강 프로필에 근거한 값이
   *  아니므로 항상 null. */
  targetCalorieKcal: number | null;
  targetProteinG: number | null;
  targetSodiumMg: number | null;
  targetCarbsG: number | null;
  reasons: string[];
  /** true면 실제 AI 반찬 추천, false면 아직 실제 추천이 없어 목업으로 대체된 상태 —
   *  화면이 "대표 반찬 이모지"처럼 목업 카탈로그에만 있는 정보를 쓸지 판단하는 데 쓴다. */
  isReal: boolean;
  /** 반찬과 별개로 항상 나오는 밥 — 백엔드가 카탈로그 평균값으로 내려주는 계획 단계
   *  수치라(banchan-recommendation.ts MealStaple 참고) 실제 섭취량이 아니다. items 맨
   *  앞에도 같은 정보가 표시용으로 들어가 있지만, 이 필드는 "밥인지 아닌지"를 화면이
   *  구분해야 할 때(예: 실제 섭취 계열 화면과 헷갈리지 않게 표시를 다르게 하고 싶을 때)
   *  쓰라고 별도로 남겨둔다. 목업/생성 중엔 항상 null. */
  staple: MealStaple | null;
  /** 오늘 몫이 지금 한창 생성되고 있는 중(status: "generating"). 이 경우엔 목업으로
   *  폴백하지 않는다 — "AI가 지금 고르고 있다"는 게 화면에 뜬 상태에서 바로 아래에
   *  무관한 목업 반찬(현미밥·미역국...)이 나오면 그게 이미 나온 실제 결과처럼 보여서
   *  헷갈린다는 피드백(2026-08-13). 호출부가 isGenerating일 때 items는 비어 있는 채로
   *  "생성 중" 문구를 보여줘야 한다. */
  isGenerating: boolean;
};

// 부동소수점 덧셈은 0.1 + 0.2 같은 오차가 그대로 쌓인다 — 100g당 단백질 같은 소수 값을
// 여러 개 더하면 "24.630000000000003g"처럼 화면에 그대로 노출된다(2026-08-21 버그 리포트).
// 소수점 둘째 자리에서 반올림해 오차를 지운다 — toFixed(2)로 문자열화하지 않는 이유는
// 나트륨/열량처럼 원래 정수인 값에 불필요한 ".00"이 붙는 걸 막기 위함.
function sum(values: (number | null)[]): number {
  const total = values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** isGenerating일 때 화면(JSX)과 TTS 문장 양쪽이 공통으로 쓰는 안내 문구 — diet-view.tsx/
 *  home-view.tsx/ward-detail-view.tsx 6곳에 그대로 복붙돼 있던 걸 하나로 모았다(2026-08-13
 *  코드리뷰 지적: 문구를 바꿀 때 한 곳을 빠뜨리면 화면마다 문구가 달라진다). */
export const TODAY_MENU_GENERATING_MESSAGE =
  "AI가 오늘 반찬을 고르고 있어요. 완료되면 자동으로 채워져요.";

// 반찬별 reason은 LLM이 만든 문장이고, 가이드라인 자료를 근거로 판단했을 때 문장 끝에
// "(출처: <원본 파일명>)"을 그대로 붙인다(grandfood_backend health/service.py 프롬프트
// 규칙 7번 — 예: "(출처: 5대_만성질환_맞춤_식이관리_가이드.pdf)"). 어르신에게 기술적인
// 파일명을 그대로 보여주면 안 되니(2026-08-24 피드백), 인용이 있었다는 사실만 남기고
// 파일명 부분만 고정 문구로 바꾼다. 가이드라인을 인용하지 않은 reason(프롬프트 규칙 7번:
// 관련 자료가 없으면 출처를 안 붙임)은 이 패턴 자체가 없어 그대로 통과한다.
const SOURCE_CITATION_PATTERN = /\s*\(출처\s*[:：]\s*[^)]*\)\s*$/;

function replaceSourceCitation(reason: string): string {
  return SOURCE_CITATION_PATTERN.test(reason)
    ? reason.replace(SOURCE_CITATION_PATTERN, " (건강정보 자료를 참고했어요)")
    : reason;
}

// mealType을 넘기면 오늘 그 끼니(아침/점심/저녁)의 반찬만 돌려준다 — 2026-08-19 정책
// 변경으로 B2C 매일 배송도 끼니별로 다른 반찬을 받으므로(grandfood_backend
// BanchanDeliveryScheduler.schedule_daily_deliveries 참고) 이제 실제로 의미가 있다.
// 안 넘기면(undefined) 예전처럼 그날 전체를 돌려준다.
//
// dateStr도 옵션이다 — 기본값(안 넘기면)은 여전히 "오늘"이라 home-view.tsx/
// ward-detail-view.tsx는 그대로 쓰면 된다. diet-view.tsx만 사용자가 달력에서 다른
// 날짜를 보고 있을 때 그 날짜를 넘긴다(2026-08-21 피드백 — 달력에서 날짜를 넘기거나 그
// 날짜의 끼니를 눌러도 "왜 이 조합인가요"가 계속 오늘 것만 보여줘서 안 바뀌는 것처럼
// 보였다). 목업 폴백(이름/함수 자체는 "오늘"을 뜻하지만) 값은 애초에 날짜 개념이 없어
// dateStr과 무관하게 항상 같다 — 실제 AI 추천이 있는 날짜에서만 이 인자가 의미가 있다.
export function resolveTodayMenu(
  combo: DishCombo,
  monthly: MonthlyBanchanRecommendation | null,
  mealType?: BackendMealType,
  dateStr: string = todayDateString()
): TodayMenu {
  const real = getRecommendationForDate(monthly, dateStr, mealType);
  // items.length > 0을 조건에 넣지 않는다 — 생성이 끝났는데(done) 오늘 몫이 정말 0개인
  // 극히 드문 경우까지 목업으로 폴백하면, AI 반찬 추천 달력(이 날은 배정된 반찬이
  // 없어요)과 또 서로 다른 답을 보여주게 된다. done이면 items가 비어 있어도 그대로
  // "실제 추천 결과(오늘은 없음)"로 취급한다 — 호출부가 items.length === 0 && isReal일
  // 때 빈 상태 문구를 보여줘야 한다.
  if (real && real.status === "done") {
    const banchanItems: TodayMenuItem[] = [...real.items]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((item) => ({
        id: item.banchanId,
        name: item.name,
        kcal: item.caloriePer100g,
        sodiumMg: item.sodiumPer100g,
        proteinG: item.proteinPer100g,
        suitability: item.suitability,
      }));
    // 밥은 반찬 추천 슬롯을 안 차지해 real.items엔 안 잡히지만(banchan-recommendation.ts
    // MealStaple 주석 참고) 실제 식판엔 항상 올라가므로, 맨 앞에 표시용으로 끼워 넣는다 —
    // 그래야 "오늘 메뉴 구성"이 실제 한 끼와 같아 보인다(예: "토마토달걀볶음, 소불고기볶음,
    // 고사리나물, 밥").
    const stapleItem: TodayMenuItem[] = real.staple
      ? [
          {
            id: `staple-${real.staple.name}`,
            name: real.staple.name,
            kcal: real.staple.caloriePer100g,
            sodiumMg: real.staple.sodiumPer100g,
            proteinG: real.staple.proteinPer100g,
            suitability: null,
          },
        ]
      : [];
    const items = [...stapleItem, ...banchanItems];
    return {
      items,
      totalKcal: sum(items.map((i) => i.kcal)),
      totalSodiumMg: sum(items.map((i) => i.sodiumMg)),
      totalProteinG: sum(items.map((i) => i.proteinG)),
      totalCarbsG: sum([...real.items.map((i) => i.carbsPer100g), real.staple?.carbsPer100g ?? null]),
      targetCalorieKcal: real.targetCalorieKcal,
      targetProteinG: real.targetProteinG,
      targetSodiumMg: real.targetSodiumMg,
      targetCarbsG: real.targetCarbsG,
      reasons: [
        ...new Set(
          real.items
            .map((i) => i.reason)
            .filter((r): r is string => !!r)
            .map(replaceSourceCitation)
        ),
      ],
      isReal: true,
      isGenerating: false,
      staple: real.staple,
    };
  }

  if (real && real.status === "generating") {
    return {
      items: [],
      totalKcal: 0,
      totalSodiumMg: 0,
      totalProteinG: 0,
      totalCarbsG: 0,
      targetCalorieKcal: null,
      targetProteinG: null,
      targetSodiumMg: null,
      targetCarbsG: null,
      reasons: [],
      isReal: false,
      isGenerating: true,
      staple: null,
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
    totalCarbsG: 0,
    // 목업 조합은 실제 건강 프로필(BMR/TDEE)에 근거한 게 아니라 목표치 비교 자체가
    // 성립하지 않는다 — isReal이 아닐 때 호출부는 항상 raw 값만 보여줘야 한다.
    targetCalorieKcal: null,
    targetProteinG: null,
    targetSodiumMg: null,
    targetCarbsG: null,
    reasons: combo.reasons,
    isReal: false,
    isGenerating: false,
    staple: null,
  };
}
