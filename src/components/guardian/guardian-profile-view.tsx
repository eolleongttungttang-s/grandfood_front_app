"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Copy, LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Account } from "@/lib/auth";
import { Ward } from "@/lib/wards";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/app/top-bar";
import { useSession } from "@/lib/session";
import { PLANS, subscriptionStore } from "@/lib/subscription";
import { useLocalStore } from "@/lib/use-store";

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const currentPlanId = useLocalStore(subscriptionStore);
  const currentPlan = PLANS.find((p) => p.id === currentPlanId);

  function submitAddWard() {
    const trimmed = addName.trim();
    if (!trimmed) return;
    toast.success(`${trimmed}님 등록 요청을 보냈어요. 담당자 확인 후 연결돼요.`);
    setAddName("");
    setAddOpen(false);
  }

  function createInvite() {
    const code = randomInviteCode();
    setInviteCode(code);
  }

  function copyInvite() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
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
              href={`/guardian/wards/${w.id}`}
              className="flex items-center justify-between rounded-lg py-1.5 text-sm"
            >
              <span className="text-foreground">
                {w.name} <span className="text-muted-foreground">({w.relationToGuardian})</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          {!addOpen ? (
            <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={() => setAddOpen(true)}>
              대상자 추가하기
            </Button>
          ) : (
            <div className="mt-1 flex gap-2">
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAddWard();
                }}
                placeholder="등록할 어르신 성함"
              />
              <Button size="sm" onClick={submitAddWard}>
                요청
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">가족과 함께 보기</span>
          <p className="text-xs text-muted-foreground">
            형제자매도 초대 코드로 같은 대상자의 알림을 함께 받을 수 있어요.
          </p>
          {inviteCode ? (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-sm font-bold tracking-widest text-foreground">
                {inviteCode}
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
              미응답 · 방문 · 검진 알림을 받아요
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
