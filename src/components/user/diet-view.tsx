"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import { BackendMealType, MonthlyBanchanRecommendation, todayDateString } from "@/lib/banchan-recommendation";
import { formatMonthDayLabel } from "@/lib/date-format";
import { getCurrentMealSlot, MealSlot } from "@/lib/meal-log-store";
import type { DishCombo } from "@/lib/recommendation";
import { fetchElderDietHistory } from "@/lib/meal-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { BanchanRecommendationSection } from "@/components/app/banchan-recommendation-section";
import { ExpandToggle } from "@/components/app/expand-toggle";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";

// meal-log-store.ts의 MealSlot("아침"/"점심"/"저녁")을 백엔드 meal_type("breakfast"/
// "lunch"/"dinner")으로 — diet-day-detail.tsx의 MEAL_TYPE_LABEL과 반대 방향 매핑. 최초
// mealType 초기값(지금 시간대 기준) 계산에만 쓰고, 그 이후는 아래 끼니 선택 탭
// (banchan-recommendation-calendar.tsx)이 알려주는 값을 그대로 따른다.
const MEAL_SLOT_TO_BACKEND_MEAL_TYPE: Record<MealSlot, BackendMealType> = {
  아침: "breakfast",
  점심: "lunch",
  저녁: "dinner",
};

// 반대로 화면 제목("오늘의 O 추천 반찬 조합")에 쓸 한글 라벨 — banchan-recommendation-
// calendar.tsx의 MEAL_TYPE_TAB_OPTIONS와 같은 개념인데 이 파일도 각자 따로 두는 관례를
// 따른다(그 파일 상단 주석 참고).
// resolveTodayMenu가 real도 없고 combo도 없을 때를 대비해 만드는 게 아니라, 반대로
// "오늘이 아닌 날짜를 볼 때 오늘자 목업으로 폴백하지 못하게" 일부러 빈 combo를
// 넘기는 용도다(2026-08-21) — 목업(detail.recommendedCombo)은 애초에 "오늘"에 대한
// 고정값이라, 다른 날짜에 그걸 보여주면 "이 날짜 것"인 양 오해하게 만든다.
const EMPTY_DISH_COMBO: DishCombo = {
  comboId: "",
  wardId: "",
  storeId: "",
  items: [],
  totalKcal: 0,
  totalSodiumMg: 0,
  totalProteinG: 0,
  reasons: [],
  matchedAt: "",
};

const BACKEND_MEAL_TYPE_LABEL: Record<BackendMealType, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
};

export function DietView({
  ward,
  detail,
}: {
  ward: Ward;
  detail: WardDetail;
}) {
  // 신규 회원(지금까지 AI 반찬 추천을 한 번도 받은 적 없음)인지에 따라 이 화면 전체를 다르게
  // 그린다 — "오늘의 추천 반찬 조합"류 카드는 전부 목업(matchDishes, wards.ts)이라, 아직 실제
  // AI 추천을 한 번도 못 받아본 사람에게 먼저 보여줄 이유가 없다고 판단해 AI 반찬 추천 카드만
  // 남기고 나머지는 숨긴다(2026-08-12 논의). 이 판단에 따른 조건부 return은 아래 다른 Hook을
  // 전부 호출한 뒤(맨 아래 return 문 바로 위)에 두어서 Hooks 호출 순서를 건드리지 않는다.
  const banchanIdentity = {
    wardId: ward.id,
    wardName: ward.name,
    wardAge: ward.age,
    wardAddress: ward.address,
  };
  const banchanRecommendation = useMonthlyBanchanRecommendation(banchanIdentity);

  // "왜 이 조합인가요"/"질환·알레르기·복약" 둘 다 기본은 접어두고, 필요할 때만 펼쳐서
  // 본다 — 화면 자체가 설명이 되어야 한다는 방침(2026-08-14 피드백)이라, 한 화면에 정보를
  // 다 펼쳐놓기보다 필요한 사람만 더 눌러보게 한다.
  const [reasonsExpanded, setReasonsExpanded] = useState(false);
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  // 끼니 선택 탭(2026-08-19 도입, 2026-08-21 위치 이동) — 처음엔 이 카드 안에 "끼니 선택"
  // 버튼이 따로 있었는데, 바로 아래 AI 반찬 추천 달력의 오늘 날짜 상세에도 똑같은 끼니 탭이
  // 있어서 한 화면에 거의 같은 선택 UI가 두 번 겹쳐 보였다(피드백). 이 카드의 버튼은 없애고,
  // 달력 쪽 탭(banchan-recommendation-calendar.tsx)이 대신 이 상태를 갱신하도록 바꿨다 —
  // onSelectedMealChange로 아래에서 연결. 초기값은 지금 시간대 기준으로만 계산해두고, 달력
  // 컴포넌트가 마운트되면 곧바로 같은 값(또는 사용자가 이미 골라둔 값)으로 다시 맞춰준다.
  const [mealType, setMealType] = useState<BackendMealType>(
    MEAL_SLOT_TO_BACKEND_MEAL_TYPE[getCurrentMealSlot()]
  );
  // 달력에서 지금 보고 있는 날짜 — 처음엔 이 카드가 항상 "오늘"만 봤는데, 달력에서 다른
  // 날짜로 넘기거나 그 날짜의 끼니를 눌러도 이 카드가 계속 오늘 것만 보여줘서 안 바뀌는
  // 것처럼 보였다(2026-08-21 피드백). 이제 달력이 알려주는 날짜를 그대로 따라간다.
  const [selectedDate, setSelectedDate] = useState<string>(todayDateString());
  // 달력이 지금 보여주고 있는 달의 데이터 — banchanRecommendation.monthly는 마운트 시점
  // 달에 고정돼 있어서, 달력에서 다른 달로 넘어가 실제 데이터가 있는 날짜를 봐도 아래
  // resolveTodayMenu가 그 달을 몰라 "아직 근거가 없어요"로 잘못 나오는 문제가 있었다
  // (2026-08-21 코드 리뷰 지적). 달력이 이미 월별로 캐시해 들고 있는 값을 그대로 받는다.
  const [monthlyForSelectedDate, setMonthlyForSelectedDate] = useState<MonthlyBanchanRecommendation | null>(
    banchanRecommendation.monthly
  );
  // 매 렌더마다 새 함수를 만들면 달력의 onSelectedMealChange 이펙트(의존성에 이 함수가
  // 들어있음)가 부모가 리렌더될 때마다(예: 아래 폴링 4초 간격) 불필요하게 다시 실행된다
  // (2026-08-21 코드 리뷰 지적) — useCallback으로 참조를 고정한다.
  const handleSelectedMealChange = useCallback(
    (date: string, mt: BackendMealType, monthlyForDate: MonthlyBanchanRecommendation | null) => {
      setSelectedDate(date);
      setMealType(mt);
      setMonthlyForSelectedDate(monthlyForDate);
    },
    []
  );

  // 오늘 이미 식전+식후 사진을 다 올린 끼니(diet-history의 completed) — 달력 쪽 오늘 날짜
  // 탭에 완료 배지로 표시한다(2026-08-21, 예전엔 이 화면 상단 버튼에 표시하던 것을 옮김).
  const [todayCompletedMealTypes, setTodayCompletedMealTypes] = useState<Set<BackendMealType>>(
    new Set()
  );

  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }, 1).then(
      (entries) => {
        if (cancelled || !entries) return;
        const today = todayDateString();
        const done = new Set<BackendMealType>();
        for (const entry of entries) {
          if (entry.mealDate !== today || !entry.completed) continue;
          done.add(entry.mealType as BackendMealType);
        }
        setTodayCompletedMealTypes(done);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward.id]);

  // "오늘의 O 추천 반찬 조합"/"왜 이 조합인가요" 카드가 오늘 실제 AI 추천이 있으면 그걸
  // 쓰고, 없으면 목업으로 자연스럽게 폴백한다 — 실제 추천이 생긴 뒤에도 이 카드들이 계속
  // 목업만 보여줘서 바로 아래 AI 반찬 추천 달력과 서로 다른 답을 보여주던 문제(2026-08-13
  // 피드백, "카드 내용이 안 맞는다")를 여기서 고친다. selectedDate가 오늘이 아니면(달력에서
  // 다른 날짜를 보는 중) 목업 폴백은 안 쓴다 — 목업은 애초에 "오늘"에 대한 것이라, 다른
  // 날짜에 그 오늘자 목업을 보여주면 더 헷갈린다. 그 날짜에 실제 데이터가 없으면 그냥
  // "아직 근거가 없어요"류 빈 상태를 보여준다(resolveTodayMenu가 real도 combo도 없을 때는
  // 안 만들어주므로, 여기서 combo 자리에 빈 값을 넣어 목업 폴백 자체를 막는다).
  const isToday = selectedDate === todayDateString();
  const todayMenu = resolveTodayMenu(
    isToday ? detail.recommendedCombo : EMPTY_DISH_COMBO,
    monthlyForSelectedDate,
    mealType,
    selectedDate
  );

  // 카드별 TTS(SpeakableCard)가 읽어줄 문장 — 화면에 보이는 값 그대로를 문장으로 풀어 쓴다.
  // isGenerating일 땐 totalSodiumMg 등이 전부 0/items가 빈 배열이라, 그대로 문장을 지으면
  // "나트륨 0mg..." 같은 잘못된 값이나 빈 목록 문장이 화면 문구와 다르게 읽힌다 — 시각 카드와
  // 똑같이 생성 중 안내로 맞춘다.
  const mealTypeLabel = BACKEND_MEAL_TYPE_LABEL[mealType];
  const dateLabel = isToday ? "오늘" : formatMonthDayLabel(selectedDate);
  const recommendedComboSpeech = todayMenu.isGenerating
    ? TODAY_MENU_GENERATING_MESSAGE
    : `${dateLabel} ${mealTypeLabel} 추천 반찬 조합이에요. 나트륨 ${todayMenu.totalSodiumMg}mg, ` +
      `단백질 ${todayMenu.totalProteinG}g, 열량 ${todayMenu.totalKcal}kcal입니다.`;
  const reasonsSpeech = todayMenu.isGenerating
    ? TODAY_MENU_GENERATING_MESSAGE
    : todayMenu.reasons.join(" ");
  const conditionsSpeech =
    `진단 질환은 ${detail.conditions.join(", ") || "없음"}입니다. ` +
    `알레르기는 ${detail.allergies[0] === "없음" ? "없음" : detail.allergies.join(", ")}입니다. ` +
    `복약은 ${detail.medications.map((m) => m.name).join(", ")}입니다.`;

  // isNewMember가 아직 null(최초 조회 중)이면 판단이 서기 전까지는 아무 카드도 안 보여준다 —
  // 여기서 바로 "기존 회원" 레이아웃을 그렸다가 조회 결과가 늦게 도착해 신규 회원으로
  // 밝혀지면 화면이 통째로 바뀌는 깜빡임이 생긴다.
  if (banchanRecommendation.isNewMember == null) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title="내 식단" subtitle="오늘의 배정 식단과 근거" />
        <div className="px-5">
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (banchanRecommendation.isNewMember) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title="내 식단" subtitle="AI 반찬 추천을 먼저 받아보세요" />
        <div className="flex flex-col gap-4 px-5">
          <p className="break-keep text-sm text-muted-foreground">
            아직 배정된 식단이 없어요. 아래에서 AI 반찬 추천을 먼저 받아보세요 — 받고 나면 이
            화면에 매일 식단과 잔반 분석, 식사 기록이 순서대로 나타나요.
          </p>
          <BanchanRecommendationSection
            identity={banchanIdentity}
            state={banchanRecommendation}
            subscribeHref="/user/subscription"
            surveyHref="/user/survey?returnTo=%2Fuser%2Fdiet&section=health"
            speakableId="diet-ai-recommendation"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="내 식단" subtitle="오늘의 배정 식단과 근거" />

      <div className="flex flex-col gap-4 px-5">
        <SpeakableCard
          id="diet-recommended-combo"
          text={recommendedComboSpeech}
          tone="sidebar"
          className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm"
        >
          <span className="text-xs font-bold tracking-wide text-sidebar-primary">
            AI 반찬 매칭
          </span>
          <span className="text-xl font-extrabold">{dateLabel} {mealTypeLabel} 추천 반찬 조합</span>
          {/* 끼니 선택 버튼은 여기 없다 — 바로 아래 AI 반찬 추천 달력의 날짜 상세에 있는 끼니
              탭이 이 제목/영양성분까지 같이 바꾼다(onSelectedMealChange, 2026-08-21) — 오늘이
              아닌 날짜를 보는 중이면 제목도 "오늘의"가 아니라 그 날짜로 바뀐다. */}
          {todayMenu.isGenerating ? (
            <p className="text-sm text-sidebar-foreground/80">{TODAY_MENU_GENERATING_MESSAGE}</p>
          ) : (
            <div className="flex gap-4 pt-1 text-xs">
              <div className="flex flex-col">
                <span className="text-sidebar-foreground/60">나트륨</span>
                <span className="font-semibold">{todayMenu.totalSodiumMg}mg</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sidebar-foreground/60">단백질</span>
                <span className="font-semibold">{todayMenu.totalProteinG}g</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sidebar-foreground/60">열량</span>
                <span className="font-semibold">{todayMenu.totalKcal}kcal</span>
              </div>
            </div>
          )}
        </SpeakableCard>

        <BanchanRecommendationSection
          identity={banchanIdentity}
          state={banchanRecommendation}
          subscribeHref="/user/subscription"
          surveyHref="/user/survey?returnTo=%2Fuser%2Fdiet&section=health"
          onSelectedMealChange={handleSelectedMealChange}
          todayCompletedMealTypes={[...todayCompletedMealTypes]}
          speakableId="diet-ai-recommendation"
        />

        {/* "오늘 메뉴 구성" 카드는 뺐다 — 홈 화면의 "오늘의 추천 반찬 조합"과 내용이 완전히
            겹쳤다(2026-08-14 피드백). 반찬 목록 자체는 바로 위 AI 반찬 추천 달력(오늘 날짜
            칸)에서도 이미 보여주고 있어서, 이 화면에서 또 한 번 나열할 이유가 없다. */}

        <SpeakableCard
          id="diet-reasons"
          text={reasonsSpeech}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <span className="text-xs font-bold text-foreground">왜 이 조합인가요</span>
          <ExpandToggle
            expanded={reasonsExpanded}
            onToggle={() => setReasonsExpanded((v) => !v)}
            stopPropagation
          />
          {reasonsExpanded &&
            (todayMenu.isGenerating ? (
              <p className="text-sm text-muted-foreground">{TODAY_MENU_GENERATING_MESSAGE}</p>
            ) : todayMenu.reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 근거가 없어요.</p>
            ) : (
              todayMenu.reasons.map((reason, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-foreground"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {i + 1}
                  </span>
                  {reason}
                </div>
              ))
            ))}
        </SpeakableCard>

        <SpeakableCard
          id="diet-conditions"
          text={conditionsSpeech}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <span className="text-xs font-bold text-foreground">질환 · 알레르기 · 복약</span>
          <ExpandToggle
            expanded={conditionsExpanded}
            onToggle={() => setConditionsExpanded((v) => !v)}
            stopPropagation
          />
          {conditionsExpanded && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">진단 질환</span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.conditions.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">알레르기 · 금기</span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.allergies[0] === "없음" ? (
                    <span className="text-sm text-muted-foreground">없음</span>
                  ) : (
                    detail.allergies.map((a) => (
                      <Badge key={a} className="bg-risk-high text-risk-high-foreground">
                        {a}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground">복약</span>
                {detail.medications.map((m) => (
                  <div key={m.name} className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">{m.name}</span>
                      <span className="text-muted-foreground">{m.schedule}</span>
                    </div>
                    {m.products.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {m.products.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  저작 · 연하 상태
                </span>
                <p className="text-sm text-foreground">{detail.chewingNote}</p>
              </div>
            </>
          )}
        </SpeakableCard>

        <Button
          size="lg"
          className="h-14 w-full text-base"
          nativeButton={false}
          render={<Link href="/user/assistant" />}
        >
          <Stethoscope className="h-5 w-5" />
          AI 도우미와 채팅 상담하기
        </Button>
      </div>
    </div>
  );
}
