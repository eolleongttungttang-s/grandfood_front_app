"use client";

import { WardDetail } from "@/lib/wards";
import { TopBar } from "@/components/app/top-bar";

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

export function RecordsView({ detail }: { detail: WardDetail }) {
  const completeCount = detail.mealHistory.filter((m) => m === "완식").length;
  const smallCount = detail.mealHistory.filter((m) => m === "소량").length;
  const noResponseCount = detail.mealHistory.filter((m) => m === "미응답").length;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="섭취 · 건강 기록" subtitle="최근 14일" />

      <div className="flex flex-col gap-4 px-5">
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
            <h2 className="text-sm font-bold text-foreground">건강검진 데이터</h2>
            <span className="text-xs text-muted-foreground">
              {detail.checkup.date} 국가검진 연계
            </span>
          </div>
          <DetailRow label="수축기 혈압">{detail.checkup.systolicBP} mmHg</DetailRow>
          <DetailRow label="공복혈당">{detail.checkup.fastingGlucose} mg/dL</DetailRow>
          <DetailRow label="당화혈색소">{detail.checkup.hba1c} %</DetailRow>
          <DetailRow label="체중">{detail.checkup.weightKg} kg</DetailRow>
        </div>

        {detail.nextVisit && (
          <div className="flex flex-col gap-1 rounded-2xl bg-muted p-5">
            <span className="text-xs font-semibold text-muted-foreground">
              다음 방문 · 상담 예정
            </span>
            <span className="text-sm font-semibold text-foreground">
              {detail.nextVisit.date} · {detail.nextVisit.worker} ({detail.nextVisit.type})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
