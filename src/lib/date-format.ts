// 날짜 문자열("YYYY-MM-DD")의 요일 표시 — ward-detail-view.tsx(보호자 "최근 7일 달성률"
// 막대 그래프)가 각 막대 아래에 요일을 보여줘야 해서 뺐다(2026-08-19).
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// getUTCDay()는 일=0..토=6 순서라, WEEKDAY_LABELS(월=0..일=6) 인덱스로 7만큼 회전시킨다.
// UTC 기준으로 계산하는 이유는 banchan-recommendation.ts의 addDaysToDateString과 같다 —
// "YYYY-MM-DD" 순수 날짜 문자열을 new Date("YYYY-MM-DD")로 로컬 파싱하면 브라우저에 따라
// 하루 밀려 보일 수 있어서, 연/월/일을 직접 분해해 UTC 자정 기준으로만 계산한다(생성
// 자체엔 시각 개념이 없는 순수 날짜라 UTC로 계산해도 실제 날짜가 안 바뀐다).
export function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAY_LABELS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}
