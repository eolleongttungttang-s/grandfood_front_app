"use client";

// 키/몸무게/혈압/혈당처럼 정확한 숫자 하나를 고르는 입력에 쓴다. BirthDateSelect와 같은 이유로
// 네이티브 <input type="number"> 키보드 대신 select를 쓴다 — 손가락으로 굴려서 고르거나(모바일
// OS의 휠피커), 숫자를 타이핑해 바로 점프할 수도 있어서(키보드) 70·80대에게 더 쉽다.
export function NumberWheelSelect({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
}) {
  const options: number[] = [];
  for (let v = min; v <= max; v += step) options.push(Number(v.toFixed(2)));

  return (
    <select
      id={id}
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="h-14 w-full rounded-xl border border-input bg-transparent px-4 text-lg text-foreground"
    >
      <option value="">선택 안 함</option>
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
          {unit}
        </option>
      ))}
    </select>
  );
}
