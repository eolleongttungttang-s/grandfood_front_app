"use client";

import { useEffect, useState } from "react";

import { NotificationItem, fetchGuardianNotifications, notificationBadgeClass } from "@/lib/notifications";
import { acknowledgeSos, sosStore } from "@/lib/sos-store";
import { useLocalStore } from "@/lib/use-store";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NotificationsView() {
  const { account } = useSession();
  const sosEvents = useLocalStore(sosStore);
  // items가 null이면 "아직 응답 안 옴"(로딩 중)이고, 응답이 오면 빈 배열이든 아니든 배열로
  // 바뀐다 — report-view.tsx의 비동기 조회와 같은 패턴(로딩 상태를 별도 boolean으로 안 두고
  // null 여부로 판단).
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SOS는 여전히 로컬 전역 저장소(sos-store.ts)라 여기서 이 보호자의 대상자(wardIds) 것만
  // 걸러서 보여준다. 이상신호/안부확인콜 알림은 이제 실제 백엔드가 로그인한 보호자 토큰으로
  // 이미 본인 대상자 것만 걸러서 주기 때문에(app/guardian/notifications), 클라이언트에서
  // 다시 거를 필요가 없다.
  const guardianWardIds = account?.wardIds ?? [];
  const scopedSosEvents = sosEvents.filter((e) => guardianWardIds.includes(e.wardId));

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

  const sosItems: (NotificationItem & { sosId?: string })[] = scopedSosEvents.map((e) => ({
    id: e.id,
    sosId: e.id,
    date: formatTime(e.timestamp),
    type: "SOS",
    targetName: e.wardName,
    message: `${e.wardName}님이 SOS 버튼을 눌렀어요. 바로 확인해 주세요.`,
    read: e.acknowledged,
  }));

  const loading = items === null && !error;
  const merged = [...sosItems, ...(items ?? [])];

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
        {!loading && !error && merged.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">아직 알림이 없어요.</p>
        )}
        {merged.map((n) => (
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
              {n.type === "SOS" && !n.read && (
                <Button
                  size="sm"
                  className="mt-1 w-fit"
                  onClick={() => acknowledgeSos(n.id)}
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
