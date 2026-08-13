// 목표 대비 진행률 막대 — care-survey-view.tsx의 설문 진행률 막대와 같은 시각 언어
// (bg-muted 트랙 위에 bg-primary 채움)를 그대로 재사용한다. 나트륨/단백질처럼 영양소마다
// "많을수록 좋은지 나쁜지"가 반대라 색으로 잘잘못을 판단하지 않는다 — 그 판단은 이미
// AI 반찬 추천의 반찬별 suitability(추천/주의/피하기)가 하고 있고, 이 막대는 그저
// "오늘 배정된 반찬 합계가 목표치에 얼마나 가까운지"를 사실 그대로 보여주는 역할만 한다.
export function NutrientMeter({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const fillPct = Math.min(Math.max(pct, 0), 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">
            {Math.round(value).toLocaleString("ko-KR")}
          </span>
          {" / "}
          {Math.round(target).toLocaleString("ko-KR")}
          {unit}
          <span className="pl-1">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}
