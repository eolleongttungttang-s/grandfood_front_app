"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Download } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { getNutritionReport, ReportPeriod } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-extrabold text-foreground">{value}</span>
    </div>
  );
}

export function ReportView({ ward, detail }: { ward: Ward; detail: WardDetail }) {
  const [period, setPeriod] = useState<ReportPeriod>("주간");
  const report = getNutritionReport(ward, detail, period);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <div className="no-print flex items-center justify-between bg-sidebar px-5 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <GrandFoodMark className="h-6 w-6 shrink-0 rounded-md" />
          <Link
            href={`/guardian/wards/${ward.id}`}
            className="flex items-center gap-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {ward.name}님
          </Link>
        </div>
        <Button size="sm" onClick={() => window.print()}>
          <Download />
          PDF로 저장
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-extrabold text-foreground">
            {ward.name}님 건강 리포트
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.period} · {report.rangeLabel}
          </p>
        </div>

        <div className="no-print grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setPeriod("주간")}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              period === "주간" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            주간
          </button>
          <button
            type="button"
            onClick={() => setPeriod("월간")}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              period === "월간" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            월간
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="식사 완료율" value={`${report.completeRate}%`} />
          <StatCard label="평균 나트륨" value={`${report.avgSodiumMg}mg`} />
          <StatCard label="평균 단백질" value={`${report.avgProteinG}g`} />
          <StatCard label="평균 열량" value={`${report.avgKcal}kcal`} />
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">담당 영양사 소견</span>
          {report.notes.map((n, i) => (
            <p key={i} className="text-sm text-foreground">
              · {n}
            </p>
          ))}
        </div>

        <p className="no-print text-center text-xs text-muted-foreground">
          병원 방문 시 이 화면을 인쇄하거나 PDF로 저장해서 보여드릴 수 있어요.
        </p>
      </div>
    </div>
  );
}
