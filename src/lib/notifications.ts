// B2G 버전엔 "검진"(국가검진 결과 반영)/"방문"(사회복지사 방문) 타입이 있었는데,
// B2C 모델엔 그 주체(국가/사회복지사)가 없어져서 대응되는 알림도 사라진다.
// 대신 배송/구독처럼 파트너 매장 관련 알림과, 이번에 새로 생긴 기능(레시피 추천,
// 잔반 이상 감지)에 대응하는 타입을 추가했다.
export type NotificationType = "SOS" | "미응답" | "배송" | "구독" | "레시피추천" | "잔반이상" | "식단변경" | "공지";

export type NotificationItem = {
  id: string;
  date: string;
  type: NotificationType;
  targetName?: string;
  message: string;
  read: boolean;
};

const TYPE_STYLE: Record<NotificationType, string> = {
  SOS: "bg-destructive text-white",
  미응답: "bg-risk-high text-risk-high-foreground",
  잔반이상: "bg-risk-high text-risk-high-foreground",
  배송: "bg-secondary text-secondary-foreground",
  구독: "bg-secondary text-secondary-foreground",
  레시피추천: "bg-risk-normal text-risk-normal-foreground",
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
    message: "4일째 미응답이라 담당 반찬가게에서 안부 확인 연락을 드릴 예정이에요.",
    read: false,
  },
  {
    id: "n3",
    date: "07.25 11:20",
    type: "잔반이상",
    targetName: "윤태식",
    message: "최근 3일간 나트륨이 많은 반찬의 잔반율이 높아요. 건강 리포트를 확인해 주세요.",
    read: true,
  },
  {
    id: "n4",
    date: "07.22 09:00",
    type: "레시피추천",
    targetName: "박순자",
    message: "단백질 부족이 감지돼 두부 활용 레시피를 추천해드려요.",
    read: true,
  },
  {
    id: "n5",
    date: "07.20 14:00",
    type: "식단변경",
    targetName: "윤태식",
    message: "수분 · 나트륨 제한을 위해 저염 반찬 조합으로 변경됐어요.",
    read: true,
  },
  {
    id: "n6",
    date: "07.15 10:00",
    type: "공지",
    message: "8월 배송 일정 안내: 광복절(8/15)은 배송이 없어요.",
    read: true,
  },
];

export const USER_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "u1",
    date: "07.26 18:00",
    type: "배송",
    message: "7월 28일 반찬 배송이 예정되어 있어요.",
    read: false,
  },
  {
    id: "u2",
    date: "07.22 09:00",
    type: "레시피추천",
    message: "단백질이 부족해 두부 활용 레시피를 추천해드려요.",
    read: false,
  },
  {
    id: "u3",
    date: "07.15 10:00",
    type: "공지",
    message: "8월 배송 일정 안내: 광복절(8/15)은 배송이 없어요.",
    read: true,
  },
];
