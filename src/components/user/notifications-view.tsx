"use client";

import { useEffect, useState } from "react";

import {
  NotificationItem,
  fetchElderNotifications,
  fetchElderStreakNotification,
  markNotificationsSeen,
  notificationBadgeClass,
} from "@/lib/notifications";
import { Ward } from "@/lib/wards";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/app/top-bar";

// home-view.tsx가 예전엔 "안내 사항"/완식 스트릭 카드를 화면에 늘 띄워뒀는데, 배송 예정과
// 달리 매일 훑어야 하는 정보가 아니라 "궁금할 때 들어가 보는" 정보라 화면만 길게 만들었다
// (2026-08-21 피드백, 배민 배송 조회 방식과 비교). guardian/notifications-view.tsx와 같은
// 패턴으로 별도 화면으로 뺐다 — 다만 여기는 보호자의 SOS 확인 액션이 없다(어르신 본인
// 알림엔 해당 없음). 완식 스트릭은 백엔드 알림이 아니라 프론트 합성 항목이라(notifications.ts
// 상단 주석 참고) guardian의 SOS(로컬 합성)와 같은 방식으로 맨 앞에 따로 붙인다.
export function NotificationsView({ ward }: { ward: Ward }) {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [streak, setStreak] = useState<NotificationItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchElderNotifications({ mockWardId: ward.id })
      .then((result) => {
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
    fetchElderStreakNotification({
      mockWardId: ward.id,
      name: ward.name,
      age: ward.age,
      address: ward.address,
    }).then((result) => {
      if (!cancelled) setStreak(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

  const loading = items === null && !error;
  const merged = [...(streak ? [streak] : []), ...(items ?? [])];

  // 이 화면을 열어서 목록을 실제로 본 시점에, 지금까지 온 항목을 전부 "본 것"으로 기록한다
  // — home-view.tsx의 종 아이콘 배지가 이 기록을 기준으로 켜지므로, 여기 한 번 들어오면
  // 그때까지 있던 항목으로는 배지가 다시 안 켜진다(2026-08-21 피드백).
  useEffect(() => {
    markNotificationsSeen(ward.id, merged.map((n) => n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward.id, items, streak]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="알림" subtitle="안내 사항을 모아봐요" />

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
            className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
            <div className={`flex flex-1 flex-col gap-1 ${n.read ? "pl-5" : ""}`}>
              <Badge className={`${notificationBadgeClass(n.type)} w-fit`}>{n.type}</Badge>
              <p className="text-sm text-foreground">{n.message}</p>
              <span className="text-xs text-muted-foreground">{n.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
