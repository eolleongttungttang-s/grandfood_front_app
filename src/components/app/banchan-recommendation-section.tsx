"use client";

// "AI 반찬 추천 요청 + 결과" 카드. 이용자 본인 화면(diet-view.tsx)과 보호자 화면
// (ward-detail-view.tsx) 양쪽에서 그대로 재사용한다 — 두 화면 다 대상자 신원(ward)만
// 알면 되고 화면별로 다른 게 없어서, ward-invite-view.tsx류처럼 화면마다 따로 만들지 않았다.
//
// fetch/요청 상태는 이 컴포넌트가 직접 들고 있지 않고 use-monthly-banchan-recommendation.ts의
// useMonthlyBanchanRecommendation() 훅 결과를 상위 화면에서 props로 받는다 — diet-view.tsx는 이
// 상태(특히 isNewMember)를 보고 카드 자체가 아니라 화면 전체를 다르게 그려야 해서, 상태를
// 컴포넌트 안에 가두면 상위 화면이 같은 데이터를 다시 fetch해야 하는 구조가 된다.

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BanchanRecommendation,
  BanchanRecommendationGenerationStatus,
  BanchanRecommendationItem,
} from "@/lib/banchan-recommendation";
import { MonthlyBanchanRecommendationState } from "@/lib/use-monthly-banchan-recommendation";

const SUITABILITY_LABEL: Record<string, string> = {
  recommended: "추천",
  caution: "주의",
  avoid: "피하기",
};

// ward-detail-view.tsx의 STATUS_BADGE_CLASS(확인 필요/관찰중/양호)와 같은 risk 톤 체계를 쓴다 —
// avoid≈확인 필요, caution≈관찰중, recommended≈양호로 대응시켰다.
const SUITABILITY_CLASS: Record<string, string> = {
  recommended: "bg-risk-normal text-risk-normal-foreground",
  caution: "bg-risk-caution text-risk-caution-foreground",
  avoid: "bg-risk-high text-risk-high-foreground",
};

const GENERATION_STATUS_LABEL: Record<BanchanRecommendationGenerationStatus, string> = {
  not_started: "생성 전",
  generating: "생성 중",
  done: "완료",
  failed: "실패",
};

const GENERATION_STATUS_CLASS: Record<BanchanRecommendationGenerationStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  generating: "bg-risk-caution text-risk-caution-foreground",
  done: "bg-risk-normal text-risk-normal-foreground",
  failed: "bg-risk-high text-risk-high-foreground",
};

function groupByDelivery(
  items: BanchanRecommendationItem[]
): { deliveryNumber: number; items: BanchanRecommendationItem[] }[] {
  const map = new Map<number, BanchanRecommendationItem[]>();
  for (const item of items) {
    const list = map.get(item.deliveryNumber) ?? [];
    list.push(item);
    map.set(item.deliveryNumber, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([deliveryNumber, list]) => ({
      deliveryNumber,
      items: [...list].sort((a, b) => a.slotIndex - b.slotIndex),
    }));
}

function TargetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

// 추천 하나(월간의 한 주)의 목표치 + 배송별 반찬 + 참고 자료를 그린다.
function RecommendationDetails({ recommendation }: { recommendation: BanchanRecommendation }) {
  const deliveries = groupByDelivery(recommendation.items);
  const hasTargets =
    recommendation.targetCalorieKcal != null ||
    recommendation.targetProteinG != null ||
    recommendation.targetSodiumMg != null ||
    recommendation.targetCarbsG != null;

  return (
    <>
      {hasTargets && (
        <div className="flex flex-wrap gap-4 rounded-lg bg-muted/60 p-3 text-xs">
          {recommendation.targetCalorieKcal != null && (
            <TargetStat label="목표 열량" value={`${Math.round(recommendation.targetCalorieKcal)}kcal`} />
          )}
          {recommendation.targetProteinG != null && (
            <TargetStat label="목표 단백질" value={`${Math.round(recommendation.targetProteinG)}g`} />
          )}
          {recommendation.targetSodiumMg != null && (
            <TargetStat label="목표 나트륨" value={`${Math.round(recommendation.targetSodiumMg)}mg`} />
          )}
          {recommendation.targetCarbsG != null && (
            <TargetStat label="목표 탄수화물" value={`${Math.round(recommendation.targetCarbsG)}g`} />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {deliveries.map(({ deliveryNumber, items }) => (
          <div key={deliveryNumber} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{deliveryNumber}번째 배송</span>
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <div key={item.banchanId} className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                    <Badge className={SUITABILITY_CLASS[item.suitability]}>
                      {SUITABILITY_LABEL[item.suitability]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>{item.category}</span>
                    {item.caloriePer100g != null && <span>{item.caloriePer100g}kcal/100g</span>}
                    {item.proteinPer100g != null && <span>단백질 {item.proteinPer100g}g</span>}
                    {item.sodiumPer100g != null && <span>나트륨 {item.sodiumPer100g}mg</span>}
                    {item.carbsPer100g != null && <span>탄수 {item.carbsPer100g}g</span>}
                  </div>
                  {item.reason && <p className="text-xs text-foreground/80">{item.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {recommendation.referenceGuidelines.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-[11px] font-semibold text-muted-foreground">참고 자료</span>
          {recommendation.referenceGuidelines.map((g, i) => (
            <span key={i} className="text-[11px] text-muted-foreground">
              · {g.title}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function BanchanRecommendationSection({ state }: { state: MonthlyBanchanRecommendationState }) {
  const { month, monthly, loading, requesting, polling, error, request } = state;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sidebar-primary">AI 반찬 추천</span>
          <span className="text-base font-bold text-foreground">{month} 월 배송 추천</span>
        </div>
        <Button size="sm" onClick={request} disabled={requesting || loading}>
          <Sparkles />
          {requesting ? "요청하는 중..." : monthly ? "다시 추천받기" : "AI 추천받기"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">추천 정보를 불러오는 중...</p>
      ) : !monthly || monthly.weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 이번 달 AI 반찬 추천을 요청하지 않았어요. 위 버튼을 눌러 받아보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {polling && (
            <p className="text-xs text-muted-foreground">
              반찬을 고르고 있어요. 완료되는 대로 아래 목록이 자동으로 채워져요...
            </p>
          )}
          {monthly.weeks.map((week) => (
            <div key={week.weekStartDate} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{week.weekStartDate} 주</span>
                <Badge className={GENERATION_STATUS_CLASS[week.generationStatus]}>
                  {GENERATION_STATUS_LABEL[week.generationStatus]}
                </Badge>
              </div>
              {week.generationStatus === "done" && week.recommendation && (
                <RecommendationDetails recommendation={week.recommendation} />
              )}
              {week.generationStatus === "failed" && (
                <p className="text-xs text-destructive">{week.error ?? "추천 생성에 실패했어요."}</p>
              )}
              {week.generationStatus === "not_started" && (
                <p className="text-xs text-muted-foreground">아직 생성을 요청하지 않았어요.</p>
              )}
              {week.generationStatus === "generating" && (
                <p className="text-xs text-muted-foreground">생성 중이에요...</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
