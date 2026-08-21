"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";

export interface ButtonSelectOption<T extends string> {
  value: T;
  label: string;
}

// 관계/성별처럼 "여러 개 중 하나를 버튼으로 고르는" 선택형 필드에서 반복되던 패턴을 하나로
// 모았다 — 화면마다 따로 구현하면 터치 영역(h-11, 최소 44px)이나 role="group"/aria-pressed
// 같은 접근성 속성을 매번 손으로 맞춰야 해서 하나라도 놓치면 화면 간 동작·접근성이 어긋난다.
export function ButtonSelectGroup<T extends string>({
  label,
  labelClassName = "text-foreground",
  options,
  value,
  onChange,
  columns = 2,
  completedValues,
}: {
  label: string;
  /** 어두운 배경(tone="sidebar" 카드 등) 위에 놓일 때 라벨 글자색을 바꿔야 하는 호출부용 —
   *  기본값은 지금까지 쓰던 밝은 배경 기준 색 그대로. */
  labelClassName?: string;
  options: readonly ButtonSelectOption<T>[];
  value: T | "";
  onChange: (next: T) => void;
  columns?: 2 | 3;
  /** "이미 끝난 항목"을 흐리게 구분 표시(선택은 그대로 가능, 비활성화 아님) — diet-view.tsx의
   *  끼니 선택처럼 "완료했지만 다시 눌러볼 수 있어야 하는" 옵션이 있는 호출부용. 지정 안 하면
   *  기존 동작(전부 outline/default 2가지 상태) 그대로. */
  completedValues?: readonly T[];
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={`text-sm leading-none font-medium ${labelClassName}`}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className={`grid gap-2 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          const isCompleted = !isSelected && completedValues?.includes(option.value);
          return (
            <Button
              key={option.value}
              type="button"
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              className={`h-11 ${isCompleted ? "opacity-50" : ""}`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
