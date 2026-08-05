"use client";

import { NotificationItem, notificationBadgeClass } from "@/lib/notifications";
import { acknowledgeSos, sosStore } from "@/lib/sos-store";
import { useLocalStore } from "@/lib/use-store";
import { useSession } from "@/lib/session";
import { getWard } from "@/lib/wards";
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
  const { account } = useSession();
  const sosEvents = useLocalStore(sosStore);

  // 알림 목록(GUARDIAN_NOTIFICATIONS)과 SOS 이벤트는 전역 저장소라 손대지 않고, 여기서
  // 지금 로그인한 보호자가 실제로 맡은 대상자(wardIds) 것만 걸러서 보여준다. 기존
  // 목업 계정(gf-guardian01)은 001/006/008을 다 갖고 있어서 걸러도 원래 보이던 항목이
  // 그대로 보이고, 새로 가입한 보호자는 자기 대상자와 무관한 남의 알림을 안 보게 된다.
  // targetName이 없는 항목(예: "공지")은 특정 대상자와 무관하니 모두에게 보여준다.
  const guardianWardIds = account?.wardIds ?? [];
  const guardianWardNames = new Set(
    guardianWardIds
      .map((id) => getWard(id)?.name)
      .filter((name): name is string => Boolean(name))
  );

  const scopedSosEvents = sosEvents.filter((e) => guardianWardIds.includes(e.wardId));
  const scopedItems = items.filter((n) => !n.targetName || guardianWardNames.has(n.targetName));

  const sosItems: (NotificationItem & { sosId?: string })[] = scopedSosEvents.map((e) => ({
    id: e.id,
    sosId: e.id,
    date: formatTime(e.timestamp),
    type: "SOS",
    targetName: e.wardName,
    message: `${e.wardName}님이 SOS 버튼을 눌렀어요. 바로 확인해 주세요.`,
    read: e.acknowledged,
  }));

  const merged = [...sosItems, ...scopedItems];

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
