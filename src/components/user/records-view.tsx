"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pill } from "lucide-react";

import { MealTone, Ward, WardDetail } from "@/lib/wards";
import {
  DailyLeftover,
  deriveDailyLeftover,
  dietHistoryForDate,
  DietHistoryEntry,
  fetchElderDietHistory,
  recentDateKeys,
} from "@/lib/meal-dashboard";
import { computeTodayNutritionSnapshot, getRecommendationForDate, todayDateString } from "@/lib/banchan-recommendation";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { fetchRecipeRecommendations, type RecipeRecommendationItem } from "@/lib/recipe-recommendations";
import { TopBar } from "@/components/app/top-bar";
import { LeftoverDayGrid, LeftoverLegend } from "@/components/app/leftover-day-grid";
import { DietDayDetail } from "@/components/app/diet-day-detail";
import { RecipeRecommendationList } from "@/components/app/recipe-recommendation-list";
import { NutrientMeter } from "@/components/app/nutrient-meter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  medicationReminderStore,
  setMedicationReminder,
} from "@/lib/medication-reminder-store";
import { useLocalStore } from "@/lib/use-store";

const RECENT_DAYS = 14;

// detail.mealHistory(seedFromId 기반 목업, ward-registry.ts MealTone)는 여전히 완식/소량/
// 미응답 3단계다 — 실제 백엔드 기록이 아직 없을 때만 쓰는 대체값이라 그 목업 생성 자체를
// 새로 만들지 않고, 표시 직전에 근사 잔반율로 한 번 변환해서 쓴다(완식≈5%, 소량≈55%,
// 미응답=기록 없음).
function mockMealHistoryToDailyLeftover(mealHistory: MealTone[], dateKeys: string[]): DailyLeftover[] {
  return mealHistory.map((tone, i) => ({
    date: dateKeys[i],
    avgLeftoverPercent: tone === "미응답" ? null : tone === "소량" ? 55 : 5,
  }));
}

export function RecordsView({
  ward,
  detail,
}: {
  ward: Ward;
  detail: WardDetail;
}) {
  // 실제 백엔드 식단 이력(GET /app/elder/{id}/diet-history)이 있으면 목업 대신 그걸 보여준다 —
  // 여긴 어르신 본인 화면이라 elder-app 엔드포인트(보호자/본인 JWT 둘 다 됨)를 쓴다. 실패하면
  // (아직 실제 기록 없음 등) 조용히 기존 목업 그리드를 그대로 쓴다.
  //
  // 예전엔 이 응답(items, 끼니별 dishes까지 담고 있음)을 deriveMealTones로 하루 톤 하나로
  // 뭉뚱그린 뒤 원본을 버렸다 — 그리드 칸이 완식/소량/미응답 색만 보여줄 뿐 탭해도 아무 반응이
  // 없었다. 날짜 칸을 탭하면 그날 상세(끼니별 반찬·잔반율)를 보여달라는 요청(2026-08-19)을
  // 받아 원본 items도 rawDietHistory에 같이 남겨둔다.
  const [backendDailyLeftover, setBackendDailyLeftover] = useState<DailyLeftover[] | null>(null);
  const [rawDietHistory, setRawDietHistory] = useState<DietHistoryEntry[] | null>(null);
  // recentDateKeys(RECENT_DAYS)를 렌더마다 새로 부르면 "지금" 기준으로 매번 다시 계산되는데,
  // backendDailyLeftover/rawDietHistory는 아래 useEffect가 도는 시점(대상자 정보가 바뀔 때)에만
  // 갱신된다 — 자정을 넘겨 화면을 켜둔 채로 있으면 날짜 배열만 하루 밀려서 실제 데이터가
  // 가리키는 날짜와 어긋난다(코드 리뷰 지적: 그리드 칸 색상·라벨이 서로 다른 날을 가리키게
  // 됨). 아래 useEffect와 정확히 같은 의존성 배열로 묶어서, 데이터가 갱신될 때만 날짜 배열도
  // 같이 갱신되게 한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ward.*는 계산에 쓰이는 값이 아니라, 아래 fetch useEffect와 같은 시점에만 재계산되도록 하는 동기화 키로 일부러 넣음
  const dateKeys = useMemo(() => recentDateKeys(RECENT_DAYS), [ward.id, ward.name, ward.age, ward.address]);
  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory(
      { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
      RECENT_DAYS
    ).then((items) => {
      if (cancelled || !items) return;
      setBackendDailyLeftover(deriveDailyLeftover(items, dateKeys));
      setRawDietHistory(items);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateKeys는 위 useMemo가 같은 deps로 이미 동기화해둔 값이라 별도 트리거로 넣지 않는다
  }, [ward.id, ward.name, ward.age, ward.address]);
  const dailyLeftover = backendDailyLeftover ?? mockMealHistoryToDailyLeftover(detail.mealHistory, dateKeys);
  // 기본으로 "오늘"(그리드 맨 끝 칸)을 펼쳐 보여준다 — 진입하자마자 가장 궁금할 날짜를
  // 바로 보여준다.
  const [selectedDate, setSelectedDate] = useState<string | null>(() => dateKeys[dateKeys.length - 1] ?? null);
  // dateKeys는 렌더마다 "오늘" 기준으로 새로 계산되지만 selectedDate는 sticky한 state라,
  // 자정을 넘겨 화면을 켜둔 채 리렌더가 한 번이라도 일어나면 예전에 고른 날짜가 새 14일
  // 창 밖으로 밀려날 수 있다(코드 리뷰 지적) — 그럴 땐 그 칸이 사라진 것처럼 상세가 조용히
  // 안 보이는 대신, 다시 "오늘"(맨 끝 칸)을 고른 것으로 취급한다.
  const effectiveSelectedDate =
    selectedDate && dateKeys.includes(selectedDate) ? selectedDate : (dateKeys[dateKeys.length - 1] ?? null);
  // 같은 날짜를 다시 누르면 접는다(2026-08-21 피드백: "아침점심저녁 펼쳐지는 게 어수선해서
  // 다시 터치하면 접히면 좋겠다"). selectedDate 자체를 null로 만들면 위 fallback 때문에
  // "오늘"이 다시 펼쳐져버려서, 펼침 여부는 별도 state로 관리한다.
  const [isDetailOpen, setIsDetailOpen] = useState(true);
  function handleSelectDate(date: string) {
    if (date === effectiveSelectedDate && isDetailOpen) {
      setIsDetailOpen(false);
    } else {
      setSelectedDate(date);
      setIsDetailOpen(true);
    }
  }
  const selectedDayEntries =
    effectiveSelectedDate && rawDietHistory ? dietHistoryForDate(rawDietHistory, effectiveSelectedDate) : [];
  const selectedDayLeftover = effectiveSelectedDate
    ? (dailyLeftover.find((d) => d.date === effectiveSelectedDate)?.avgLeftoverPercent ?? null)
    : null;

  const reminderEnabled = useLocalStore(medicationReminderStore)[ward.id] ?? false;
  const hasRealMeds = detail.medications[0]?.name !== "특이 복약 없음";

  // 오늘 영양성분 분석 — "정확히 얼마나 드셨는지" 실측 데이터는 없어서(사진 기반 잔반 분석은
  // 완식/소량/미응답 판정만 함), 대신 오늘 AI가 실제로 배정한 반찬들의 영양가 합(100g당 값
  // 기준)과 그 사람의 하루 목표 영양치(BMR/TDEE 기반)를 비교해서 보여준다 — "정확히 이만큼
  // 먹었다"가 아니라 "오늘 배정된 반찬 구성이 목표치에 얼마나 맞는지"를 보여주는 것.
  const banchanIdentity = { wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address };
  const banchanRecommendation = useMonthlyBanchanRecommendation(banchanIdentity);
  // "생성 중" 안내 문구에만 필요한 상태값이라 이것만 따로 뽑는다 — 실제 영양가 합/목표치는
  // todayNutrition(아래)이 통째로 들고 있다.
  const todayGenerationStatus = getRecommendationForDate(banchanRecommendation.monthly, todayDateString())?.status;
  const todayNutrition = computeTodayNutritionSnapshot(banchanRecommendation.monthly);

  // 레시피 추천 — 이제 백엔드가 오늘 배정 반찬 + 개인 목표치로 직접 결핍을 계산해서
  // 근거로 삼는다(recipe-recommendations.ts 상단 주석 참고). 예전엔 여기서
  // deriveHealthInsight로 결핍을 먼저 계산해 그 결과를 넘겼는데, 이제 그 판단 자체가
  // 백엔드 몫이라 더 필요 없다.
  const [recipes, setRecipes] = useState<RecipeRecommendationItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRecipeRecommendations({
      mockWardId: ward.id,
      name: ward.name,
      age: ward.age,
      address: ward.address,
    }).then((result) => {
      if (!cancelled) setRecipes(result?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="건강 기록" subtitle="섭취 · 검진 · 복약" />

      <div className="flex flex-col gap-4 px-5">
        {hasRealMeds && (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Pill className="h-3.5 w-3.5 text-accent" />
                복약 알림
              </span>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={(checked) => setMedicationReminder(ward.id, checked)}
              />
            </div>
            <div className="flex flex-col gap-1">
              {detail.medications.map((m) => (
                <div key={m.name} className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{m.name}</span>
                    <span className="text-muted-foreground">{m.schedule}</span>
                  </div>
                  {m.products.length > 0 && (
                    <span className="text-xs text-muted-foreground">{m.products.join(", ")}</span>
                  )}
                </div>
              ))}
            </div>
            {reminderEnabled && (
              <p className="text-xs text-muted-foreground">
                복용 시간에 맞춰 알림을 보내드릴게요.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {/* 완식/소량이라는 임의 경계 대신 실제 평균 잔반율 숫자로 보여준다(2026-08-21
              피드백) — 칸은 색+날짜 숫자만, 정확한 값은 탭했을 때 아래 상세에서 크게
              보여준다(칸에 둘 다 넣으면 날짜 숫자와 헷갈린다는 피드백을 반영). 범례는
              제목과 한 줄에 두어야 가시성이 좋다는 피드백에 따라 같은 행에 둔다. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h2 className="text-sm font-bold text-foreground">최근 14일 섭취 기록</h2>
            <LeftoverLegend />
          </div>
          <LeftoverDayGrid
            dailyLeftover={dailyLeftover}
            selectedDate={isDetailOpen ? effectiveSelectedDate : null}
            onSelectDate={handleSelectDate}
          />

          {effectiveSelectedDate && isDetailOpen && (
            <DietDayDetail
              date={effectiveSelectedDate}
              leftoverPercent={selectedDayLeftover}
              entries={rawDietHistory === null ? null : selectedDayEntries}
            />
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">오늘 영양성분 분석</h2>
          {!todayNutrition.hasData ? (
            <>
              <p className="text-sm text-muted-foreground">
                {todayGenerationStatus === "generating"
                  ? "오늘 반찬을 고르고 있어요. 완료되면 분석을 볼 수 있어요."
                  : "AI 반찬 추천을 받으면 오늘의 영양성분 분석을 볼 수 있어요."}
              </p>
              {todayGenerationStatus !== "generating" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  nativeButton={false}
                  render={<Link href="/user/diet" />}
                >
                  AI 반찬 추천 받으러 가기
                </Button>
              )}
            </>
          ) : todayNutrition.targetCalorieKcal == null ? (
            <>
              <p className="text-sm text-muted-foreground">
                목표 영양치를 계산하려면 건강 프로필에 키 · 체중 · 활동 수준이 필요해요.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                nativeButton={false}
                render={<Link href="/user/profile" />}
              >
                건강 프로필 입력하러 가기
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <NutrientMeter
                label="칼로리"
                value={todayNutrition.kcal}
                target={todayNutrition.targetCalorieKcal}
                unit="kcal"
              />
              {todayNutrition.targetProteinG != null && (
                <NutrientMeter
                  label="단백질"
                  value={todayNutrition.proteinG}
                  target={todayNutrition.targetProteinG}
                  unit="g"
                />
              )}
              {todayNutrition.targetSodiumMg != null && (
                <NutrientMeter
                  label="나트륨"
                  value={todayNutrition.sodiumMg}
                  target={todayNutrition.targetSodiumMg}
                  unit="mg"
                />
              )}
              {todayNutrition.targetCarbsG != null && (
                <NutrientMeter
                  label="탄수화물"
                  value={todayNutrition.carbsG}
                  target={todayNutrition.targetCarbsG}
                  unit="g"
                />
              )}
              <p className="text-xs text-muted-foreground">
                오늘 AI가 배정한 반찬의 100g당 영양가 합산 기준이에요.
              </p>
            </div>
          )}
        </div>

        {todayNutrition.hasData && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xs font-bold text-foreground">레시피 추천</span>
            <RecipeRecommendationList recipes={recipes} />
          </div>
        )}

        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-5">
          <span className="text-xs font-semibold text-muted-foreground">다음 배송 예정</span>
          <span className="text-sm font-semibold text-foreground">{detail.nextDeliveryDate}</span>
        </div>
      </div>
    </div>
  );
}
