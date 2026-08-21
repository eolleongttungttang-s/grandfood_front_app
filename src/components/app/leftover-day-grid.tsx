"use client";

// records-view.tsx(어르신 본인)/ward-detail-view.tsx(보호자)의 "최근 14일 섭취 기록" 칸 —
// 예전엔 완식/소량/미응답 3단계 색만 있고 날짜 숫자도 없어 칸 하나가 어느 날인지 색으로만
// 짐작해야 했다. "완식/소량"이라는 임의 경계 대신 실제 평균 잔반율 숫자를 쓰기로 하면서
// (deriveDailyLeftover, 2026-08-21 피드백 — "사진 전후로 얼마나 남겼는지 다 알려주잖아"),
// 칸에도 그 숫자에 맞는 색 등급 + 실제 날짜(일)를 같이 보여준다. 정확한 %는 칸 안에 같이
// 넣지 않는다 — 날짜 숫자와 같이 있으면 뭐가 뭔지 헷갈린다는 피드백을 받아, 칸은 색+날짜만
// 담당하고 정확한 값은 탭했을 때 아래 상세(DietDayDetail)에서 크게 보여준다.
//
// 색 경계(30%)는 leftover-result.tsx의 severityOf가 쓰는 첫 경계와 맞춘다 — 다만 그 함수의
// caution/high 2단계 구분까지는 가져오지 않는다. "조금 남김/많이 남김"처럼 나누면 정확히
// 어디서부터 "많이"인지 근거가 약하다는 피드백(2026-08-21)에 따라, 남았으면(30% 이상) 그냥
// "남김" 하나로만 본다. 색은 원래 이 칸이 30~59%일 때 쓰던 caution 톤(주황+갈색,
// #92591d)을 그대로 쓴다 — high 톤(#8b3018, 더 붉음)으로 잘못 합쳤다가 실제 화면 색이
// 눈에 띄게 붉어져서 되돌림(2026-08-21 피드백: "남김색 원래 주황+갈색 섞인 색이었잖아").
import type { DailyLeftover } from "@/lib/meal-dashboard";

const LEFTOVER_THRESHOLD = 30;

function leftoverCellClass(percent: number): string {
  return percent >= LEFTOVER_THRESHOLD ? "bg-risk-caution-foreground" : "bg-risk-normal-foreground";
}

// 색이 뭘 뜻하는지 칸만 보고는 알 수 없다는 피드백(2026-08-21)에 따른 범례. 날짜 칸과
// 같은 크기 정사각형 3개를 늘어놓았더니 공간을 너무 많이 차지한다는 피드백을 받았고,
// 그 다음 시도(색점+글자 분리)는 "칸 안에 글자가 같이 있는" 원래 방식(가시성이 더 좋다는
// 피드백)이 아니어서 되돌렸다 — 대신 "최근 14일 섭취 기록" 제목과 한 줄에 나란히 두어야
// 하니 칸 자체를 작은 배지(pill) 크기로 줄였다. 색은 그리드가 실제로 쓰는 색 그대로.
const LEGEND_ITEMS: { label: string; className: string }[] = [
  { label: "무응답", className: "bg-muted text-muted-foreground" },
  { label: "완식", className: "bg-risk-normal-foreground text-card" },
  { label: "남김", className: "bg-risk-caution-foreground text-card" },
];

export function LeftoverLegend() {
  return (
    <div className="flex items-center gap-1.5">
      {LEGEND_ITEMS.map(({ label, className }) => (
        <span
          key={label}
          className={`flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-bold whitespace-nowrap ${className}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function LeftoverDayGrid({
  dailyLeftover,
  selectedDate,
  onSelectDate,
}: {
  dailyLeftover: DailyLeftover[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const known = dailyLeftover.filter((d) => d.avgLeftoverPercent !== null);
  const avgOfKnown =
    known.length > 0
      ? Math.round(known.reduce((sum, d) => sum + (d.avgLeftoverPercent ?? 0), 0) / known.length)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">
          {avgOfKnown === null ? "아직 기록이 없어요" : "14일 평균 잔반율"}
        </span>
        {avgOfKnown !== null && <span className="text-sm font-bold text-foreground">{avgOfKnown}%</span>}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dailyLeftover.map(({ date, avgLeftoverPercent }) => {
          const isSelected = date === selectedDate;
          const dayOfMonth = Number(date.slice(8, 10));
          const cellClass =
            avgLeftoverPercent === null
              ? "bg-muted text-muted-foreground"
              : `${leftoverCellClass(avgLeftoverPercent)} text-card`;
          return (
            <button
              key={date}
              type="button"
              aria-label={`${date} ${avgLeftoverPercent === null ? "기록 없음" : `잔반율 ${Math.round(avgLeftoverPercent)}%`}`}
              onClick={() => onSelectDate(date)}
              className={`flex h-12 flex-col items-center justify-center rounded-md text-xs whitespace-nowrap font-bold sm:text-sm ${cellClass} ${
                isSelected ? "ring-2 ring-inset ring-primary" : ""
              }`}
            >
              {dayOfMonth}일
            </button>
          );
        })}
      </div>
    </div>
  );
}
