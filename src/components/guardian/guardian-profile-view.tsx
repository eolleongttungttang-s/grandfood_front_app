"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Copy, LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Account } from "@/lib/auth";
import { fetchGuardianOwnUsers, getCachedBackendWardId } from "@/lib/backend-auth";
import { Ward } from "@/lib/wards";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/app/top-bar";
import { useSession } from "@/lib/session";
import { PLANS, subscriptionStore } from "@/lib/subscription";
import { createGuardianInvite, guardianInviteStore } from "@/lib/guardian-invite";
import { useLocalStore } from "@/lib/use-store";

export function GuardianProfileView({
  account,
  wards,
}: {
  account: Account;
  wards: Ward[];
}) {
  const router = useRouter();
  const { logout } = useSession();
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  // useState로만 관리하면 새로고침할 때 발급받은 코드가 사라졌었는데, 다른 store들처럼
  // localStorage 기반 store(guardian-invite.ts)로 바꿔서 새로고침해도 유지되게 했다.
  const invite = useLocalStore(guardianInviteStore);
  const currentPlanId = useLocalStore(subscriptionStore);
  const currentPlan = PLANS.find((p) => p.id === currentPlanId);
  // 로컬 wards 목록 자체는 그대로 두고(백엔드 응답엔 담당 매장/식사기록 같은 이 앱의 목업
  // 전용 필드가 없어서 화면을 통째로 못 채운다), GET /users로 실제 서버에도 대상자가
  // 만들어져 있는지만 확인해서 "서버 연동됨" 표시에 쓴다.
  const [linkedBackendWardIds, setLinkedBackendWardIds] = useState<Set<string>>(new Set());
  // wards는 부모(page.tsx)가 렌더마다 getWards().filter(...)로 새로 만드는 배열이라 참조가
  // 매번 바뀐다 — 그대로 deps에 넣으면 렌더마다 재조회한다. report-view.tsx의
  // deficiencyKey/leftoverKey와 같은 방식으로, "실제로 대상자 목록이 달라졌을 때만" 값이
  // 바뀌는 문자열 키로 뽑아써서 안정적인 의존성으로 쓴다 — account.loginId만 보면 같은
  // 계정으로 로그인한 채 대상자를 추가/제거해도 이 effect가 다시 안 도는 문제가 있었다.
  const wardIdsKey = wards.map((w) => w.id).join(",");

  useEffect(() => {
    let cancelled = false;
    fetchGuardianOwnUsers(account.loginId).then((users) => {
      if (cancelled) return;
      const backendUserIds = new Set(users.map((u) => u.userId));
      const linked = new Set(
        wards
          .filter((w) => {
            const backendId = getCachedBackendWardId(w.id);
            return backendId !== null && backendUserIds.has(backendId);
          })
          .map((w) => w.id)
      );
      setLinkedBackendWardIds(linked);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.loginId, wardIdsKey]);

  async function createInvite() {
    await createGuardianInvite({ wardIds: wards.map((w) => w.id) });
  }

  function copyInvite() {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code);
    toast.success("초대 코드를 복사했어요.");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="마이" subtitle="내 정보와 앱 설정" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-muted text-base font-bold text-muted-foreground">
              {account.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-foreground">
              {account.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {account.org} · {account.phone}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">돌보고 있는 대상자</span>
          {wards.map((w) => (
            <Link
              key={w.id}
              href={`/guardian/wards/detail?id=${w.id}`}
              className="flex items-center justify-between rounded-lg py-1.5 text-sm"
            >
              <span className="flex items-center gap-1.5 text-foreground">
                {w.name} <span className="text-muted-foreground">({w.relationToGuardian})</span>
                {linkedBackendWardIds.has(w.id) && (
                  <Badge variant="secondary" className="text-[10px]">
                    서버 연동됨
                  </Badge>
                )}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-fit"
            nativeButton={false}
            render={<Link href="/guardian/wards/new" />}
          >
            대상자 추가하기
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">가족과 함께 보기</span>
          <p className="text-xs text-muted-foreground">
            형제자매도 초대 코드로 같은 대상자의 알림을 함께 받을 수 있어요.
          </p>
          {invite ? (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-sm font-bold tracking-widest text-foreground">
                {invite.code}
              </span>
              <Button variant="ghost" size="sm" onClick={copyInvite}>
                <Copy />
                복사
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-fit" onClick={createInvite}>
              초대 코드 만들기
            </Button>
          )}
        </div>

        <Link
          href="/guardian/subscription"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Wallet className="h-4 w-4 text-accent" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">구독 관리</span>
              <span className="text-xs text-muted-foreground">
                {currentPlan?.name ?? "스탠다드"} 플랜 이용중
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">알림 받기</span>
            <span className="text-xs text-muted-foreground">
              미응답 · 배송 · 잔반이상 알림을 받아요
            </span>
          </div>
          <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
        </div>

        <Button
          variant="ghost"
          className="w-full justify-center text-destructive hover:text-destructive"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
    </div>
  );
}
