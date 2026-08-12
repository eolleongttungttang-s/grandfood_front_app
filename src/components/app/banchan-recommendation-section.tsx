"use client";

// "AI 반찬 추천 요청 + 결과" 카드. 이용자 본인 화면(diet-view.tsx)과 보호자 화면
// (ward-detail-view.tsx) 양쪽에서 그대로 재사용한다 — 두 화면 다 대상자 신원(ward)만
// 알면 되고 화면별로 다른 게 없어서, ward-invite-view.tsx류처럼 화면마다 따로 만들지 않았다.

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BanchanRecommendation,
  BanchanRecommendationItem,
  fetchBanchanRecommendation,
  getWeekStartDate,
  requestBanchanRecommendation,
} from "@/lib/banchan-recommendation";

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

function formatErrorMessage(err: unknown): string {
  return err instanceof TypeError
    ? "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."
    : err instanceof Error
      ? err.message
      : "AI 반찬 추천 요청에 실패했어요.";
}

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

export function BanchanRecommendationSection({
  wardId,
  wardName,
  wardAge,
  wardAddress,
}: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
}) {
  // "이번 주"를 마운트 시점에 한 번 고정한다 — 자정을 넘겨 렌더가 다시 일어나도 이미 불러온
  // 결과와 요청 버튼이 갑자기 다른 주를 가리키지 않게 하기 위함.
  const weekStartDate = useMemo(() => getWeekStartDate(), []);
  const [recommendation, setRecommendation] = useState<BanchanRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 이 컴포넌트는 대상자(ward)별로 화면이 다시 마운트되는 구조라(guardian/user 라우트 둘 다
    // wardId를 key로 갈아끼우기보다는 아예 새 페이지로 이동) 사실상 이 effect는 마운트당 한 번만
    // 돈다 — 그래서 initial state(loading=true)를 그대로 쓰고, effect 안에서 setLoading(true)를
    // 다시 동기 호출하지 않는다(react-hooks/set-state-in-effect가 지적하는 캐스케이딩 렌더 방지).
    fetchBanchanRecommendation({ wardId, wardName, wardAge, wardAddress }, weekStartDate)
      .then((result) => {
        if (!cancelled) setRecommendation(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // wardName/Age/Address는 최초 백엔드 User 생성(ensureBackendWardId) 시에만 쓰이는 더미
    // 필드라 wardId 하나만 바뀌었을 때 다시 부르면 충분하다 — rag-chat.ts 호출부들과 동일한 전제.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardId, weekStartDate]);

  async function handleRequest() {
    setRequesting(true);
    setError(null);
    try {
      const result = await requestBanchanRecommendation(
        { wardId, wardName, wardAge, wardAddress },
        weekStartDate
      );
      setRecommendation(result);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setRequesting(false);
    }
  }

  const deliveries = recommendation ? groupByDelivery(recommendation.items) : [];
  const hasTargets =
    recommendation &&
    (recommendation.targetCalorieKcal != null ||
      recommendation.targetProteinG != null ||
      recommendation.targetSodiumMg != null ||
      recommendation.targetCarbsG != null);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sidebar-primary">AI 반찬 추천</span>
          <span className="text-base font-bold text-foreground">{weekStartDate} 주 배송 추천</span>
        </div>
        <Button size="sm" onClick={handleRequest} disabled={requesting || loading}>
          <Sparkles />
          {requesting ? "추천 받는 중..." : recommendation ? "다시 추천받기" : "AI 추천받기"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">추천 정보를 불러오는 중...</p>
      ) : !recommendation ? (
        <p className="text-sm text-muted-foreground">
          아직 이번 주 AI 반찬 추천을 요청하지 않았어요. 위 버튼을 눌러 받아보세요.
        </p>
      ) : (
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
      )}
    </div>
  );
}
