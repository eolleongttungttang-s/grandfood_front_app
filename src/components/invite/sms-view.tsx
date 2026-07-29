"use client";

import Link from "next/link";
import { Send } from "lucide-react";

import { InviteRequest } from "@/lib/invite";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

export function SmsView({ invite }: { invite: InviteRequest }) {
  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="문자함" subtitle="어르신 휴대폰" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">GrandFood</span>
            <span className="text-xs text-muted-foreground">{invite.sentAt}</span>
          </div>
          <p className="text-base leading-relaxed text-foreground">
            [GrandFood] {invite.elderName} 어르신, 자녀{" "}
            <b className="text-accent">{invite.guardianName}</b>님이 도시락 배송
            알림 서비스를 신청했어요. 아래를 눌러 확인해주세요.
          </p>
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href="/invite/consent" />}
          >
            <Send />
            확인하러 가기
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          앱 설치 없이 문자 속 링크만 눌러도 돼요
        </p>
      </div>
    </div>
  );
}
