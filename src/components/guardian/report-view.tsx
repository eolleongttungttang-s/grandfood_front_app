"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Download } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { getNutritionReport, ReportPeriod } from "@/lib/reports";
import {
  deriveDailyLeftover,
  fetchGuardianDietHistory,
  fetchGuardianHealthReport,
  fetchGuardianNutritionGaps,
  HealthReportSummary,
  NutritionGapItem,
} from "@/lib/meal-dashboard";
import { recentKstDateKeys } from "@/lib/ward-meal-dashboard";
import { deriveHealthInsight } from "@/lib/health-insights";
import { fetchRecipeRecommendations, type RecipeRecommendationItem } from "@/lib/recipe-recommendations";
import { mealLogStore, wardMealLogs } from "@/lib/meal-log-store";
import { computeTodayNutritionSnapshot } from "@/lib/banchan-recommendation";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { useLocalStore } from "@/lib/use-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { RecipeRecommendationList } from "@/components/app/recipe-recommendation-list";

// 백엔드 조회 세 단계(응답 전/응답은 왔는데 쓸 수 있는 값이 없음/실제 값 있음)를 명시적으로
// 구분한다 — 예전엔 "없으면 조용히 목업(추천 조합 목표치)으로 대체"했는데, 그러면 실제로는
// 아직 잔반 사진 한 장 안 올린 대상자도 화면엔 그럴싸한 숫자가 떠서 보호자가 실제 섭취
// 데이터로 착각한다(2026-08-26 피드백). "insufficient"면 목업 숫자 대신 안내 문구를 보여준다.
type BackendStat<T> = { status: "loading" } | { status: "insufficient" } | { status: "ready"; value: T };

function StatCard({ label, unit, stat }: { label: string; unit: string; stat: BackendStat<number> }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {stat.status === "ready" ? (
        <span className="text-lg font-extrabold text-foreground">
          {stat.value}
          {unit}
        </span>
      ) : stat.status === "loading" ? (
        <span className="text-lg font-extrabold text-muted-foreground">···</span>
      ) : (
        <span className="text-sm font-semibold text-muted-foreground">아직 섭취 기록이 부족해요</span>
      )}
    </div>
  );
}

// 영양소별 목표 대비 섭취(nutrition-gaps)의 nutrient_type은 자유 문자열 컬럼이라 백엔드가
// 실제로 어떤 값을 쓰는지 시드 데이터로 확정되어 있지 않다 — 나트륨/단백질/열량으로 보이는
// 항목만 느슨하게(영문·한글 키워드 포함 여부) 찾아 쓴다.
function findNutrientAverage(items: NutritionGapItem[], keywords: string[]): number | null {
  const match = items.find((i) => keywords.some((k) => i.nutrientType.toLowerCase().includes(k)));
  return match ? Math.round(match.averageAmount) : null;
}

function resolveNutrientStat(gapsStat: BackendStat<NutritionGapItem[]>, keywords: string[]): BackendStat<number> {
  if (gapsStat.status !== "ready") return gapsStat;
  const avg = findNutrientAverage(gapsStat.value, keywords);
  return avg === null ? { status: "insufficient" } : { status: "ready", value: avg };
}

export function ReportView({
  ward,
  detail,
  viewerGuardianLoginId,
}: {
  ward: Ward;
  detail: WardDetail;
  /** 지금 로그인한 보호자 계정 — 아래 fetchGuardian* 호출들에 그대로 넘겨서, 이 브라우저에
   *  캐시된 다른 보호자 세션의 데이터가 섞여 나오지 않도록 한다(코드 리뷰 지적: 이 화면의
   *  세 호출 모두 이 확인 없이 캐시된 아무 보호자 세션이나 썼다 — ward-detail-view.tsx가
   *  같은 클래스의 문제를 고칠 때 이 화면은 빠뜨렸었다). */
  viewerGuardianLoginId?: string;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("주간");
  const mockReport = getNutritionReport(ward, detail, period);
  const days = period === "주간" ? 7 : 30;

  // 실제 백엔드 리포트 데이터(GET /app/guardian/{id}/{diet-history,nutrition-gaps,health-report})가
  // 있으면 목업(reports.ts getNutritionReport) 대신 그걸 보여준다 — 없으면(자가등록 본인이 관리하는
  // 대상자, 아직 섭취 기록이 없는 신규 대상자 등) "기록 부족" 상태를 그대로 드러낸다. 목업(추천
  // 조합 목표치)으로 조용히 대체하지 않는다 — 보호자가 그걸 실제 섭취 데이터로 착각한다
  // (2026-08-26 피드백).
  // completeRate/gaps를 "loading" 상태로 직접 setState하는 대신, 결과와 "어느 조회 조건
  // (statKey) 기준으로 받은 결과인지"를 한 state에 같이 담아서 지금 조건과 다르면 로딩중으로
  // 취급한다 — effect 본문에서 setState를 동기적으로 바로 부르면 react-hooks/set-state-in-effect
  // 린트 규칙에 걸린다(MedicationFoodSuggestionStep.tsx와 같은 이유·같은 패턴).
  const statKey = `${ward.id}|${ward.name}|${ward.age}|${ward.address}|${days}|${viewerGuardianLoginId ?? ""}`;
  const [completeRateLoaded, setCompleteRateLoaded] = useState<{ key: string; stat: BackendStat<number> } | null>(
    null
  );
  const [gapsLoaded, setGapsLoaded] = useState<{ key: string; stat: BackendStat<NutritionGapItem[]> } | null>(null);
  const [backendHealthReport, setBackendHealthReport] = useState<HealthReportSummary | null>(null);
  const completeRateStat: BackendStat<number> =
    completeRateLoaded?.key === statKey ? completeRateLoaded.stat : { status: "loading" };
  const gapsStat: BackendStat<NutritionGapItem[]> =
    gapsLoaded?.key === statKey ? gapsLoaded.stat : { status: "loading" };

  useEffect(() => {
    let cancelled = false;
    const identity = { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address };

    fetchGuardianDietHistory(identity, days, viewerGuardianLoginId).then((items) => {
      if (cancelled) return;
      if (!items || items.length === 0) {
        setCompleteRateLoaded({ key: statKey, stat: { status: "insufficient" } });
        return;
      }
      // "완료된 끼니 비율"이 아니라 "얼마나 실제로 드셨는지"(100 - 평균 잔반율)로 바꿨다
      // (2026-08-21 피드백) — 사진 전후 비교로 이미 정확한 잔반율을 아는데, 사진을
      // 찍었는지 여부만 보는 완료율은 "얼마나 남겼는지"를 담지 못한다. 라벨("식사
      // 완료율")은 그대로 두고 계산 기준만 바꾼다.
      const daily = deriveDailyLeftover(items, recentKstDateKeys(days));
      const known = daily.filter((d) => d.avgLeftoverPercent !== null);
      if (known.length === 0) {
        setCompleteRateLoaded({ key: statKey, stat: { status: "insufficient" } });
        return;
      }
      const avgLeftover = known.reduce((sum, d) => sum + (d.avgLeftoverPercent ?? 0), 0) / known.length;
      setCompleteRateLoaded({ key: statKey, stat: { status: "ready", value: Math.round(100 - avgLeftover) } });
    });
    fetchGuardianNutritionGaps(identity, days, viewerGuardianLoginId).then((items) => {
      if (cancelled) return;
      setGapsLoaded({
        key: statKey,
        stat: items && items.length > 0 ? { status: "ready", value: items } : { status: "insufficient" },
      });
    });
    fetchGuardianHealthReport(identity, viewerGuardianLoginId).then((result) => {
      if (!cancelled) setBackendHealthReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address, days, viewerGuardianLoginId, statKey]);

  const sodiumStat = resolveNutrientStat(gapsStat, ["sodium", "나트륨"]);
  const proteinStat = resolveNutrientStat(gapsStat, ["protein", "단백질"]);
  const kcalStat = resolveNutrientStat(gapsStat, ["kcal", "calorie", "열량", "칼로리"]);

  // "건강데이터 결합 해석" — 오늘 AI가 배정한 반찬의 영양가 합 vs 목표치(records-view.tsx의
  // "오늘 영양성분 분석"과 동일한 기준, computeTodayNutritionSnapshot 참고) + 최근 식사 기록을
  // 합쳐서 이상 신호를 판단한다.
  const mealLogs = wardMealLogs(useLocalStore(mealLogStore), ward.id);
  const banchanIdentity = { wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address };
  const banchanRecommendation = useMonthlyBanchanRecommendation(banchanIdentity);
  const todayNutrition = computeTodayNutritionSnapshot(banchanRecommendation.monthly);
  const insight = deriveHealthInsight(ward, todayNutrition, mealLogs);

  // "레시피 · 유튜브 추천"만 실제 비동기 조회다 — 이 페이지의 나머지 데이터는 전부 이미 받은
  // props에서 동기 계산되지만, 레시피는 실제 백엔드 호출(recipe-recommendations.ts)이라
  // useEffect로 따로 가져온다. 백엔드가 오늘 배정 반찬 + 개인 목표치로 직접 결핍을
  // 계산하므로(recipe-recommendations.ts 상단 주석 참고), 여기 insight(로컬 계산, 위
  // 요약/배지 카드에는 계속 씀)를 넘길 필요는 없다.
  const [recipes, setRecipes] = useState<RecipeRecommendationItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRecipeRecommendations({
      mockWardId: ward.id,
      name: ward.name,
      age: ward.age,
      address: ward.address,
    }).then((result) => {
      if (!cancelled) setRecipes(result?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

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
            {mockReport.period} · {mockReport.rangeLabel}
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
          <StatCard label="식사 완료율" unit="%" stat={completeRateStat} />
          <StatCard label="평균 나트륨" unit="mg" stat={sodiumStat} />
          <StatCard label="평균 단백질" unit="g" stat={proteinStat} />
          <StatCard label="평균 열량" unit="kcal" stat={kcalStat} />
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
            mockReport.notes.map((n, i) => (
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
          <RecipeRecommendationList recipes={recipes} />
        </div>

        <p className="no-print text-center text-xs text-muted-foreground">
          병원 방문 시 이 화면을 인쇄하거나 PDF로 저장해서 보여드릴 수 있어요.
        </p>
      </div>
    </div>
  );
}
