"use client";

import { useEffect, useState } from "react";

import { NotificationItem, fetchGuardianNotifications, notificationBadgeClass } from "@/lib/notifications";
import { acknowledgeSosNotification, dismissedSosStore } from "@/lib/sos-store";
import { useLocalStore } from "@/lib/use-store";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

export function NotificationsView() {
  const { account } = useSession();
  // items가 null이면 "아직 응답 안 옴"(로딩 중)이고, 응답이 오면 빈 배열이든 아니든 배열로
  // 바뀐다 — report-view.tsx의 비동기 조회와 같은 패턴(로딩 상태를 별도 boolean으로 안 두고
  // null 여부로 판단). SOS도 이제 이 목록에 그대로 섞여서 온다(POST /app/elder/{id}/sos로
  // 만들어진 health_alerts 행을 fetchGuardianNotifications가 다른 이상신호와 똑같이
  // 읽어온다) — 예전처럼 로컬 sos-store.ts를 따로 합칠 필요가 없다(2026-08-24, SOS
  // 백엔드 PR#102 연동).
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dismissedSosIds = useLocalStore(dismissedSosStore);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetchGuardianNotifications(account.loginId)
      .then((result) => {
        // 이전 시도(예: account가 바뀌어 effect가 재실행된 경우)에서 남은 에러가 있으면
        // 같이 지운다 — 안 그러면 재시도가 성공해도 옛 에러 배너가 새로 온 목록 위에
        // 계속 남는다.
        if (!cancelled) {
          setItems(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "알림을 불러오지 못했어요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const loading = items === null && !error;
  // 확인한 SOS는 이 브라우저에서 다시 안 보이게 감춘다(sos-store.ts 상단 주석 참고 —
  // 백엔드 상태를 못 바꾸니 로컬로만 처리).
  const notifications = (items ?? []).filter((n) => !dismissedSosIds.includes(n.id));

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="알림" subtitle="대상자 소식을 모아봐요" />

      <div className="flex flex-col gap-2.5 px-5">
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">알림을 불러오는 중이에요...</p>
        )}
        {!loading && error && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && notifications.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">아직 알림이 없어요.</p>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex gap-3 rounded-2xl border p-4 shadow-sm ${
              n.type === "SOS" && !n.read
                ? "border-destructive bg-destructive/5"
                : "border-border bg-card"
            }`}
          >
            {!n.read && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            )}
            <div className={`flex flex-1 flex-col gap-1 ${n.read ? "pl-5" : ""}`}>
              <div className="flex items-center gap-2">
                <Badge className={notificationBadgeClass(n.type)}>{n.type}</Badge>
                {n.targetName && (
                  <span className="text-sm font-semibold text-foreground">
                    {n.targetName}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground">{n.message}</p>
              <span className="text-xs text-muted-foreground">{n.date}</span>
              {n.type === "SOS" && !n.read && n.elderId && account && (
                <Button
                  size="sm"
                  className="mt-1 w-fit"
                  onClick={() => acknowledgeSosNotification(n.id, n.elderId!, account.name)}
                >
                  확인했어요
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
