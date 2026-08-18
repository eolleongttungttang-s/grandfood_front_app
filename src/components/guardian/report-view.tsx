"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Download } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { getNutritionReport, ReportPeriod } from "@/lib/reports";
import {
  fetchGuardianDietHistory,
  fetchGuardianHealthReport,
  fetchGuardianNutritionGaps,
  HealthReportSummary,
  NutritionGapItem,
} from "@/lib/meal-dashboard";
import { deriveHealthInsight } from "@/lib/health-insights";
import { getRecipeRecommendations, type RecipeRecommendation } from "@/lib/recipe-recommendations";
import { mealLogStore, wardMealLogs } from "@/lib/meal-log-store";
import { computeTodayNutritionSnapshot } from "@/lib/banchan-recommendation";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { useLocalStore } from "@/lib/use-store";
import { Badge } from "@/components/ui/badge";
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

// 영양소별 목표 대비 섭취(nutrition-gaps)의 nutrient_type은 자유 문자열 컬럼이라 백엔드가
// 실제로 어떤 값을 쓰는지 시드 데이터로 확정되어 있지 않다 — 나트륨/단백질/열량으로 보이는
// 항목만 느슨하게(영문·한글 키워드 포함 여부) 찾아 쓰고, 못 찾으면 그 카드는 목업 값을 그대로
// 둔다(완전히 안 보이게 하는 것보다, 아직 실제 기록이 없다는 걸 자연스럽게 드러내는 셈).
function findNutrientAverage(items: NutritionGapItem[], keywords: string[]): number | null {
  const match = items.find((i) => keywords.some((k) => i.nutrientType.toLowerCase().includes(k)));
  return match ? Math.round(match.averageAmount) : null;
}

export function ReportView({ ward, detail }: { ward: Ward; detail: WardDetail }) {
  const [period, setPeriod] = useState<ReportPeriod>("주간");
  const mockReport = getNutritionReport(ward, detail, period);
  const days = period === "주간" ? 7 : 30;

  // 실제 백엔드 리포트 데이터(GET /app/guardian/{id}/{diet-history,nutrition-gaps,health-report})가
  // 있으면 목업(reports.ts getNutritionReport) 대신 그걸 보여준다 — 없거나 실패하면(자가등록 본인이
  // 관리하는 대상자, 아직 섭취 기록이 없는 신규 대상자 등) 조용히 목업으로 남는다.
  const [backendCompleteRate, setBackendCompleteRate] = useState<number | null>(null);
  const [backendGaps, setBackendGaps] = useState<NutritionGapItem[] | null>(null);
  const [backendHealthReport, setBackendHealthReport] = useState<HealthReportSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const identity = { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address };

    fetchGuardianDietHistory(identity, days).then((items) => {
      if (cancelled || !items || items.length === 0) return;
      const completedCount = items.filter((i) => i.completed).length;
      setBackendCompleteRate(Math.round((completedCount / items.length) * 100));
    });
    fetchGuardianNutritionGaps(identity, days).then((items) => {
      if (!cancelled && items) setBackendGaps(items);
    });
    fetchGuardianHealthReport(identity).then((result) => {
      if (!cancelled) setBackendHealthReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address, days]);

  const avgSodiumMg = backendGaps ? (findNutrientAverage(backendGaps, ["sodium", "나트륨"]) ?? mockReport.avgSodiumMg) : mockReport.avgSodiumMg;
  const avgProteinG = backendGaps ? (findNutrientAverage(backendGaps, ["protein", "단백질"]) ?? mockReport.avgProteinG) : mockReport.avgProteinG;
  const avgKcal = backendGaps
    ? (findNutrientAverage(backendGaps, ["kcal", "calorie", "열량", "칼로리"]) ?? mockReport.avgKcal)
    : mockReport.avgKcal;

  const report = {
    ...mockReport,
    completeRate: backendCompleteRate ?? mockReport.completeRate,
    avgSodiumMg,
    avgProteinG,
    avgKcal,
  };

  // "건강데이터 결합 해석" — 오늘 AI가 배정한 반찬의 영양가 합 vs 목표치(records-view.tsx의
  // "오늘 영양성분 분석"과 동일한 기준, computeTodayNutritionSnapshot 참고) + 최근 식사 기록을
  // 합쳐서 이상 신호를 판단한다.
  const mealLogs = wardMealLogs(useLocalStore(mealLogStore), ward.id);
  const banchanIdentity = { wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address };
  const banchanRecommendation = useMonthlyBanchanRecommendation(banchanIdentity);
  const todayNutrition = computeTodayNutritionSnapshot(banchanRecommendation.monthly);
  const insight = deriveHealthInsight(ward, todayNutrition, mealLogs);

  // "레시피 · 유튜브 추천"만 실제 비동기 조회다 — 이 페이지의 나머지 데이터는 전부 이미 받은
  // props에서 동기 계산되지만, 레시피는 "결핍 상태가 정해진 뒤에야 뭘 추천할지 정해지는" 별도의
  // 조회라서 useEffect로 따로 가져온다 (나중에 진짜 백엔드가 붙어도 이 부분만 로딩 상태가 생긴다).
  const [recipes, setRecipes] = useState<RecipeRecommendation[] | null>(null);
  // insight는 매 렌더마다 새로 계산되는 객체라(getWardDetail도 렌더마다 새로 호출됨), 객체 참조 자체를
  // 의존성으로 넣으면 값이 안 바뀌어도 매번 다시 조회하게 된다. 그래서 "실제로 결과가 달라지는 값"만
  // 문자열로 뽑아 의존성으로 쓴다.
  const deficiencyKey = insight.deficiencies.join(",");
  const leftoverKey = insight.frequentLeftoverIngredients.join(",");
  useEffect(() => {
    let cancelled = false;
    getRecipeRecommendations(insight).then((result) => {
      if (!cancelled) setRecipes(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 위 주석 참고: insight 참조 대신 파생 키만 사용
  }, [insight.wardId, deficiencyKey, leftoverKey]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <div className="no-print flex items-center justify-between bg-sidebar px-5 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <GrandFoodMark className="h-6 w-6 shrink-0 rounded-md" />
          <Link
            href={`/guardian/wards/detail?id=${ward.id}`}
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
          {backendHealthReport ? (
            <>
              <p className="text-sm text-foreground">{backendHealthReport.summary}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {backendHealthReport.riskLevel && (
                  <Badge className="bg-risk-caution text-risk-caution-foreground">
                    위험도 {backendHealthReport.riskLevel}
                  </Badge>
                )}
                {backendHealthReport.bpStatus && <Badge variant="secondary">혈압 {backendHealthReport.bpStatus}</Badge>}
                {backendHealthReport.glucoseStatus && (
                  <Badge variant="secondary">혈당 {backendHealthReport.glucoseStatus}</Badge>
                )}
                {backendHealthReport.bmiStatus && <Badge variant="secondary">BMI {backendHealthReport.bmiStatus}</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">{backendHealthReport.reportDate} 검수 확정</span>
            </>
          ) : (
            report.notes.map((n, i) => (
              <p key={i} className="text-sm text-foreground">
                · {n}
              </p>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">건강데이터 결합 해석</span>
          <p className="text-sm text-foreground">{insight.summary}</p>
          {!insight.deficiencies.includes("정상") && (
            <div className="flex flex-wrap gap-1.5">
              {insight.deficiencies.map((d) => (
                <Badge key={d} className="bg-risk-caution text-risk-caution-foreground">
                  {d}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">레시피 · 유튜브 추천</span>
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

        <p className="no-print text-center text-xs text-muted-foreground">
          병원 방문 시 이 화면을 인쇄하거나 PDF로 저장해서 보여드릴 수 있어요.
        </p>
      </div>
    </div>
  );
}
