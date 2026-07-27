export type NotificationType = "미응답" | "검진" | "방문" | "식단변경" | "공지";

export type NotificationItem = {
  id: string;
  date: string;
  type: NotificationType;
  targetName?: string;
  message: string;
  read: boolean;
};

const TYPE_STYLE: Record<NotificationType, string> = {
  미응답: "bg-risk-high text-risk-high-foreground",
  검진: "bg-secondary text-secondary-foreground",
  방문: "bg-risk-normal text-risk-normal-foreground",
  식단변경: "bg-risk-caution text-risk-caution-foreground",
  공지: "bg-muted text-muted-foreground",
};

export function notificationBadgeClass(type: NotificationType) {
  return TYPE_STYLE[type];
}

export const GUARDIAN_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    date: "07.27 09:10",
    type: "미응답",
    targetName: "박순자",
    message: "3일째 식사 확인 응답이 없어요. 안부를 확인해 주세요.",
    read: false,
  },
  {
    id: "n2",
    date: "07.26 18:40",
    type: "미응답",
    targetName: "한상옥",
    message: "4일째 미응답으로 담당 사회복지사가 방문을 예정했어요.",
    read: false,
  },
  {
    id: "n3",
    date: "07.25 11:20",
    type: "방문",
    targetName: "윤태식",
    message: "8월 2일 담당자 전화 확인이 예정되어 있어요.",
    read: true,
  },
  {
    id: "n4",
    date: "07.22 09:00",
    type: "검진",
    targetName: "박순자",
    message: "5월 국가검진 결과가 반영되어 식단이 조정됐어요.",
    read: true,
  },
  {
    id: "n5",
    date: "07.20 14:00",
    type: "식단변경",
    targetName: "윤태식",
    message: "수분 · 나트륨 제한을 위해 저염식으로 변경됐어요.",
    read: true,
  },
  {
    id: "n6",
    date: "07.15 10:00",
    type: "공지",
    message: "8월 급식 지원 일정 안내: 광복절(8/15)은 배달이 없어요.",
    read: true,
  },
];

export const USER_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "u1",
    date: "07.26 18:00",
    type: "방문",
    message: "7월 28일 담당 사회복지사님의 방문이 예정되어 있어요.",
    read: false,
  },
  {
    id: "u2",
    date: "07.22 09:00",
    type: "검진",
    message: "5월 국가검진 결과가 반영되어 식단이 조정됐어요.",
    read: false,
  },
  {
    id: "u3",
    date: "07.15 10:00",
    type: "공지",
    message: "8월 급식 지원 일정 안내: 광복절(8/15)은 배달이 없어요.",
    read: true,
  },
];
