import { ThumbsDown } from "lucide-react";

// "이거 싫어요" 토글 — 예전엔 작은 글자 크기(text-xs)에 테두리도 없는 pill이라 버튼처럼
// 안 보인다는 피드백(2026-08-13, 어르신이 누르기 어려움). care-survey-view.tsx의
// OptionButton처럼 이 앱이 어르신용 큰 탭 영역에 쓰는 굵은 테두리(border-2) + 넉넉한 높이
// (h-11, 최소 44px 터치 영역) 패턴을 그대로 가져오고, 텍스트만으론 약한 "싫어요" 의미를
// 아이콘으로도 한 번 더 보여준다.
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
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition-colors ${
        disliked
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      <ThumbsDown className="h-4 w-4" />
      {disliked ? "기피 표시됨" : "이거 싫어요"}
    </button>
  );
}
