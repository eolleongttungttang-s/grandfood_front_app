import { ChevronDown, ChevronUp } from "lucide-react";

// diet-view.tsx("왜 이 조합인가요"/"질환·알레르기·복약" 카드)와
// banchan-recommendation-calendar.tsx(달력 접기/펼치기)가 각자 거의 똑같은 h-11 너비 100%
// 펼치기/접기 버튼을 따로 구현하고 있었다 — 둘 다 2026-08-14 ATM 벤치마킹 UX 방침(터치
// 영역을 넉넉히, 필요할 때만 펼쳐 보게)에서 나온 같은 패턴이라 하나로 합쳤다(코드 리뷰
// 지적: 나중에 터치 영역 크기나 아이콘을 바꿀 때 한쪽만 고치고 잊어버리기 쉬움).
//
// label이 있으면(calendar처럼 "8월 월 배송 달력" 같은 좌측 라벨이 필요하면) 좌우로 벌리고,
// 없으면(diet-view.tsx처럼 버튼 자체가 "자세히 보기"만 보여주면 되면) 가운데 정렬한다.
export function ExpandToggle({
  expanded,
  onToggle,
  label,
  expandLabel = "자세히 보기",
  collapseLabel = "접기",
  stopPropagation = false,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** 왼쪽에 고정으로 보여줄 라벨 — 없으면 버튼 전체가 가운데 정렬된 토글 텍스트만 보여준다. */
  label?: string;
  expandLabel?: string;
  collapseLabel?: string;
  /** diet-view.tsx처럼 카드 전체가 SpeakableCard의 탭 영역(눌러서 읽어주기)일 때만 필요 —
   *  이 버튼 클릭이 그대로 버블링되면 펼치기와 동시에 음성 읽기가 토글된다. */
  stopPropagation?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex h-11 w-full items-center rounded-lg bg-muted px-3 text-sm font-semibold text-foreground ${
        label ? "justify-between" : "justify-center gap-1.5"
      }`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onToggle();
      }}
    >
      {label && <span>{label}</span>}
      <span className={`flex items-center ${label ? "gap-1 text-muted-foreground" : "gap-1.5"}`}>
        {expanded ? collapseLabel : expandLabel}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </span>
    </button>
  );
}
