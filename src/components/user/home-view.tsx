"use client";

import Link from "next/link";
import { ChevronRight, PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail } from "@/lib/wards";
import { USER_NOTIFICATIONS, notificationBadgeClass } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

const MEAL_TONE_TEXT: Record<Ward["lastMeal"]["tone"], string> = {
  완식: "오늘도 잘 챙겨 드셨어요",
  소량: "평소보다 적게 드셨어요",
  미응답: "아직 식사 확인이 안 됐어요",
};

export function HomeView({
  name,
  ward,
  detail,
}: {
  name: string;
  ward: Ward;
  detail: WardDetail;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title={`안녕하세요, ${name}님`} subtitle={ward.facility} />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground">
            오늘의 식사
          </span>
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold text-foreground">
              {ward.lastMeal.label}
            </span>
            <Badge className={notificationBadgeClass(ward.lastMeal.tone === "미응답" ? "미응답" : "공지")}>
              {ward.lastMeal.tone}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {MEAL_TONE_TEXT[ward.lastMeal.tone]}
          </p>
          {ward.lastMeal.tone !== "완식" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 w-fit"
              onClick={() =>
                toast.success(`${ward.caseWorkerName}님께 연락 요청을 보냈어요.`)
              }
            >
              <PhoneCall />
              담당자에게 연락하기
            </Button>
          )}
        </div>

        <Link
          href="/user/diet"
          className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide text-sidebar-primary">
              오늘의 배정 식단
            </span>
            <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />
          </div>
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
        </Link>

        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="수축기 혈압" value={`${detail.checkup.systolicBP}`} unit="mmHg" />
          <StatCard label="공복혈당" value={`${detail.checkup.fastingGlucose}`} unit="mg/dL" />
          <StatCard label="체중" value={`${detail.checkup.weightKg}`} unit="kg" />
        </div>

        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">안내 사항</span>
          {USER_NOTIFICATIONS.slice(0, 3).map((n) => (
            <div key={n.id} className="flex items-start gap-2.5 text-sm">
              <Badge className={`${notificationBadgeClass(n.type)} shrink-0`}>
                {n.type}
              </Badge>
              <div className="flex flex-col">
                <span className="text-foreground">{n.message}</span>
                <span className="text-xs text-muted-foreground">{n.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-3">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-base font-extrabold text-foreground">
        {value}
        <span className="ml-0.5 text-xs font-medium text-muted-foreground">
          {unit}
        </span>
      </span>
    </div>
  );
}
