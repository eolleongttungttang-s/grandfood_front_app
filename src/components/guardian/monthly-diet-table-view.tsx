"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Ward } from "@/lib/wards";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import {
  addDaysToDateString,
  BackendMealType,
  getRecommendationForDate,
  MonthlyBanchanRecommendation,
} from "@/lib/banchan-recommendation";
import { formatMonthDayLabel } from "@/lib/date-format";

const MEAL_COLUMNS: { type: BackendMealType; label: string }[] = [
  { type: "breakfast", label: "아침" },
  { type: "lunch", label: "점심" },
  { type: "dinner", label: "저녁" },
];

type MealCell =
  | { kind: "not_started" | "generating" | "failed" | "empty" }
  | { kind: "ready"; names: string[] };

// 이미 있는 "AI 반찬 추천(월간)" 데이터를 재사용한다 — 참고로 받은 훈이식단.pdf 레이아웃과
// 동일하게 각 끼니 칸엔 "밥" + 그날 배정된 반찬 이름을 나열한다. "밥"은 배송/DB에 실제
// 항목으로 있는 게 아니라 한식 상차림 관례상 항상 나온다는 전제로 화면에서만 붙인다.
function mealCell(
  monthly: MonthlyBanchanRecommendation | null,
  dateStr: string,
  mealType: BackendMealType
): MealCell {
  const rec = getRecommendationForDate(monthly, dateStr, mealType);
  if (!rec || rec.status === "not_started") return { kind: "not_started" };
  if (rec.status === "generating") return { kind: "generating" };
  if (rec.status === "failed") return { kind: "failed" };
  if (rec.items.length === 0) return { kind: "empty" };
  return { kind: "ready", names: ["밥", ...rec.items.map((i) => i.name)] };
}

export function MonthlyDietTableView({ ward }: { ward: Ward }) {
  const identity = { wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address };
  const { monthly, loading } = useMonthlyBanchanRecommendation(identity);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 bg-sidebar px-5 py-3 text-sidebar-foreground">
        <GrandFoodMark className="h-6 w-6 shrink-0 rounded-md" />
        <Link
          href={`/guardian/wards/detail?id=${ward.id}`}
          className="flex items-center gap-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {ward.name}님
        </Link>
      </div>

      <div className="flex flex-col gap-1 px-5">
        <h1 className="text-lg font-extrabold text-foreground">월간 식단표</h1>
        <p className="text-sm text-muted-foreground">
          {ward.name}님의 건강 프로필을 바탕으로 AI가 추천한 이번 달 식단이에요.
        </p>
      </div>

      {loading && !monthly ? (
        <p className="px-5 text-sm text-muted-foreground">불러오는 중이에요...</p>
      ) : !monthly || monthly.weeks.length === 0 ? (
        <p className="mx-5 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          아직 생성된 식단이 없어요.
        </p>
      ) : (
        <div className="flex flex-col gap-5 px-5">
          {monthly.weeks.map((week, weekIndex) => (
            <div key={week.weekStartDate} className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-foreground">{weekIndex + 1}주차</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted text-xs text-muted-foreground">
                      <th className="w-24 px-2.5 py-2 text-left font-semibold">날짜</th>
                      {MEAL_COLUMNS.map((m) => (
                        <th key={m.type} className="px-2.5 py-2 text-left font-semibold">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 7 }, (_, i) => addDaysToDateString(week.weekStartDate, i)).map(
                      (dateStr) => (
                        <tr key={dateStr} className="border-t border-border align-top">
                          <td className="px-2.5 py-2.5 text-xs font-semibold text-foreground">
                            {formatMonthDayLabel(dateStr)}
                          </td>
                          {MEAL_COLUMNS.map((m) => {
                            const cell = mealCell(monthly, dateStr, m.type);
                            return (
                              <td key={m.type} className="px-2.5 py-2.5 text-xs text-foreground">
                                {cell.kind === "not_started" && (
                                  <span className="text-muted-foreground">아직 생성 전</span>
                                )}
                                {cell.kind === "generating" && (
                                  <span className="text-muted-foreground">생성 중...</span>
                                )}
                                {cell.kind === "failed" && (
                                  <span className="text-destructive">생성 실패</span>
                                )}
                                {cell.kind === "empty" && (
                                  <span className="text-muted-foreground">배정 없음</span>
                                )}
                                {cell.kind === "ready" && cell.names.join(", ")}
                              </td>
                            );
                          })}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            대상자의 건강 프로필을 기준으로 생성된 추천 식단이며, 필요 시 담당 영양사가 조정할 수
            있어요.
          </p>
        </div>
      )}
    </div>
  );
}
