"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatJusoAddress, openJusoAddressSearch } from "@/lib/juso-address";

// 도로명주소 팝업 검색으로 채우되, 입력창 자체는 계속 직접 수정 가능하게 둔다 — 검색
// 팝업이 juso.go.kr 등록 도메인 문제 등으로 실패해도 주소 입력 자체는 막히지 않아야
// 한다(2026-08-26, 회원가입·마이페이지 거주지 입력을 도로명주소 검색으로 바꿔달라는
// 요청). Input은 그대로 두고 옆에 "주소 검색" 버튼만 얹는 최소 변경.
export function AddressSearchField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (address: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="address-line1"
          placeholder="주소 검색을 눌러주세요"
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => openJusoAddressSearch((result) => onChange(formatJusoAddress(result)))}
        >
          <Search />
          주소 검색
        </Button>
      </div>
    </div>
  );
}
