"use client";

import { useSession } from "@/lib/session";
import { getWard, getWardDetail } from "@/lib/wards";
import { HomeView } from "@/components/user/home-view";
import { TopBar } from "@/components/app/top-bar";

export default function UserHomePage() {
  const { account } = useSession();
  const ward = account?.selfWardId ? getWard(account.selfWardId) : undefined;

  if (!account) return null;

  if (!ward) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title={`${account.name}님, 환영합니다`} subtitle="가입이 완료되었어요" />
        <div className="flex flex-col gap-2 px-5">
          <p className="text-base font-semibold text-foreground">이용자 정보가 등록되었어요.</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            배송과 식사 기록은 대상자 정보가 연결된 뒤 이용할 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  const detail = getWardDetail(ward);
  return <HomeView name={account.name} ward={ward} detail={detail} account={account} />;
}
