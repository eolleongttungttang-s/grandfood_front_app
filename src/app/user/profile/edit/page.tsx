"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/lib/session";
import { updateAccountBirthDate } from "@/lib/auth";
import { calculateAge, getWard, updateWard } from "@/lib/wards";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TopBar } from "@/components/app/top-bar";
import { AddressSearchField } from "@/components/app/address-search-field";
import { BirthDateSelect } from "@/components/app/birth-date-select";

// "생활 정보 다시 입력하기"(user/survey/page.tsx)와 짝이 되는 화면 — 그쪽은 식사 횟수/
// 동거형태/건강 프로필을 다루고, 여기는 프로필 맨 위 "기본 정보" 카드(나이/거주지)를
// 다룬다. 예전엔 이 두 필드를 고칠 방법이 아예 없었다(가입 시 한 번 입력하면 끝, 2026-08-18
// 피드백). 처음엔 나이를 숫자로 직접 입력받았는데, 회원가입 화면과 입력 방식이 달라서
// 혼란스럽다는 피드백을 받아 signup/page.tsx와 똑같은 BirthDateSelect(연/월/일 스크롤)로
// 바꿨다. Ward.age는 생년월일이 아니라 숫자로만 저장되므로(wards.ts), 제출 시점에
// calculateAge()로 나이를 계산해서 그 숫자만 Ward에 저장한다 — signup의 createSelfWard가
// 하는 것과 동일한 변환이다. 생년월일 자체(문자열)는 계정(Account.birthDate, 가입 시
// registerAccount가 이미 저장해둔 값)을 그대로 채워서 시작하고, 저장 시
// updateAccountBirthDate로 갱신한다 — 예전엔 이 화면을 열 때마다 빈 선택창부터 다시
// 골라야 했다(2026-08-26 피드백 — "생년월일은 초기화될 필요가 없잖아").
export default function UserProfileEditPage() {
  const router = useRouter();
  const { account } = useSession();
  const wardId = account?.selfWardId;
  const ward = wardId ? getWard(wardId) : undefined;

  const [birthDate, setBirthDate] = useState(account?.birthDate ?? "");
  const [address, setAddress] = useState(ward?.address ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!account || !wardId || !ward) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!birthDate) {
      setError("생년월일을 선택해주세요.");
      return;
    }
    if (!address.trim()) {
      setError("거주지를 입력해주세요.");
      return;
    }

    updateWard(wardId as string, { age: calculateAge(birthDate), address: address.trim() });
    updateAccountBirthDate(account!.loginId, birthDate);
    toast.success("기본 정보를 수정했어요.");
    router.push("/user/profile");
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="기본 정보 수정" subtitle="생년월일과 거주지를 고쳐주세요" />
      <main className="flex flex-1 flex-col px-5 py-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-edit-birth-date-year">생년월일</Label>
            <BirthDateSelect idPrefix="profile-edit-birth-date" value={birthDate} onChange={setBirthDate} />
          </div>
          <AddressSearchField id="profile-edit-address" label="거주지" value={address} onChange={setAddress} required />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="mt-2">
            저장하기
          </Button>
        </form>
      </main>
    </div>
  );
}
