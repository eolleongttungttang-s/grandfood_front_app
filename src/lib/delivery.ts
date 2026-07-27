export type DeliveryRecord = {
  date: string;
  status: "완료" | "예정";
  time: string;
};

export function getDeliveryHistory(): DeliveryRecord[] {
  return [
    { date: "2026.07.28", status: "예정", time: "12:30" },
    { date: "2026.07.27", status: "완료", time: "12:14" },
    { date: "2026.07.26", status: "완료", time: "12:20" },
    { date: "2026.07.25", status: "완료", time: "12:11" },
    { date: "2026.07.24", status: "완료", time: "12:18" },
  ];
}
