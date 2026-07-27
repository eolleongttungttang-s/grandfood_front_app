"use client";

import { NotificationItem, notificationBadgeClass } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/app/top-bar";

export function NotificationsView({ items }: { items: NotificationItem[] }) {
  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="알림" subtitle="대상자 소식을 모아봐요" />

      <div className="flex flex-col gap-2.5 px-5">
        {items.map((n) => (
          <div
            key={n.id}
            className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
