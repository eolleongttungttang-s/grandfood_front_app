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
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/app/expand-toggle";
import { healthProfileStore } from "@/lib/health-profile";
import { useLocalStore } from "@/lib/use-store";
import {
  addDaysToDateString,
  addMonthsToMonthString,
  BanchanRecommendationItem,
  BanchanRecommendationGenerationStatus,
  BanchanSuitability,
  fetchMonthlyBanchanRecommendation,
  MonthlyBanchanRecommendation,
  SUITABILITY_CLASS,
  SUITABILITY_DOT_CLASS,
  SUITABILITY_LABEL,
  todayDateString,
  WardIdentity,
} from "@/lib/banchan-recommendation";

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

// 아래 반찬 카드(item.name text-lg, 영양성분 text-base)와 나란히 보이는데 여긴 text-xs라
// 훨씬 작아 보인다는 피드백(2026-08-18) — 라벨/숫자 모두 반찬 카드와 같은 크기로 맞춘다.
function TargetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-foreground/70">{label}</span>
      <span className="text-xl font-extrabold text-foreground">{value}</span>
    </div>
  );
}

// 기본으로 펼쳐 보여줄 날짜 — 오늘이 이 달 데이터 안에 있으면 오늘을 먼저 고른다. diet-view.tsx
// 상단 "AI 반찬 매칭" 카드(합계 나트륨/단백질/열량)와 "왜 이 조합인가요"가 today-menu.ts를 통해
// 항상 "오늘"(todayDateString()) 기준으로 계산되는데, 예전엔 여기가 "내일"을 기본으로 보여줘서
// 같은 화면에서 카드 합계랑 달력에 보이는 반찬이 서로 다른 날짜라 안 맞아 보였다(2026-08-14
// 피드백, "합친 총 열량이 반찬들이랑 상호작용을 안 하는 것 같다"). 오늘이 없으면(다른 달을
// 보는 중 등) 내일, 그것도 없으면 완료된 첫 날짜, 그마저 없으면 첫 칸.
function pickDefaultDate(days: DayCell[]): string | null {
  const today = todayDateString();
  const tomorrow = addDaysToDateString(today, 1);
  const fallback =
    days.find((d) => d.date === today) ??
    days.find((d) => d.date === tomorrow) ??
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
  surveyHref,
}: {
  identity: WardIdentity;
  /** 항상 "실제 오늘이 속한 달"의 최신 상태 — 폴링 중엔 몇 초마다 갱신된다. 아래에서 다른
   *  달로 넘어가면 그 달의 데이터는 따로 불러오고(otherMonth), 이 prop이 가리키는 달로
   *  돌아오면 다시 이 최신 값을 그대로 쓴다. */
  monthly: MonthlyBanchanRecommendation;
  polling: boolean;
  /** hasTargets가 false일 때(생활정보 미입력) 보여줄 안내에 붙는 "생활 정보 입력하기"
   *  버튼의 이동 경로 — 이용자 본인 화면(diet-view.tsx)은 본인이 직접 입력하러 갈 수 있어
   *  "/user/survey"를 넘긴다. 보호자 화면(ward-detail-view.tsx)은 아직 대상자의 생활
   *  정보를 보호자가 대신 입력/수정할 화면이 없어(이 대상자는 자기 계정으로 직접 입력해야
   *  함) undefined를 넘기면 버튼 없이 안내 문구만 보여준다. */
  surveyHref?: string;
}) {
  const [viewedMonth, setViewedMonth] = useState(monthly.month);
  // 오늘이 속한 달이 아닌 달은 방문할 때마다 조회 결과를 이 캐시에 쌓아둔다 — 달 하나짜리
  // 슬롯(이전 구현)이었을 땐 ◀ ◀ ▶ ▶처럼 왔다 갔다 하면 이미 받아온 달도 매번 다시
  // 네트워크로 불러왔다. 캐시에 월 키가 아직 없으면 "안 불러온 달"(로딩), 있는데 값이
  // null이면 "불러왔는데 그 달엔 요청한 추천이 없음"(빈 상태) — 이 둘을 구분해야 로딩
  // 중에 잠깐 빈 상태 문구가 깜빡이지 않는다.
  const [monthCache, setMonthCache] = useState<Record<string, MonthlyBanchanRecommendation | null>>({});

  // 보고 있는 달이 "실제 오늘이 속한 달"이면 monthly prop을 그대로 쓰고(폴링 갱신도 자동
  // 반영됨), 다른 달로 넘어갔을 때만 그 달의 데이터를 따로 불러온다 — 지나간/앞으로의 달은
  // 폴링 대상이 아니라(백엔드가 generating 상태를 유지할 이유가 없음) 매번 새로 불러올
  // 필요가 없다. 이미 캐시에 있는 달이면(과거에 한 번 방문했던 달로 다시 돌아온 경우)
  // 재요청하지 않는다.
  useEffect(() => {
    if (viewedMonth === monthly.month) return;
    if (viewedMonth in monthCache) return;
    let cancelled = false;
    fetchMonthlyBanchanRecommendation(identity, viewedMonth).then((result) => {
      if (cancelled) return;
      setMonthCache((prev) => ({ ...prev, [viewedMonth]: result }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMonth, monthly.month, identity.wardId, monthCache]);

  const isViewingCurrentMonth = viewedMonth === monthly.month;
  const monthLoading = !isViewingCurrentMonth && !(viewedMonth in monthCache);
  const displayedMonthly = isViewingCurrentMonth ? monthly : (monthCache[viewedMonth] ?? null);

  const days = useMemo(() => (displayedMonthly ? buildDayCells(displayedMonthly) : []), [displayedMonthly]);
  const weeks = useMemo(() => {
    const chunks: DayCell[][] = [];
    for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
    return chunks;
  }, [days]);

  // 월 그리드(요일 줄 + 5주치 칸 + 범례)는 기본으로 접어둔다 — 날짜 칸 자체는 터치 기준을
  // 지키느라 못 줄이니, 대신 필요할 때만 펼쳐보게 해서 평소 화면 길이를 줄인다(2026-08-14
  // 피드백). 접혀있어도 아래 날짜 상세(오늘 반찬)는 그대로 보인다 — 어차피 매일 보는 건
  // "오늘 뭐 먹는지"지 달력 자체가 아니다.
  const [calendarExpanded, setCalendarExpanded] = useState(false);

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
    // monthLoading(다른 달로 넘어갔는데 아직 그 달 데이터를 못 받아온 상태)인 동안은 days가
    // 일시적으로 []다 — goToDate(전날/다음날 버튼, 그리드의 다른 달 패딩 칸)가 selectedDate와
    // viewedMonth를 같이 옮기면, 바로 이 렌더에서 days(=[])엔 방금 옮긴 날짜가 당연히 없으니
    // "무효한 선택"으로 오판해서 null로 초기화해버리고, 그 달 데이터가 실제로 도착했을 때도
    // 이미 null이 된 뒤라 사용자가 정말 가려던 날짜로 못 돌아간다(코드 리뷰 지적). 로딩 중엔
    // 판단을 미루고, 그 달 데이터가 실제로 도착한 뒤에만(monthLoading이 꺼진 뒤) 지금 선택이
    // 그 데이터 안에 있는지 판단한다.
    if (!monthLoading && !(selectedDate && days.some((d) => d.date === selectedDate))) {
      setSelectedDate(pickDefaultDate(days));
    }
  }

  const selected = days.find((d) => d.date === selectedDate) ?? null;
  // 날짜 상세 카드 위쪽의 전날/다음날 이동 버튼 — 달력을 안 펼쳐도 하루씩 넘겨볼 수 있게
  // 한다(2026-08-14 피드백, "달력을 굳이 안 펴고" 요청). buildDayCells가 이번 달 앞뒤로
  // 해당 주(week)까지는 이미 채워 넣어 두므로(달력 마지막 줄에 다음 달 초 며칠이 옅게
  // 보이는 것과 동일 데이터), 대부분의 경우 월 경계를 넘어가도 days 안에 이미 있다. 그
  // 범위 밖으로 더 나가려는 경우에만(가진 데이터가 없음) 버튼을 비활성화한다 — 없는 날짜로
  // selectedDate를 억지로 옮기면, 아래 prevDays 보정 로직이 "이 날짜는 지금 달에 없다"고
  // 판단해 엉뚱한 기본값으로 되돌려버린다.
  const prevDate = selected ? addDaysToDateString(selected.date, -1) : null;
  const nextDate = selected ? addDaysToDateString(selected.date, 1) : null;
  const canGoPrev = prevDate != null && days.some((d) => d.date === prevDate);
  const canGoNext = nextDate != null && days.some((d) => d.date === nextDate);

  // 전날/다음날 버튼이 월 경계를 넘으면(예: 8월 31일 → 9월 1일) selectedDate만 옮기고
  // viewedMonth는 그대로 둬서, 헤더/달력 그리드는 계속 "8월"을 보여주는데 아래 날짜 상세는
  // 9월 데이터를 보여주는 불일치가 있었다(코드 리뷰 지적). 날짜의 월(date.slice(0, 7) —
  // buildDayCells의 inTargetMonth 판정과 같은 방식)이 지금 보는 달과 다르면 같이 옮겨준다.
  function goToDate(date: string) {
    setSelectedDate(date);
    const month = date.slice(0, 7);
    if (month !== viewedMonth) setViewedMonth(month);
  }
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

  // 건강 프로필 저장은 이미 생성된 recommendation을 자동으로 다시 계산하지 않는다(2026-08-18
  // 확인 — 백엔드에 무효화/재계산 로직이 없음, 프론트에서 고칠 수 없는 부분). 그래서 로컬에
  // 저장된 건강정보(키/체중/활동량)가 있는지로 "아직 한 번도 안 입력함"과 "입력은 했는데
  // 아직 반영이 안 됨"을 구분해서, 후자일 땐 "생활 정보 입력하기" 대신 "다시 추천받기를
  // 눌러달라"는 안내로 바꾼다 — 안 그러면 방금 입력하고 돌아왔는데도 똑같이 "입력하면 볼 수
  // 있어요"라는, 이미 한 행동을 또 하라는 것처럼 보이는 문구가 그대로 남는다(사용자 피드백).
  const healthProfiles = useLocalStore(healthProfileStore);
  const localHealthProfile = healthProfiles[identity.wardId];
  const hasEnteredHealthMetricsLocally =
    localHealthProfile?.heightCm != null &&
    localHealthProfile?.weightKg != null &&
    localHealthProfile?.activityLevel != null;

  return (
    // 날짜 칸(터치 대상, aspect-square)은 그대로 두고, 안 누르는 요소들(헤더/요일 줄/여백)만
    // 줄여서 전체 세로 길이를 줄인다 — 어르신 UX 원칙상 실제로 누르는 영역은 절대 안 줄인다
    // (2026-08-14 피드백, ATM 벤치마킹 방침). 컨테이너 gap 3→2, 요일 줄과 날짜 그리드 사이
    // 여백도 같이 좁힌다.
    <div className="flex flex-col gap-2">
      {polling && isViewingCurrentMonth && (
        <p className="text-xs text-muted-foreground">
          반찬을 고르고 있어요. 완료되는 대로 달력에 자동으로 표시돼요...
        </p>
      )}

      {/* 날짜 칸은 못 줄이니, 평소엔 이 버튼 하나로 접어두고 필요할 때만 달력 전체를
          펼친다 — 라벨에 "월 배송"을 그대로 남겨서 접혀있어도 이게 월 단위 배송이라는
          맥락은 계속 보인다. */}
      <ExpandToggle
        expanded={calendarExpanded}
        onToggle={() => setCalendarExpanded((v) => !v)}
        label={`${formatMonthLabel(viewedMonth)} 월 배송 달력`}
        expandLabel="달력 보기"
      />

      {calendarExpanded && (
        <>
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
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] leading-none font-semibold text-muted-foreground">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                {weeks.map((week) => (
                  <div key={week[0]?.weekStartDate} className="grid grid-cols-7 gap-1">
                    {week.map((day) => {
                      // 오늘까지(포함)는 이미 확정된 배송이라, 이번 달을 보는 중일 때만 옅게
                      // 죽이고 점도 안 보여준다 — 구독은 다음날 배송부터 반영되므로 "실제 활성
                      // 식단"은 내일부터라는 게 한눈에 보이게 한다(2026-08-13 피드백). 지난달을
                      // 직접 넘겨서 보는 중이면(isViewingCurrentMonth=false) 그 달은 원래 전체가
                      // 과거라 이 처리를 안 하고 평소처럼 다 보여준다.
                      const isPast = isViewingCurrentMonth && day.date <= todayDateString();
                      const dot = !isPast && day.generationStatus === "done" ? worstSuitability(day.items) : null;
                      const isSelected = day.date === selectedDate;
                      return (
                        <button
                          key={day.date}
                          type="button"
                          // 달력 그리드 마지막 줄엔 다음 달 초 며칠이(또는 첫 줄엔 지난달 말 며칠이)
                          // 옅게 같이 보인다(buildDayCells) — 그 칸을 탭하면 selectedDate만 옮기고
                          // viewedMonth는 그대로라 헤더/그리드는 여전히 원래 달을 보여주는데 아래
                          // 날짜 상세는 다른 달 데이터를 보여주는 불일치가 생긴다. 전날/다음날
                          // 버튼과 같은 이유로 goToDate를 쓴다.
                          onClick={() => goToDate(day.date)}
                          className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-xs transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/10 font-bold"
                              : "border-transparent hover:bg-muted/60"
                          } ${
                            // 선택된 칸(isSelected)의 글자색은 항상 text-foreground여야 한다 — 예전엔
                            // 이 색 판정이 isSelected와 무관하게 따로 돌아서, 기본 선택일이 "오늘"로
                            // 바뀐 뒤(pickDefaultDate) 선택된 오늘 칸에 isPast(오늘까지는 흐리게)
                            // 조건까지 같이 걸려 text-foreground와 text-muted-foreground/40이 동시에
                            // 붙었다. 컴파일된 CSS에서 text-muted-foreground/40이 나중에 정의돼
                            // 이겨버려서, 선택된 칸인데도 숫자가 흐리게 보이는 문제가 있었다(코드
                            // 리뷰 지적). 선택 상태를 항상 우선하도록 분기 순서를 바꿔서 고쳤다.
                            isSelected
                              ? "text-foreground"
                              : !day.inTargetMonth || isPast
                                ? "text-muted-foreground/40"
                                : "text-foreground"
                          }`}
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
        </>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="전날"
              disabled={!canGoPrev}
              onClick={() => prevDate && goToDate(prevDate)}
              className={`flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ${
                canGoPrev ? "text-muted-foreground hover:bg-muted" : "text-muted-foreground/30"
              }`}
            >
              <span className="text-[11px]">전날</span>
              <span className="text-xs font-semibold">{prevDate && formatDayLabel(prevDate)}</span>
            </button>
            <span className="shrink-0 px-2 text-base font-bold text-foreground">
              {formatDayLabel(selected.date)}
            </span>
            <button
              type="button"
              aria-label="다음날"
              disabled={!canGoNext}
              onClick={() => nextDate && goToDate(nextDate)}
              className={`flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ${
                canGoNext ? "text-muted-foreground hover:bg-muted" : "text-muted-foreground/30"
              }`}
            >
              <span className="text-[11px]">다음날</span>
              <span className="text-xs font-semibold">{nextDate && formatDayLabel(nextDate)}</span>
            </button>
          </div>

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
              {recommendation && hasTargets && (
                // "이번 주 목표"라고 부르면 주마다 값이 바뀔 것처럼 보이지만, 실제로는
                // 건강 프로필(키/체중/활동 수준 등)이 그대로면 매주 같은 값이 나오는 개인
                // 고정 하루 목표다(BMR/TDEE + KDRI 계산, 주 단위 변동 로직 없음 — 2026-08-13
                // 피드백, "왜 매주 목표가 안 바뀌냐"). 라벨을 "나의 하루 목표"로 바꿔서 매주
                // 달라지는 값이라는 오해를 없앤다.
                <div className="rounded-lg bg-muted/60 p-3">
                  <span className="mb-2 block text-base font-bold text-foreground">
                    나의 하루 목표
                  </span>
                  <div className="grid grid-cols-2 gap-y-3">
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
                </div>
              )}

              {recommendation && !hasTargets && (
                // 건강 프로필(성별/키/체중/활동량)이 하나라도 비어있으면 백엔드가 이 4개
                // 목표치를 전부 null로 내려주는데(health/service.py _try_calculate_
                // nutrient_targets), 예전엔 이 카드가 그냥 통째로 사라져서 "왜 없지"를
                // 알 방법이 없었다(2026-08-18 피드백). 왜 없는지 + 채우러 갈 버튼을 그
                // 자리에 보여준다. 보호자 화면(surveyHref 없음)은 대상자 본인 계정으로만
                // 입력 가능해 버튼 없이 안내 문구만 보여준다.
                //
                // 건강 프로필을 저장해도 이미 만들어진 recommendation이 자동으로 다시
                // 계산되지는 않는다(백엔드에 그 로직이 없음, 2026-08-18 확인) — 그래서
                // hasEnteredHealthMetricsLocally로 "입력은 이미 했는데 반영만 안 된" 경우를
                // 따로 구분한다. 안 그러면 방금 입력하고 돌아와도 "입력하면 볼 수 있어요"라는
                // 이미 한 행동을 또 하라는 문구가 그대로 남고, "다시 추천받기"를 눌러야
                // 반영된다는 것도 알 방법이 없다(사용자 피드백).
                <div className="flex flex-col items-start gap-2 rounded-lg bg-muted/60 p-3">
                  <span className="text-base font-bold text-foreground">나의 하루 목표</span>
                  {hasEnteredHealthMetricsLocally ? (
                    <p className="text-sm text-foreground">
                      입력한 생활 정보를 반영하려면 위 &quot;다시 추천받기&quot;를 눌러주세요
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-foreground">생활정보를 입력하면 하루 목표를 볼 수 있어요</p>
                      {surveyHref && (
                        <Button size="sm" variant="outline" className="h-9" nativeButton={false} render={<Link href={surveyHref} />}>
                          생활 정보 입력하기
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 7080 사용자 UX는 은행 ATM처럼 화면 자체가 설명이 되어야 한다는 방침(2026-08-14
                  피드백) — item.reason(반찬별 문장)을 여기서도 또 보여주면, 위 "왜 이 조합인가요"
                  카드(today-menu.ts가 이 항목들의 reason을 그대로 모아 보여줌)와 같은 문장이
                  한 화면에 두 번 나온다. 여기서는 반찬 하나를 식별하는 데 필요한 최소 정보
                  (분류 · 100g당 영양성분)만 보여주고, "왜 이 조합인지"는 그 카드 하나에 맡긴다. */}
              <div className="flex flex-col gap-1.5">
                {[...selected.items]
                  .sort((a, b) => a.slotIndex - b.slotIndex)
                  .map((item) => (
                    <div key={item.banchanId} className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-bold text-foreground">{item.name}</span>
                        <Badge className={SUITABILITY_CLASS[item.suitability]}>
                          {SUITABILITY_LABEL[item.suitability]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-base text-foreground/80">
                        <span>{item.category}</span>
                        {item.caloriePer100g != null && <span>{item.caloriePer100g}kcal/100g</span>}
                        {item.proteinPer100g != null && <span>단백질 {item.proteinPer100g}g</span>}
                        {item.sodiumPer100g != null && <span>나트륨 {item.sodiumPer100g}mg</span>}
                        {item.carbsPer100g != null && <span>탄수 {item.carbsPer100g}g</span>}
                      </div>
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
