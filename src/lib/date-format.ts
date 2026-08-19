// 날짜 문자열("YYYY-MM-DD") 요일 표시 — ward-detail-view.tsx(보호자 "최근 7일 달성률"
// 막대 그래프)와 records-view.tsx(최근 14일 섭취 기록의 날짜별 상세) 둘 다 "이 날짜가
// 무슨 요일인지"를 한국어로 보여줘야 해서 하나로 뺐다(2026-08-19) — 따로 두면 나중에
// 한쪽만 고치고 잊어버리기 쉽다.
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

// "8월 19일 (수)" — 연도 없이 월/일/요일만 보여준다(두 화면 다 "최근 며칠"만 다뤄서 연도가
// 안 바뀜을 이미 전제하고 있었음).
export function formatMonthDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일 (${weekdayLabel(dateStr)})`;
}
