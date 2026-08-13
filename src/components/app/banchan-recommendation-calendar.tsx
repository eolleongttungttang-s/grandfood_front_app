"use client";

// AI 반찬 추천 결과를 달력(월 그리드)으로 보여준다 — 예전엔 banchan-recommendation-section.tsx가
// 5개 주 × 하루 최대 여러 개 반찬을 전부 펼쳐서 세로로 나열해서, 한 달치를 다 보려면 스크롤이
// 굉장히 길어지는 문제가 있었다(2026-08-13 피드백). 날짜 칸을 누르면 그날 반찬만 아래에
// 보여주는 방식으로 바꿔서, 한눈에 이번 달 전체 상태(칸 색)를 보고 원하는 날만 펼쳐보게 한다.
// 이전달/다음달로도 넘어갈 수 있다(2026-08-13 추가 피드백) — 지나간 달에 뭘 먹었는지, 다음
// 달은 아직 생성 전인지를 훑어볼 수 있다.
//
// 색 체계는 이 앱이 이미 곳곳에서 쓰는 risk-normal/caution/high 토큰을 그대로 재사용한다
// (ward-detail-view.tsx의 STATUS_BADGE_CLASS, banchan-recommendation-section.tsx의
// SUITABILITY_CLASS와 동일) — 이 화면만 새 팔레트를 쓰면 같은 "주의/위험" 의미가 앱 안에서
// 두 가지 색으로 표현되어 오히려 헷갈린다.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addMonthsToMonthString,
  BanchanRecommendationItem,
  BanchanRecommendationGenerationStatus,
  BanchanSuitability,
  fetchMonthlyBanchanRecommendation,
  MonthlyBanchanRecommendation,
  WardIdentity,
} from "@/lib/banchan-recommendation";

const SUITABILITY_LABEL: Record<BanchanSuitability, string> = {
  recommended: "추천",
  caution: "주의",
  avoid: "피하기",
};

const SUITABILITY_CLASS: Record<BanchanSuitability, string> = {
  recommended: "bg-risk-normal text-risk-normal-foreground",
  caution: "bg-risk-caution text-risk-caution-foreground",
  avoid: "bg-risk-high text-risk-high-foreground",
};

// risk-normal/caution/high(배경색)은 배지 위에 짙은 텍스트를 얹는 용도라 일부러 아주
// 옅게 잡혀 있다(globals.css) — 글자 없이 작은 점 하나로만 구분해야 하는 달력 칸에 그
// 배경색을 그대로 쓰면 세 등급이 거의 같은 베이지색으로 보여서 정작 "어디를 조심해야
// 하는지"가 한눈에 안 들어온다. 실제 색 구분은 -foreground 쪽(짙은 회갈색/황토색/적갈색)이
// 갖고 있어서, 점은 그 foreground 색을 그대로 채워 쓴다.
const SUITABILITY_DOT_CLASS: Record<BanchanSuitability, string> = {
  recommended: "bg-risk-normal-foreground",
  caution: "bg-risk-caution-foreground",
  avoid: "bg-risk-high-foreground",
};

// 하루에 반찬이 여럿이면 그중 가장 주의가 필요한 등급 하나로 그날 점 색을 정한다(avoid >
// caution > recommended) — "이 날은 한 번이라도 조심할 게 있는지"가 달력 한눈에 보기엔
// 가장 유용한 요약이다.
const SUITABILITY_SEVERITY: Record<BanchanSuitability, number> = {
  avoid: 2,
  caution: 1,
  recommended: 0,
};

function worstSuitability(items: BanchanRecommendationItem[]): BanchanSuitability | null {
  if (items.length === 0) return null;
  return items.reduce<BanchanSuitability>(
    (worst, item) => (SUITABILITY_SEVERITY[item.suitability] > SUITABILITY_SEVERITY[worst] ? item.suitability : worst),
    items[0].suitability
  );
}

// "YYYY-MM-DD" 문자열에 날짜를 더한다. Date를 로컬 타임존으로 파싱하면(new Date("YYYY-MM-DD"))
// 브라우저에 따라 UTC 자정으로 해석돼 로컬에서 하루 밀려 보일 수 있어서, 연/월/일을 직접
// 분해해 UTC 기준으로만 계산한다(생성 자체엔 시각 개념이 없는 순수 날짜 문자열이라 UTC로
// 계산해도 실제 날짜가 안 바뀐다).
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

type DayCell = {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  inTargetMonth: boolean;
  weekStartDate: string;
  generationStatus: BanchanRecommendationGenerationStatus;
  error: string | null;
  items: BanchanRecommendationItem[];
};

function buildDayCells(monthly: MonthlyBanchanRecommendation): DayCell[] {
  const cells: DayCell[] = [];
  for (const week of monthly.weeks) {
    for (let deliveryNumber = 1; deliveryNumber <= 7; deliveryNumber++) {
      const date = addDaysToDateString(week.weekStartDate, deliveryNumber - 1);
      cells.push({
        date,
        dayOfMonth: Number(date.slice(8, 10)),
        inTargetMonth: date.slice(0, 7) === monthly.month,
        weekStartDate: week.weekStartDate,
        generationStatus: week.generationStatus,
        error: week.error,
        items: (week.recommendation?.items ?? []).filter((item) => item.deliveryNumber === deliveryNumber),
      });
    }
  }
  return cells;
}

function TargetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

// 기본으로 펼쳐 보여줄 날짜 — 오늘이 이 달 데이터 안에 있으면 오늘, 없으면(다른 달을 보는
// 중이거나, 이번 달의 첫 몇 칸이 지난달 소속 주라 아직 이번 달로 안 들어온 경우) 완료된 첫
// 날짜, 그것도 없으면 첫 칸.
function pickDefaultDate(days: DayCell[]): string | null {
  const today = todayDateString();
  const fallback =
    days.find((d) => d.date === today) ??
    days.find((d) => d.generationStatus === "done" && d.items.length > 0) ??
    days[0] ??
    null;
  return fallback?.date ?? null;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // getUTCDay()는 일=0..토=6 순서라, WEEKDAY_LABELS(월=0..일=6) 인덱스로 7만큼 회전시킨다.
  const weekday = WEEKDAY_LABELS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  return `${m}월 ${d}일 (${weekday})`;
}

export function BanchanRecommendationCalendar({
  identity,
  monthly,
  polling,
}: {
  identity: WardIdentity;
  /** 항상 "실제 오늘이 속한 달"의 최신 상태 — 폴링 중엔 몇 초마다 갱신된다. 아래에서 다른
   *  달로 넘어가면 그 달의 데이터는 따로 불러오고(otherMonth), 이 prop이 가리키는 달로
   *  돌아오면 다시 이 최신 값을 그대로 쓴다. */
  monthly: MonthlyBanchanRecommendation;
  polling: boolean;
}) {
  const [viewedMonth, setViewedMonth] = useState(monthly.month);
  // otherMonth가 null이면 "아직 안 불러온 달"(로딩), data가 null이면 "불러왔는데 그 달엔
  // 요청한 추천이 없음"(빈 상태) — 이 둘을 구분해야 로딩 중에 잠깐 "빈 상태" 문구가 깜빡이지
  // 않는다. useEffect 안에서 "로딩 시작"을 곧장 setState하지 않고 아예 안 하는 이유는
  // react-hooks/set-state-in-effect 때문 — 대신 "이 달 데이터가 아직 otherMonth에 없다"는
  // 사실 자체를 로딩 중이라는 뜻으로 그대로 쓴다(아래 monthLoading).
  const [otherMonth, setOtherMonth] = useState<{
    month: string;
    data: MonthlyBanchanRecommendation | null;
  } | null>(null);

  // 보고 있는 달이 "실제 오늘이 속한 달"이면 monthly prop을 그대로 쓰고(폴링 갱신도 자동
  // 반영됨), 다른 달로 넘어갔을 때만 그 달의 데이터를 따로 불러온다 — 지나간/앞으로의 달은
  // 폴링 대상이 아니라(백엔드가 generating 상태를 유지할 이유가 없음) 매번 새로 불러올
  // 필요가 없다.
  useEffect(() => {
    if (viewedMonth === monthly.month) return;
    let cancelled = false;
    fetchMonthlyBanchanRecommendation(identity, viewedMonth).then((result) => {
      if (cancelled) return;
      setOtherMonth({ month: viewedMonth, data: result });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMonth, monthly.month, identity.wardId]);

  const isViewingCurrentMonth = viewedMonth === monthly.month;
  const monthLoading = !isViewingCurrentMonth && otherMonth?.month !== viewedMonth;
  const displayedMonthly = isViewingCurrentMonth
    ? monthly
    : otherMonth?.month === viewedMonth
      ? otherMonth.data
      : null;

  const days = useMemo(() => (displayedMonthly ? buildDayCells(displayedMonthly) : []), [displayedMonthly]);
  const weeks = useMemo(() => {
    const chunks: DayCell[][] = [];
    for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
    return chunks;
  }, [days]);

  const [selectedDate, setSelectedDate] = useState<string | null>(() => pickDefaultDate(days));
  // days는 폴링으로 몇 초마다 새 배열로 바뀐다 — 그때마다 선택을 오늘/기본값으로 되돌리면
  // 사용자가 골라둔 날짜가 자꾸 초기화된다. useEffect 대신 렌더 중에 "이전 렌더의 days와
  // 다르면" 조건으로 걸러서 처리한다(React가 문서에서 권장하는 "prop이 바뀔 때 state
  // 조정하기" 패턴) — 지금 선택이 보고 있는 달 안에 여전히 유효하면 그대로 두고, 무효할
  // 때만(월을 옮겼거나 최초 진입) 기본값을 새로 고른다. 최초 마운트분은 위 useState 지연
  // 초기화가 이미 처리하므로, 여기 아래는 "그 이후 days가 실제로 바뀐 경우"만 잡는다 —
  // useState(days)로 prevDays를 잡으면 첫 렌더에 days와 참조가 같아져(reference-equal)
  // 아래 분기가 마운트 시엔 절대 안 도는 게 핵심이다.
  const [prevDays, setPrevDays] = useState(days);
  if (days !== prevDays) {
    setPrevDays(days);
    if (!(selectedDate && days.some((d) => d.date === selectedDate))) {
      setSelectedDate(pickDefaultDate(days));
    }
  }

  const selected = days.find((d) => d.date === selectedDate) ?? null;
  const selectedWeek = selected
    ? displayedMonthly?.weeks.find((w) => w.weekStartDate === selected.weekStartDate)
    : undefined;
  const recommendation = selectedWeek?.recommendation ?? null;
  const hasTargets =
    recommendation != null &&
    (recommendation.targetCalorieKcal != null ||
      recommendation.targetProteinG != null ||
      recommendation.targetSodiumMg != null ||
      recommendation.targetCarbsG != null);

  return (
    <div className="flex flex-col gap-3">
      {polling && isViewingCurrentMonth && (
        <p className="text-xs text-muted-foreground">
          반찬을 고르고 있어요. 완료되는 대로 달력에 자동으로 표시돼요...
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setViewedMonth((m) => addMonthsToMonthString(m, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-foreground">{formatMonthLabel(viewedMonth)}</span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setViewedMonth((m) => addMonthsToMonthString(m, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!isViewingCurrentMonth && (
        <Button
          size="sm"
          variant="ghost"
          className="w-fit self-center text-xs text-muted-foreground"
          onClick={() => setViewedMonth(monthly.month)}
        >
          이번 달로 돌아가기
        </Button>
      )}

      {monthLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : !displayedMonthly || displayedMonthly.weeks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {formatMonthLabel(viewedMonth)}은 아직 요청한 추천이 없어요.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {weeks.map((week) => (
              <div key={week[0]?.weekStartDate} className="grid grid-cols-7 gap-1">
                {week.map((day) => {
                  // 오늘 이전 날짜는 이미 지나간 배송이라, 이번 달을 보는 중일 때만 옅게
                  // 죽이고 점도 안 보여준다 — "구독한 날부터의 식단"처럼 보이게(2026-08-13
                  // 피드백). 지난달을 직접 넘겨서 보는 중이면(isViewingCurrentMonth=false)
                  // 그 달은 원래 전체가 과거라 이 처리를 안 하고 평소처럼 다 보여준다.
                  const isPast = isViewingCurrentMonth && day.date < todayDateString();
                  const dot = !isPast && day.generationStatus === "done" ? worstSuitability(day.items) : null;
                  const isSelected = day.date === selectedDate;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
                      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-xs transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 font-bold text-foreground"
                          : "border-transparent hover:bg-muted/60"
                      } ${!day.inTargetMonth || isPast ? "text-muted-foreground/40" : "text-foreground"}`}
                    >
                      <span>{day.dayOfMonth}</span>
                      {dot && <span className={`h-1.5 w-1.5 rounded-full ${SUITABILITY_DOT_CLASS[dot]}`} />}
                      {!isPast && day.generationStatus === "generating" && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
                      )}
                      {!isPast && day.generationStatus === "failed" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${SUITABILITY_DOT_CLASS.recommended}`} />
              추천
            </span>
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${SUITABILITY_DOT_CLASS.caution}`} />
              주의
            </span>
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${SUITABILITY_DOT_CLASS.avoid}`} />
              피하기
            </span>
          </div>
        </>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3">
          <span className="text-sm font-bold text-foreground">{formatDayLabel(selected.date)}</span>

          {selected.generationStatus === "not_started" && (
            <p className="text-xs text-muted-foreground">아직 생성을 요청하지 않았어요.</p>
          )}
          {selected.generationStatus === "generating" && (
            <p className="text-xs text-muted-foreground">생성 중이에요...</p>
          )}
          {selected.generationStatus === "failed" && (
            <p className="text-xs text-destructive">{selected.error ?? "추천 생성에 실패했어요."}</p>
          )}
          {selected.generationStatus === "done" && selected.items.length === 0 && (
            <p className="text-xs text-muted-foreground">이 날은 배정된 반찬이 없어요.</p>
          )}

          {selected.generationStatus === "done" && selected.items.length > 0 && (
            <>
              {hasTargets && recommendation && (
                <div className="flex flex-wrap gap-4 rounded-lg bg-muted/60 p-3 text-xs">
                  <span className="w-full text-[11px] font-semibold text-muted-foreground">
                    이번 주 목표
                  </span>
                  {recommendation.targetCalorieKcal != null && (
                    <TargetStat label="열량" value={`${Math.round(recommendation.targetCalorieKcal)}kcal`} />
                  )}
                  {recommendation.targetProteinG != null && (
                    <TargetStat label="단백질" value={`${Math.round(recommendation.targetProteinG)}g`} />
                  )}
                  {recommendation.targetSodiumMg != null && (
                    <TargetStat label="나트륨" value={`${Math.round(recommendation.targetSodiumMg)}mg`} />
                  )}
                  {recommendation.targetCarbsG != null && (
                    <TargetStat label="탄수화물" value={`${Math.round(recommendation.targetCarbsG)}g`} />
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {[...selected.items]
                  .sort((a, b) => a.slotIndex - b.slotIndex)
                  .map((item) => (
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

              {recommendation && recommendation.referenceGuidelines.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">이번 주 참고 자료</span>
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
      )}
    </div>
  );
}
