"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

export function DeclinedView({ guardianName }: { guardianName: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="신청 취소" subtitle="GrandFood" />

      <div className="flex flex-col items-center gap-4 px-5 pt-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-accent">
          <Check className="h-7 w-7" />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-lg leading-relaxed text-foreground">
            알겠어요, 시작하지 않을게요
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            입력됐던 성함·연락처·주소 정보를
            <br />
            지금 바로 삭제했어요
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-2xl bg-muted p-5 text-left">
          <span className="text-sm text-muted-foreground line-through">성함, 연락처</span>
          <span className="text-sm text-muted-foreground line-through">배송지 주소</span>
          <p className="pt-1 text-xs text-muted-foreground">
            <b className="font-semibold text-foreground">{guardianName}</b>님께는
            거부 사실만 전달돼요 (내용은 전달되지 않아요)
          </p>
        </div>

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/invite/consent" />}
        >
          다시 생각해볼게요
        </Button>
      </div>
    </div>
  );
}
