"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pill } from "lucide-react";

import { MealTone, Ward, WardDetail } from "@/lib/wards";
import { deriveMealTones, fetchElderDietHistory } from "@/lib/meal-dashboard";
import { getRecommendationForDate, todayDateString } from "@/lib/banchan-recommendation";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { TopBar } from "@/components/app/top-bar";
import { MealToneSummary } from "@/components/app/meal-tone-summary";
import { NutrientMeter } from "@/components/app/nutrient-meter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  medicationReminderStore,
  setMedicationReminder,
} from "@/lib/medication-reminder-store";
import { getTodayQuickMealCheck, mergeTodayQuickCheck, quickMealCheckStore } from "@/lib/meal-log-store";
import { useLocalStore } from "@/lib/use-store";

const MEAL_TONE_CLASS: Record<string, string> = {
  완식: "bg-foreground",
  소량: "bg-risk-caution-foreground",
  미응답: "bg-risk-high-foreground",
};

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
  const [backendMealTones, setBackendMealTones] = useState<MealTone[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory(
      { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
      14
    ).then((items) => {
      if (cancelled || !items) return;
      setBackendMealTones(deriveMealTones(items, 14));
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);
  // 오늘 칸이 사진 기반 정밀 기록 없이 "미응답"이면, 홈 화면에서 원탭으로 남긴 자가 보고를
  // 최소한의 근사 기록으로 대신 보여준다(meal-log-store.ts의 mergeTodayQuickCheck 참고).
  const todayQuickCheck = getTodayQuickMealCheck(useLocalStore(quickMealCheckStore), ward.id);
  const mealHistory = mergeTodayQuickCheck(backendMealTones ?? detail.mealHistory, todayQuickCheck);

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
  const todayRecommendation = getRecommendationForDate(banchanRecommendation.monthly, todayDateString());
  const todayItems = todayRecommendation?.items ?? [];
  const hasTodayNutritionData = todayRecommendation?.status === "done" && todayItems.length > 0;
  const todayKcal = todayItems.reduce((sum, i) => sum + (i.caloriePer100g ?? 0), 0);
  const todayProteinG = todayItems.reduce((sum, i) => sum + (i.proteinPer100g ?? 0), 0);
  const todaySodiumMg = todayItems.reduce((sum, i) => sum + (i.sodiumPer100g ?? 0), 0);
  const todayCarbsG = todayItems.reduce((sum, i) => sum + (i.carbsPer100g ?? 0), 0);

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
          <div className="grid grid-cols-7 gap-1.5">
            {mealHistory.map((tone, i) => (
              <div
                key={i}
                className={`h-8 rounded-sm ${MEAL_TONE_CLASS[tone]}`}
                title={tone}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">오늘 영양성분 분석</h2>
          {!hasTodayNutritionData ? (
            <>
              <p className="text-sm text-muted-foreground">
                {todayRecommendation?.status === "generating"
                  ? "오늘 반찬을 고르고 있어요. 완료되면 분석을 볼 수 있어요."
                  : "AI 반찬 추천을 받으면 오늘의 영양성분 분석을 볼 수 있어요."}
              </p>
              {todayRecommendation?.status !== "generating" && (
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
          ) : todayRecommendation.targetCalorieKcal == null ? (
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
                value={todayKcal}
                target={todayRecommendation.targetCalorieKcal}
                unit="kcal"
              />
              {todayRecommendation.targetProteinG != null && (
                <NutrientMeter
                  label="단백질"
                  value={todayProteinG}
                  target={todayRecommendation.targetProteinG}
                  unit="g"
                />
              )}
              {todayRecommendation.targetSodiumMg != null && (
                <NutrientMeter
                  label="나트륨"
                  value={todaySodiumMg}
                  target={todayRecommendation.targetSodiumMg}
                  unit="mg"
                />
              )}
              {todayRecommendation.targetCarbsG != null && (
                <NutrientMeter
                  label="탄수화물"
                  value={todayCarbsG}
                  target={todayRecommendation.targetCarbsG}
                  unit="g"
                />
              )}
              <p className="text-xs text-muted-foreground">
                오늘 AI가 배정한 반찬의 100g당 영양가 합산 기준이에요.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-5">
          <span className="text-xs font-semibold text-muted-foreground">다음 배송 예정</span>
          <span className="text-sm font-semibold text-foreground">{detail.nextDeliveryDate}</span>
        </div>
      </div>
    </div>
  );
}
