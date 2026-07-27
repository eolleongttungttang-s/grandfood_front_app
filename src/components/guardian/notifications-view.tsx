"use client";

import { NotificationItem, notificationBadgeClass } from "@/lib/notifications";
import { acknowledgeSos, sosStore } from "@/lib/sos-store";
import { useLocalStore } from "@/lib/use-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NotificationsView({ items }: { items: NotificationItem[] }) {
  const sosEvents = useLocalStore(sosStore);

  const sosItems: (NotificationItem & { sosId?: string })[] = sosEvents.map((e) => ({
    id: e.id,
    sosId: e.id,
    date: formatTime(e.timestamp),
    type: "SOS",
    targetName: e.wardName,
    message: `${e.wardName}님이 SOS 버튼을 눌렀어요. 바로 확인해 주세요.`,
    read: e.acknowledged,
  }));

  const merged = [...sosItems, ...items];

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="알림" subtitle="대상자 소식을 모아봐요" />

      <div className="flex flex-col gap-2.5 px-5">
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
