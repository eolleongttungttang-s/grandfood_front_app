"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { adviseForWard, MedicationAdvice, NutrientRisk } from "@/lib/medication";
import { Ward } from "@/lib/wards";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/app/top-bar";
import { ExpandToggle } from "@/components/app/expand-toggle";

// "복약 안내" 자세히 보기 화면 — home-view.tsx의 얇은 진입 행("복약 안내 보기")에서 들어온다.
// 문서(복약정보_홈화면_노출_API_연동가이드.md) "화면에서 반드시 지켜야 할 것" 4개를 그대로 코드로
// 강제한다 — 문구는 새로 만들지 않고 백엔드가 내려준 원문/출처만 그대로 노출한다:
//   1) consultNotice는 항상 노출 (맨 아래 고정)
//   2) evidence를 보여줄 땐 source도 항상 같이
//   3) otcCheck.verdict엔 애초에 "먹어도 된다/안 된다"가 없다 — 여기서도 새로 그런 문구를
//      만들어 붙이지 않는다
//   4) nutrientRisks[].explanation이 빈 문자열이면(검수 전) 그 항목의 설명 문장을 아예 안 띄운다

function EvidenceBlock({ evidence, source }: { evidence: string; source: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-xs text-foreground/80">
      <p className="leading-relaxed">&ldquo;{evidence}&rdquo;</p>
      <span className="text-muted-foreground">출처: {source}</span>
    </div>
  );
}

function NutrientRiskCard({ risk }: { risk: NutrientRisk }) {
  const [showExplanation, setShowExplanation] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-bold text-foreground">
        {risk.drugGroupLabel} 복용 중이면 {risk.nutrient}이 부족해질 수 있어요
      </p>
      <EvidenceBlock evidence={risk.evidence} source={risk.source} />

      {/* explanation이 빈 문자열이면 아직 영양사 검수 전이라는 뜻 — 이 토글 자체를 숨긴다.
          프론트에서 대신 설명을 지어 붙이지 않는다(가이드 4번). */}
      {risk.explanation && (
        <>
          <ExpandToggle
            expanded={showExplanation}
            onToggle={() => setShowExplanation((v) => !v)}
            expandLabel={`${risk.nutrient}이 뭐예요?`}
            collapseLabel="접기"
          />
          {showExplanation && (
            <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-xs text-foreground/80">
              <p className="leading-relaxed">{risk.explanation}</p>
              <span className="text-muted-foreground">출처: {risk.explanationSource}</span>
            </div>
          )}
        </>
      )}

      {risk.noFoodReason ? (
        // 반찬 추천을 일부러 안 한 경우(예: 이뇨제 복용 중 나트륨 보충 등 위험한 조합) —
        // foods는 항상 빈 배열이고, 이 문장을 대신 보여준다.
        <p className="rounded-lg bg-risk-caution/20 p-3 text-xs font-medium text-foreground">
          {risk.noFoodReason}
        </p>
      ) : risk.foods.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">이런 반찬은 어때요</span>
          <div className="flex flex-wrap gap-1.5">
            {risk.foods.map((food, i) => (
              <Badge key={`${food.banchan}-${i}`} className="bg-secondary text-secondary-foreground">
                {food.banchan} ({food.foodName} {food.amount}/{food.basis})
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MedicationAdviceView({ ward }: { ward: Ward }) {
  const router = useRouter();
  const [advice, setAdvice] = useState<MedicationAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adviseForWard({ wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address })
      .then((result) => {
        if (!cancelled) setAdvice(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "복약 안내를 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

  const loading = advice === null && !error;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="복약 안내" subtitle="복용 중인 약 기준" onBack={() => router.back()} />

      <div className="flex flex-col gap-3 px-5">
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중이에요...</p>}
        {!loading && error && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && advice && (
          <>
            <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <span className="text-xs font-bold text-muted-foreground">지금 등록된 복용약</span>
              <div className="flex flex-wrap gap-1.5">
                {advice.medications.map((m) => (
                  <Badge key={m.code} className="bg-primary/10 text-foreground">
                    {m.label}
                  </Badge>
                ))}
              </div>
            </div>

            {advice.nutrientRisks.map((risk, i) => (
              <NutrientRiskCard key={`${risk.nutrient}-${i}`} risk={risk} />
            ))}

            {advice.foodCautions.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className="text-sm font-bold text-foreground">이런 음식은 조심하세요</span>
                {advice.foodCautions.map((c, i) => (
                  <div key={`${c.food}-${i}`} className="flex flex-col gap-1.5">
                    <Badge className="w-fit bg-risk-caution text-risk-caution-foreground">{c.food}</Badge>
                    <EvidenceBlock evidence={c.evidence} source={c.source} />
                  </div>
                ))}
              </div>
            )}

            {/* consultNotice는 항상 채워져서 오고, 반드시 노출해야 한다(가이드 1번) —
                조건부 렌더링을 걸지 않는다. */}
            <p className="rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              {advice.consultNotice}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
