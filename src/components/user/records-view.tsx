"use client";

import { useEffect, useState } from "react";
import { Pill } from "lucide-react";

import { MealTone, Ward, WardDetail } from "@/lib/wards";
import { ACTIVITY_LEVEL_LABEL } from "@/lib/health-profile";
import { deriveMealTones, fetchElderDietHistory } from "@/lib/meal-dashboard";
import { TopBar } from "@/components/app/top-bar";
import { MealToneSummary } from "@/components/app/meal-tone-summary";
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{children}</span>
    </div>
  );
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
  const mealHistory = backendMealTones ?? detail.mealHistory;

  const completeCount = mealHistory.filter((m) => m === "완식").length;
  const smallCount = mealHistory.filter((m) => m === "소량").length;
  const noResponseCount = mealHistory.filter((m) => m === "미응답").length;
  const reminderEnabled = useLocalStore(medicationReminderStore)[ward.id] ?? false;
  const hasRealMeds = detail.medications[0]?.name !== "특이 복약 없음";

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

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between pb-1">
            <h2 className="text-sm font-bold text-foreground">건강 프로필</h2>
            <span className="text-xs text-muted-foreground">
              {detail.healthProfile.source === "mydata_linked" ? "마이데이터 연동" : "자가 입력"}
            </span>
          </div>
          <DetailRow label="혈압 위쪽 숫자 (수축기)">
            {detail.healthProfile.systolicBP != null
              ? `${detail.healthProfile.systolicBP} mmHg`
              : "미입력"}
          </DetailRow>
          <DetailRow label="혈압 아래쪽 숫자 (이완기)">
            {detail.healthProfile.diastolicBP != null
              ? `${detail.healthProfile.diastolicBP} mmHg`
              : "미입력"}
          </DetailRow>
          <DetailRow label="공복혈당">
            {detail.healthProfile.fastingGlucose != null
              ? `${detail.healthProfile.fastingGlucose} mg/dL`
              : "미입력"}
          </DetailRow>
          <DetailRow label="키">
            {detail.healthProfile.heightCm != null ? `${detail.healthProfile.heightCm} cm` : "미입력"}
          </DetailRow>
          <DetailRow label="체중">
            {detail.healthProfile.weightKg != null ? `${detail.healthProfile.weightKg} kg` : "미입력"}
          </DetailRow>
          <DetailRow label="활동 수준">
            {detail.healthProfile.activityLevel
              ? ACTIVITY_LEVEL_LABEL[detail.healthProfile.activityLevel]
              : "미입력"}
          </DetailRow>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-5">
          <span className="text-xs font-semibold text-muted-foreground">다음 배송 예정</span>
          <span className="text-sm font-semibold text-foreground">{detail.nextDeliveryDate}</span>
        </div>
      </div>
    </div>
  );
}
