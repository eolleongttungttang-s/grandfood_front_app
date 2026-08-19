// "이거 싫어요" 토글 — 예전엔 작은 글자 크기(text-xs)에 테두리도 없는 pill이라 버튼처럼
// 안 보인다는 피드백(2026-08-13, 어르신이 누르기 어려움). care-survey-view.tsx의
// OptionButton처럼 이 앱이 어르신용 큰 탭 영역에 쓰는 굵은 테두리(border-2) + 넉넉한 높이
// (h-11, 최소 44px 터치 영역) 패턴을 그대로 가져온다. 아이콘은 뺐다 — 반찬 이름(최대 7~8자)
// 옆에 "추천" 배지까지 함께 한 줄에 들어가야 하는데, 아이콘+여백만큼이 그 한 줄 배치를
// 막는 병목이었다(2026-08-19 피드백).
export function DislikeToggleButton({
  disliked,
  onClick,
}: {
  disliked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-11 shrink-0 items-center rounded-full border-2 px-2.5 text-sm font-semibold transition-colors ${
        disliked
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {disliked ? "기피됨" : "싫어요"}
    </button>
  );
}
