// "잔반 분석하기"(user/home-view.tsx)와 "기록" 탭 날짜별 상세(diet-day-detail.tsx) 둘 다
// 반찬별 잔반율을 보여주는데, 예전엔 회색 글자 한 줄("이름 — n% 남음")만 나열해서 어떤
// 반찬을 많이/적게 남겼는지 한눈에 안 들어온다는 피드백(2026-08-20)을 받았다. 이 앱이
// 이미 "얼마나 위험한지"에 쓰는 risk-* 색 표(banchan-recommendation.ts의
// SUITABILITY_CLASS)를 그대로 재사용한다 — 잔반율도 "얼마나 안 드셨는지"라는 같은
// 성격(위험도 신호)의 값이라 색 의미가 안 섞인다. banchan-recommendation-calendar.tsx의
// NUTRIENT_META는 반대로 risk색을 일부러 피하는데, 거긴 "무슨 영양소인지" 구분이라
// 위험도와 무관해서다 — 여긴 그 반대 케이스.
//
// 많이 남긴 반찬이 위로 오도록 정렬해서, 보호자/어르신이 뭘 안 드셨는지 바로 알 수 있게
// 한다. 임계값(30/60)은 이 앱이 하루 톤 판정에 이미 쓰는 50%(meal-dashboard.ts
// deriveMealTones) 같은 정확한 근거는 없고, 반찬 하나 단위로 "거의 다 드심/조금
// 남기심/많이 남기심" 3단계를 나누기 위한 자체 기준이다.

export type LeftoverDish = {
  /** React key + 정렬 안정성용 — 같은 반찬이 사진 한 장에서 여러 칸으로 잡혀 이름이
   *  중복될 수 있어(GPU 검출 특성), dishId만으로는 key가 겹칠 수 있다. 호출부가
   *  `${dishId}-${index}` 등으로 고유하게 만들어 넘긴다. */
  key: string;
  name: string;
  leftoverPercent: number;
};

export type Severity = "normal" | "caution" | "high";

export function severityOf(percent: number): Severity {
  if (percent >= 60) return "high";
  if (percent >= 30) return "caution";
  return "normal";
}

const SEVERITY_TILE_CLASS: Record<Severity, string> = {
  normal: "bg-risk-normal text-risk-normal-foreground",
  caution: "bg-risk-caution text-risk-caution-foreground",
  high: "bg-risk-high text-risk-high-foreground",
};

const OVERALL_LABEL: Record<Severity, string> = {
  normal: "잘 드셨어요",
  caution: "조금 남기셨어요",
  high: "많이 남기셨어요",
};

/** 전체 잔반율 하나를 강조해서 보여주는 상단 요약 타일 — 숫자만 덩그러니 있던 것 대신
 *  "잘 드셨어요" 같은 한 줄 평가를 같이 보여줘서 숫자를 안 봐도 바로 와닿게 한다. */
export function LeftoverOverallTile({ percent }: { percent: number }) {
  const severity = severityOf(percent);
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${SEVERITY_TILE_CLASS[severity]}`}>
      <span className="text-sm font-semibold">{OVERALL_LABEL[severity]}</span>
      <span className="text-xl font-extrabold">{percent}%</span>
    </div>
  );
}

/** 반찬별 잔반율 목록 — 많이 남긴 순으로 정렬해서 보여준다. */
export function LeftoverDishList({ dishes }: { dishes: LeftoverDish[] }) {
  const sorted = [...dishes].sort((a, b) => b.leftoverPercent - a.leftoverPercent);
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((dish) => (
        <div
          key={dish.key}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${SEVERITY_TILE_CLASS[severityOf(dish.leftoverPercent)]}`}
        >
          <span>{dish.name}</span>
          <span>{dish.leftoverPercent}% 남음</span>
        </div>
      ))}
    </div>
  );
}
