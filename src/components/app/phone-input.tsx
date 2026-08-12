"use client";

import { useRef } from "react";

import { Input } from "@/components/ui/input";
import { formatKoreanPhoneNumberWithCursor } from "@/lib/phone-format";

// formatKoreanPhoneNumber를 직접 쓰는 <Input>은 onChange마다 값을 통째로 재생성해서 커서가
// 끝으로 튄다(phone-format.ts 주석 참고) — 이 컴포넌트가 그 재생성 후 커서 복원까지 한 번에
// 처리한다. 4곳(signup/consent/ward-invite/care-survey)에 같은 로직을 복제하는 대신 여기
// 하나로 모았다.
type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function PhoneInput({ value, onChange, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cursorPos = e.target.selectionStart ?? e.target.value.length;
    const { formatted, cursor } = formatKoreanPhoneNumberWithCursor(e.target.value, cursorPos);
    onChange(formatted);
    // onChange가 부모 state를 바꾸고 리렌더링된 뒤에야 새 value가 실제 DOM에 반영되므로,
    // 커서 복원도 그다음 프레임으로 미룬다 — 지금 당장 설정하면 리렌더링이 덮어써버린다.
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  return <Input ref={inputRef} value={value} onChange={handleChange} {...props} />;
}
