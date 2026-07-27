"use client";

import Link from "next/link";
import { ChevronLeft, MessageCircle, PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail, WardStatus } from "@/lib/wards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_BADGE_CLASS: Record<WardStatus, string> = {
  "확인 필요": "bg-risk-high text-risk-high-foreground",
  관찰중: "bg-risk-caution text-risk-caution-foreground",
  양호: "bg-risk-normal text-risk-normal-foreground",
};

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

export function WardDetailView({
  ward,
  detail,
}: {
  ward: Ward;
  detail: WardDetail;
}) {
  const completeCount = detail.mealHistory.filter((m) => m === "완식").length;
  const smallCount = detail.mealHistory.filter((m) => m === "소량").length;
  const noResponseCount = detail.mealHistory.filter((m) => m === "미응답").length;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <div className="flex items-center justify-between bg-sidebar px-5 py-3 text-sidebar-foreground">
        <Link
          href="/guardian/home"
          className="flex items-center gap-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          대상자 목록
        </Link>
        <Badge className={STATUS_BADGE_CLASS[ward.status]}>{ward.status}</Badge>
      </div>

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-extrabold text-muted-foreground">
              {ward.name.slice(0, 1)}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-extrabold text-foreground">
                {ward.name}{" "}
                <span className="text-sm font-medium text-muted-foreground">
                  ({ward.relationToGuardian})
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {ward.age}세 · {ward.gender} · {ward.address}
              </span>
              <span className="text-xs text-muted-foreground">
                {ward.facility} · 담당 {ward.caseWorkerName}
              </span>
            </div>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            {ward.lastMeal.label}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => toast.success(`${ward.caseWorkerName}님께 전화 연결을 요청했어요.`)}
            >
              <PhoneCall />
              담당자 연결
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => toast.success(`${ward.name}님 방문 확인을 요청했어요.`)}
            >
              <MessageCircle />
              방문 요청
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm">
          <span className="text-xs font-bold tracking-wide text-sidebar-primary">
            배정 식단
          </span>
          <span className="text-xl font-extrabold">{detail.diet.name}</span>
          <div className="flex gap-4 pt-1 text-xs">
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">나트륨</span>
              <span className="font-semibold">{detail.diet.sodiumMg}mg</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">단백질</span>
              <span className="font-semibold">{detail.diet.proteinG}g</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">열량</span>
              <span className="font-semibold">{detail.diet.kcal}kcal</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">왜 이 식단인가요</span>
          {detail.diet.reasons.map((reason, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-foreground"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {i + 1}
              </span>
              {reason}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">질환 · 알레르기 · 복약</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">진단 질환</span>
            <div className="flex flex-wrap gap-1.5">
              {ward.conditions.map((c) => (
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
        </div>

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
