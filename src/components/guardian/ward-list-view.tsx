"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Siren } from "lucide-react";

import { Ward, WardStatus } from "@/lib/wards";
import { fetchGuardianNotifications } from "@/lib/notifications";
import { dismissedSosStore } from "@/lib/sos-store";
import { useLocalStore } from "@/lib/use-store";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

const STATUS_BADGE_CLASS: Record<WardStatus, string> = {
  "확인 필요": "bg-risk-high text-risk-high-foreground",
  관찰중: "bg-risk-caution text-risk-caution-foreground",
  양호: "bg-risk-normal text-risk-normal-foreground",
};

export function WardListView({ name, wards }: { name: string; wards: Ward[] }) {
  const { account } = useSession();
  const needsAttention = wards.filter((w) => w.status === "확인 필요").length;
  const groups = Array.from(new Set(wards.map((w) => w.familyGroup)));

  // 진짜 백엔드 SOS(POST /app/elder/{id}/sos)로 바뀌면서, 홈 화면 배너도 로컬
  // sos-store.ts 대신 notifications-view.tsx와 같은 fetchGuardianNotifications()를
  // 쓴다(2026-08-24, SOS 백엔드 PR#102 연동) — 실패해도(세션 없음 등) 이 배너는 보조
  // 정보라 조용히 숨긴다, 알림 화면 자체는 여전히 에러를 보여준다.
  const [sosItems, setSosItems] = useState<{ id: string; targetName?: string }[]>([]);
  const dismissedSosIds = useLocalStore(dismissedSosStore);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetchGuardianNotifications(account.loginId)
      .then((items) => {
        if (cancelled) return;
        setSosItems(items.filter((i) => i.type === "SOS" && !i.read));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account]);

  // 확인한 SOS는 배너에서도 빠진다 — notifications-view.tsx와 같은 dismissedSosStore.
  const activeSosNames = [
    ...new Set(
      sosItems
        .filter((i) => !dismissedSosIds.includes(i.id))
        .map((i) => i.targetName)
        .filter((n): n is string => Boolean(n))
    ),
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title={`${name}님, 안녕하세요`} subtitle="돌보고 계신 대상자" />

      <div className="flex flex-col gap-4 px-5">
        {activeSosNames.length > 0 && (
          <Link
            href="/guardian/notifications"
            className="flex items-center gap-2 rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-white shadow-sm"
          >
            <Siren className="h-4 w-4 shrink-0 animate-pulse" />
            {activeSosNames.join(", ")}님이 SOS를 보냈어요. 바로 확인하세요.
          </Link>
        )}

        {wards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">
              아직 등록된 대상자가 없어요.
            </p>
            <p className="text-xs text-muted-foreground">
              어르신을 초대하면 식단 · 건강 정보를 여기서 확인할 수 있어요.
            </p>
            <Button size="sm" nativeButton={false} render={<Link href="/guardian/wards/new" />}>
              대상자 추가하기
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">
                  전체 대상자
                </span>
                <span className="text-xl font-extrabold text-foreground">
                  {wards.length}명
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">
                  확인이 필요해요
                </span>
                <span className="text-xl font-extrabold text-destructive">
                  {needsAttention}명
                </span>
              </div>
            </div>

            {groups.map((group) => (
              <div key={group} className="flex flex-col gap-3">
                {groups.length > 1 && (
                  <span className="text-xs font-bold text-muted-foreground">{group}</span>
                )}
                {wards
                  .filter((w) => w.familyGroup === group)
                  .map((ward) => (
                    <Link
                      key={ward.id}
                      href={`/guardian/wards/detail?id=${ward.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-extrabold text-muted-foreground">
                          {ward.name.slice(0, 1)}
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          {/* 이름+관계를 한 줄로 고정 — 글자 사이 gap과 배지 폭까지 겹치면
                              (특히 큰 글씨 모드) 이름이 글자 단위로 줄바꿈되던 문제(2026-08-29
                              사용자 리포트). truncate로 줄바꿈 대신 한 줄 안에서 잘리게 한다. */}
                          <div className="flex items-center gap-0.5 truncate">
                            <span className="font-semibold text-foreground">
                              {ward.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({ward.relationToGuardian})
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {ward.lastMeal.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={STATUS_BADGE_CLASS[ward.status]}>
                          {ward.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
