"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pill } from "lucide-react";

import { MealTone, Ward, WardDetail } from "@/lib/wards";
import {
  deriveMealTones,
  dietHistoryForDate,
  DietHistoryEntry,
  fetchElderDietHistory,
  recentDateKeys,
} from "@/lib/meal-dashboard";
import { formatMonthDayLabel } from "@/lib/date-format";
import { computeTodayNutritionSnapshot, getRecommendationForDate, todayDateString } from "@/lib/banchan-recommendation";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { deriveHealthInsight } from "@/lib/health-insights";
import { getRecipeRecommendations, type RecipeRecommendation } from "@/lib/recipe-recommendations";
import { TopBar } from "@/components/app/top-bar";
import { MealToneSummary } from "@/components/app/meal-tone-summary";
import { NutrientMeter } from "@/components/app/nutrient-meter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  medicationReminderStore,
  setMedicationReminder,
} from "@/lib/medication-reminder-store";
import { useLocalStore } from "@/lib/use-store";

const MEAL_TONE_CLASS: Record<string, string> = {
  완식: "bg-foreground",
  소량: "bg-risk-caution-foreground",
  미응답: "bg-risk-high-foreground",
};

// diet-history의 meal_type은 백엔드가 영어로 내려준다(grandfood_backend
// src/domains/health/schemas.py — "breakfast"/"lunch"/"dinner"). meal-log-store.ts의
// MealSlot("아침"/"점심"/"저녁")과 같은 개념이라 표시용으로만 매핑한다.
const MEAL_TYPE_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner"];

const RECENT_DAYS = 14;

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
  const [backendMealTones, setBackendMealTones] = useState<MealTone[] | null>(null);
  const [rawDietHistory, setRawDietHistory] = useState<DietHistoryEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory(
      { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
      RECENT_DAYS
    ).then((items) => {
      if (cancelled || !items) return;
      setBackendMealTones(deriveMealTones(items, RECENT_DAYS));
      setRawDietHistory(items);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);
  const mealHistory = backendMealTones ?? detail.mealHistory;
  // deriveMealTones가 만드는 톤 배열과 정확히 같은 순서(과거→오늘)로 날짜를 매겨, 그리드
  // 칸 인덱스 i를 탭했을 때 그 칸이 어느 날짜인지 알 수 있게 한다.
  const dateKeys = recentDateKeys(RECENT_DAYS);
  // 기본으로 "오늘"(그리드 맨 끝 칸)을 펼쳐 보여준다 — 진입하자마자 가장 궁금할 날짜를
  // 바로 보여준다.
  const [selectedDate, setSelectedDate] = useState<string | null>(() => dateKeys[dateKeys.length - 1] ?? null);
  const selectedDayEntries = selectedDate && rawDietHistory ? dietHistoryForDate(rawDietHistory, selectedDate) : [];
  const selectedDayTone = selectedDate ? mealHistory[dateKeys.indexOf(selectedDate)] : undefined;

  const completeCount = mealHistory.filter((m) => m === "완식").length;
  const smallCount = mealHistory.filter((m) => m === "소량").length;
  const noResponseCount = mealHistory.filter((m) => m === "미응답").length;
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

  // 레시피 추천 — 오늘 영양성분 분석과 같은 목표치 기준으로 결핍을 판단한다(guardian/
  // report-view.tsx와 공유하는 health-insights.ts). 이 화면은 잔반과 무관하게 건강정보만
  // 보고 추천해야 해서(2026-08-18 요청) recentMealLogs를 빈 배열로 넘긴다 — 그러면
  // frequentLeftoverIngredients도 자연히 빈 배열이 되어 잔반 기반 우선순위가 안 걸린다.
  const recipeInsight = deriveHealthInsight(ward, todayNutrition, []);
  const [recipes, setRecipes] = useState<RecipeRecommendation[] | null>(null);
  const deficiencyKey = recipeInsight.deficiencies.join(",");
  useEffect(() => {
    let cancelled = false;
    getRecipeRecommendations(recipeInsight).then((result) => {
      if (!cancelled) setRecipes(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deficiencyKey만 파생 의존성으로 사용
  }, [ward.id, deficiencyKey]);

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
                <div key={m.name} className="flex justify-between text-sm">
                  <span className="text-foreground">{m.name}</span>
                  <span className="text-muted-foreground">{m.schedule}</span>
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
          <h2 className="text-sm font-bold text-foreground">최근 14일 섭취 기록</h2>
          <MealToneSummary
            completeCount={completeCount}
            smallCount={smallCount}
            noResponseCount={noResponseCount}
          />
          {/* 칸이 title 툴팁(마우스 오버)만으로 하루 상태를 알려줘서 터치 기기에선 사실상
              정보가 안 보였다 — 칸을 탭하면 그날 상세(끼니별 반찬·잔반율)를 아래에 펼쳐
              보여주도록 바꿨다(2026-08-19 피드백). */}
          <div className="grid grid-cols-7 gap-1.5">
            {mealHistory.map((tone, i) => {
              const date = dateKeys[i];
              const isSelected = date === selectedDate;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${formatMonthDayLabel(date)} ${tone}`}
                  onClick={() => setSelectedDate(date)}
                  className={`h-8 rounded-sm ${MEAL_TONE_CLASS[tone]} ${
                    isSelected ? "ring-2 ring-inset ring-foreground" : ""
                  }`}
                />
              );
            })}
          </div>

          {selectedDate && selectedDayTone && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{formatMonthDayLabel(selectedDate)}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${MEAL_TONE_CLASS[selectedDayTone]}`} />
                  {selectedDayTone}
                </span>
              </div>
              {rawDietHistory === null ? (
                <p className="text-sm text-muted-foreground">이 날의 상세 기록은 지금 확인할 수 없어요.</p>
              ) : selectedDayEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">이 날은 남겨진 끼니 기록이 없어요.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...selectedDayEntries]
                    .sort((a, b) => MEAL_TYPE_ORDER.indexOf(a.mealType) - MEAL_TYPE_ORDER.indexOf(b.mealType))
                    .map((entry) => (
                      <div key={entry.mealId} className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">
                            {MEAL_TYPE_LABEL[entry.mealType] ?? entry.mealType}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.completed
                              ? "사진 분석 완료"
                              : entry.quickCheckStatus
                                ? `자가 체크 · ${entry.quickCheckStatus}`
                                : "기록 없음"}
                          </span>
                        </div>
                        {entry.dishes.length > 0 && (
                          <div className="flex flex-col gap-0.5">
                            {entry.dishes.map((dish, di) => (
                              <div key={di} className="flex justify-between text-sm">
                                <span className="text-foreground">{dish.banchanName ?? "반찬"}</span>
                                <span className="text-muted-foreground">{Math.round(dish.leftoverPct)}% 남음</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
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

        {todayNutrition.hasData && !recipeInsight.deficiencies.includes("정상") && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xs font-bold text-foreground">레시피 추천</span>
            {recipes === null ? (
              <p className="text-sm text-muted-foreground">추천을 불러오는 중이에요...</p>
            ) : recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">지금은 특별히 추천할 레시피가 없어요.</p>
            ) : (
              recipes.map((r) => (
                <a
                  key={r.id}
                  href={r.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <span>
                    {r.thumbnailEmoji} {r.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.targetNutrient}</span>
                </a>
              ))
            )}
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
