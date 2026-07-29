"use client";

import { Pill } from "lucide-react";

import { WardDetail } from "@/lib/wards";
import { TopBar } from "@/components/app/top-bar";
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
  wardId,
  detail,
}: {
  wardId: string;
  detail: WardDetail;
}) {
  const completeCount = detail.mealHistory.filter((m) => m === "완식").length;
  const smallCount = detail.mealHistory.filter((m) => m === "소량").length;
  const noResponseCount = detail.mealHistory.filter((m) => m === "미응답").length;
  const reminderEnabled = useLocalStore(medicationReminderStore)[wardId] ?? false;
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
                onCheckedChange={(checked) => setMedicationReminder(wardId, checked)}
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
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-foreground">최근 14일 섭취 기록</h2>
            <span className="text-xs text-muted-foreground">
              완식 <span className="font-semibold text-foreground">{completeCount}</span> ·
              소량{" "}
              <span className="font-semibold text-risk-caution-foreground">
                {smallCount}
              </span>{" "}
              · 미응답{" "}
              <span className="font-semibold text-risk-high-foreground">
                {noResponseCount}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {detail.mealHistory.map((tone, i) => (
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
          <DetailRow label="수축기 혈압">{detail.healthProfile.systolicBP} mmHg</DetailRow>
          <DetailRow label="공복혈당">{detail.healthProfile.fastingGlucose} mg/dL</DetailRow>
          <DetailRow label="당화혈색소">{detail.healthProfile.hba1c} %</DetailRow>
          <DetailRow label="체중">{detail.healthProfile.weightKg} kg</DetailRow>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-5">
          <span className="text-xs font-semibold text-muted-foreground">다음 배송 예정</span>
          <span className="text-sm font-semibold text-foreground">{detail.nextDeliveryDate}</span>
        </div>
      </div>
    </div>
  );
}
