"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import { BackendMealType, todayDateString } from "@/lib/banchan-recommendation";
import { getCurrentMealSlot, mealTypeToSlot, MealSlot } from "@/lib/meal-log-store";
import { fetchElderDietHistory } from "@/lib/meal-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { BanchanRecommendationSection } from "@/components/app/banchan-recommendation-section";
import { ButtonSelectGroup } from "@/components/app/button-select-group";
import { ExpandToggle } from "@/components/app/expand-toggle";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";

const MEAL_SLOT_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: "아침", label: "아침" },
  { value: "점심", label: "점심" },
  { value: "저녁", label: "저녁" },
];

// meal-log-store.ts의 MealSlot("아침"/"점심"/"저녁")을 백엔드 meal_type("breakfast"/
// "lunch"/"dinner")으로 — diet-day-detail.tsx의 MEAL_TYPE_LABEL과 반대 방향 매핑.
const MEAL_SLOT_TO_BACKEND_MEAL_TYPE: Record<MealSlot, BackendMealType> = {
  아침: "breakfast",
  점심: "lunch",
  저녁: "dinner",
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
  // 끼니 선택 탭(2026-08-19 도입) — 스탠다드 플랜이 아침·점심·저녁을 각각 배송하게 되면서
  // 생겼다. 처음엔 제목만 끼니에 맞춰 바뀌고 그 아래 반찬 목록은 하루 전체를 그대로
  // 보여주는 "UI 스텁"이었는데(백엔드가 B2C 항목에 meal_type을 안 채워줬음), 백엔드가
  // B2C 매일 배송도 시설 대상자처럼 service_date+meal_type을 채우도록 바뀌면서
  // (grandfood_backend BanchanDeliveryScheduler.schedule_daily_deliveries) 실제로
  // 골라 보이게 됐다 — MEAL_SLOT_TO_BACKEND_MEAL_TYPE으로 변환해 resolveTodayMenu에 넘긴다.
  const [mealSlot, setMealSlot] = useState<MealSlot>(getCurrentMealSlot());

  // 오늘 이미 식전+식후 사진을 다 올린 끼니(diet-history의 completed)는 회색으로 "이미
  // 기록했어요"만 표시한다.
  const [completedMealSlots, setCompletedMealSlots] = useState<Set<MealSlot>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }, 1).then(
      (entries) => {
        if (cancelled || !entries) return;
        const today = todayDateString();
        const done = new Set<MealSlot>();
        for (const entry of entries) {
          if (entry.mealDate !== today || !entry.completed) continue;
          const slot = mealTypeToSlot(entry.mealType);
          if (slot) done.add(slot);
        }
        setCompletedMealSlots(done);
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
  // 피드백, "카드 내용이 안 맞는다")를 여기서 고친다.
  const todayMenu = resolveTodayMenu(
    detail.recommendedCombo,
    banchanRecommendation.monthly,
    MEAL_SLOT_TO_BACKEND_MEAL_TYPE[mealSlot]
  );

  // 카드별 TTS(SpeakableCard)가 읽어줄 문장 — 화면에 보이는 값 그대로를 문장으로 풀어 쓴다.
  // isGenerating일 땐 totalSodiumMg 등이 전부 0/items가 빈 배열이라, 그대로 문장을 지으면
  // "나트륨 0mg..." 같은 잘못된 값이나 빈 목록 문장이 화면 문구와 다르게 읽힌다 — 시각 카드와
  // 똑같이 생성 중 안내로 맞춘다.
  const recommendedComboSpeech = todayMenu.isGenerating
    ? TODAY_MENU_GENERATING_MESSAGE
    : `오늘의 ${mealSlot} 추천 반찬 조합이에요. 나트륨 ${todayMenu.totalSodiumMg}mg, ` +
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
          <p className="text-sm text-muted-foreground">
            아직 배정된 식단이 없어요. 아래에서 AI 반찬 추천을 먼저 받아보세요 — 받고 나면 이
            화면에 매일 식단과 잔반 분석, 식사 기록이 순서대로 나타나요.
          </p>
          <BanchanRecommendationSection identity={banchanIdentity} state={banchanRecommendation} subscribeHref="/user/subscription" surveyHref="/user/survey?returnTo=%2Fuser%2Fdiet" />
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
          <span className="text-xl font-extrabold">오늘의 {mealSlot} 추천 반찬 조합</span>
          {/* 카드 전체가 SpeakableCard의 탭 영역(눌러서 읽어주기)이라, 끼니 버튼 클릭이
              그대로 버블링되면 끼니 선택과 동시에 음성 읽기가 토글된다 — stopPropagation으로
              막는다(home-view.tsx의 사진 업로드 라벨과 같은 이유). wrapper의 text-foreground는
              선택 안 된 버튼(outline 변형, bg-background 밝은 배경)이 이 카드의 어두운
              sidebar-foreground 글자색을 상속해 안 보이는 걸 막는다 — 다른 곳의 outline
              버튼과 같은 배경/글자 조합으로 되돌린다. 라벨("끼니 선택")은 반대로 이 카드
              배경(어두움) 위에 있어야 해서, 이 카드의 다른 옅은 라벨(나트륨/단백질/열량)과
              같은 색을 labelClassName으로 따로 지정한다. */}
          <div className="text-foreground" onClick={(e) => e.stopPropagation()}>
            <ButtonSelectGroup
              label="끼니 선택"
              labelClassName="text-sidebar-foreground/60"
              options={MEAL_SLOT_OPTIONS}
              value={mealSlot}
              onChange={setMealSlot}
              columns={3}
              completedValues={[...completedMealSlots]}
            />
          </div>
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

        <BanchanRecommendationSection identity={banchanIdentity} state={banchanRecommendation} subscribeHref="/user/subscription" surveyHref="/user/survey?returnTo=%2Fuser%2Fdiet" />

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
                  <div key={m.name} className="flex justify-between text-sm">
                    <span className="text-foreground">{m.name}</span>
                    <span className="text-muted-foreground">{m.schedule}</span>
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
