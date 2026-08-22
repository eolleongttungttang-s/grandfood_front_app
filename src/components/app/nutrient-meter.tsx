// 목표 대비 진행률 막대 — care-survey-view.tsx의 설문 진행률 막대와 같은 시각 언어
// (bg-muted 트랙 위에 bg-primary 채움)를 그대로 재사용한다. 나트륨/단백질처럼 영양소마다
// "많을수록 좋은지 나쁜지"가 반대라 색으로 잘잘못을 판단하지 않는다 — 그 판단은 이미
// AI 반찬 추천의 반찬별 suitability(추천/주의/피하기)가 하고 있고, 이 막대는 그저
// "오늘 배정된 반찬 합계가 목표치에 얼마나 가까운지"를 사실 그대로 보여주는 역할만 한다.

// foreground/muted 토큰은 밝은 bg-card 카드를 기준으로 잡혀 있어서, 어두운 bg-sidebar
// 카드(diet-view.tsx의 "오늘의 추천 반찬 조합")에 그대로 쓰면 텍스트가 배경과 거의 같은
// 색이 돼 안 보인다 — speakable-card.tsx의 ICON_TONE과 같은 이유, 같은 해법(tone prop)
// 이다(2026-08-21, 그 카드에 목표 대비 비교를 추가하면서 발견).
const TONE_CLASS = {
  default: {
    label: "text-foreground",
    value: "text-foreground",
    meta: "text-muted-foreground",
    track: "bg-muted",
    fill: "bg-primary",
  },
  sidebar: {
    label: "text-sidebar-foreground",
    value: "text-sidebar-foreground",
    meta: "text-sidebar-foreground/70",
    track: "bg-sidebar-foreground/15",
    fill: "bg-sidebar-primary",
  },
} as const;

export function NutrientMeter({
  label,
  value,
  target,
  unit,
  tone = "default",
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  tone?: keyof typeof TONE_CLASS;
}) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const fillPct = Math.min(Math.max(pct, 0), 100);
  const c = TONE_CLASS[tone];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className={`font-semibold ${c.label}`}>{label}</span>
        <span className={c.meta}>
          <span className={`font-semibold ${c.value}`}>
            {Math.round(value).toLocaleString("ko-KR")}
          </span>
          {" / "}
          {Math.round(target).toLocaleString("ko-KR")}
          {unit}
          <span className="pl-1">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${c.track}`}>
        <div className={`h-full rounded-full ${c.fill} transition-all`} style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}
