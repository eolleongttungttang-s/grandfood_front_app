"use client";

import { useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();
// 어르신 서비스라 최근 110여 년을 커버 — 최신 연도부터 내림차순으로 둬서, select 포커스 후
// 연도 숫자를 타이핑하면 브라우저가 알아서 그 옵션으로 바로 점프한다(수십 년 스크롤 불필요).
const YEARS = Array.from({ length: 110 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const selectClassName =
  "h-11 rounded-md border border-input bg-transparent px-2 text-sm text-foreground";

// 생년월일 입력용 연/월/일 드롭다운 3개. 네이티브 <input type="date">의 달력 위젯은 어르신
// 생년월일처럼 수십 년 전 날짜를 고를 때 연도를 한 칸씩 눌러 넘겨야 해서 불편하다 — 여기선
// 각 값을 select로 분리해 바로 선택하거나(터치) 숫자를 타이핑해 점프할 수 있게(키보드) 한다.
export function BirthDateSelect({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  /** "" 또는 "YYYY-MM-DD" */
  value: string;
  onChange: (value: string) => void;
}) {
  const [y, m, d] = value ? value.split("-").map(Number) : [undefined, undefined, undefined];
  const [year, setYear] = useState<number | undefined>(y);
  const [month, setMonth] = useState<number | undefined>(m);
  const [day, setDay] = useState<number | undefined>(d);

  function apply(
    nextYear: number | undefined,
    nextMonth: number | undefined,
    nextDay: number | undefined
  ) {
    // 월/연도가 바뀌어서 이전에 고른 일(day)이 그 달엔 없는 날짜가 되면(예: 31일을 고른 뒤
    // 4월로 변경) 그 달의 마지막 날로 당겨준다 — 안 그러면 존재하지 않는 날짜(4월 31일 등)가
    // 그대로 제출될 수 있다.
    const maxDay = nextYear && nextMonth ? daysInMonth(nextYear, nextMonth) : 31;
    const clampedDay = nextDay && nextDay > maxDay ? maxDay : nextDay;

    setYear(nextYear);
    setMonth(nextMonth);
    setDay(clampedDay);
    onChange(
      nextYear && nextMonth && clampedDay ? `${nextYear}-${pad(nextMonth)}-${pad(clampedDay)}` : ""
    );
  }

  const days = Array.from(
    { length: year && month ? daysInMonth(year, month) : 31 },
    (_, i) => i + 1
  );

  return (
    <div className="flex gap-2">
      <select
        id={`${idPrefix}-year`}
        aria-label="태어난 연도"
        value={year ?? ""}
        onChange={(e) => apply(e.target.value ? Number(e.target.value) : undefined, month, day)}
        className={`${selectClassName} flex-[1.3]`}
        required
      >
        <option value="">연도</option>
        {YEARS.map((v) => (
          <option key={v} value={v}>
            {v}년
          </option>
        ))}
      </select>
      <select
        id={`${idPrefix}-month`}
        aria-label="태어난 월"
        value={month ?? ""}
        onChange={(e) => apply(year, e.target.value ? Number(e.target.value) : undefined, day)}
        className={`${selectClassName} flex-1`}
        required
      >
        <option value="">월</option>
        {MONTHS.map((v) => (
          <option key={v} value={v}>
            {v}월
          </option>
        ))}
      </select>
      <select
        id={`${idPrefix}-day`}
        aria-label="태어난 일"
        value={day ?? ""}
        onChange={(e) => apply(year, month, e.target.value ? Number(e.target.value) : undefined)}
        className={`${selectClassName} flex-1`}
        required
      >
        <option value="">일</option>
        {days.map((v) => (
          <option key={v} value={v}>
            {v}일
          </option>
        ))}
      </select>
    </div>
  );
}
