// "최근 14일 섭취 기록" 카드 상단의 완식/소량/미응답 집계 — 예전엔 "완식 8 · 소량 3 ·
// 미응답 3"처럼 인라인 텍스트 한 줄로만 보여줬다("디자인이 별로다" 피드백, 2026-08-13).
// 아래 그리드(하루 한 칸)가 이미 일자별 상세를 보여주므로, 요약 줄의 역할은 "14일 중 비중이
// 어느 정도인지 한눈에" 보여주는 것 — 그 역할에 맞게 비율 막대 + 범례로 바꿨다.
//
// 색은 이 카드가 이미 쓰는 완식/소량/미응답 상태색(MEAL_TONE_CLASS, records-view.tsx/
// ward-detail-view.tsx) 그대로 재사용한다 — 요약 막대만 새 팔레트를 쓰면 바로 아래 그리드와
// 같은 상태가 두 가지 색으로 보이게 된다.
export function MealToneSummary({
  completeCount,
  smallCount,
  noResponseCount,
}: {
  completeCount: number;
  smallCount: number;
  noResponseCount: number;
}) {
  const total = completeCount + smallCount + noResponseCount;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="flex flex-col gap-2">
      {/* 세 구간을 채우고, 2px 간격(surface gap)으로 서로 분리한다 — 테두리 대신 간격으로
          구간을 나눠야 각 구간에 데이터가 아닌 잉크(테두리)가 안 얹힌다. */}
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground" style={{ width: `${pct(completeCount)}%` }} />
        <div className="h-full bg-risk-caution-foreground" style={{ width: `${pct(smallCount)}%` }} />
        <div className="h-full bg-risk-high-foreground" style={{ width: `${pct(noResponseCount)}%` }} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
          완식 <span className="font-semibold text-foreground">{completeCount}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk-caution-foreground" />
          소량 <span className="font-semibold text-risk-caution-foreground">{smallCount}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk-high-foreground" />
          미응답 <span className="font-semibold text-risk-high-foreground">{noResponseCount}</span>
        </span>
      </div>
    </div>
  );
}
