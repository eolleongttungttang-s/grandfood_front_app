import { DietHistoryEntry } from "@/lib/meal-dashboard";
import { formatMonthDayLabel } from "@/lib/date-format";
import type { MealTone } from "@/lib/wards";

// diet-history의 meal_type은 백엔드가 영어로 내려준다(grandfood_backend
// src/domains/health/schemas.py — "breakfast"/"lunch"/"dinner"). meal-log-store.ts의
// MealSlot("아침"/"점심"/"저녁")과 같은 개념이라 표시용으로만 매핑한다.
const MEAL_TYPE_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner"];

// records-view.tsx(어르신 본인)와 ward-detail-view.tsx(보호자)가 "14일 그리드의 날짜 칸을
// 탭하면 그날 상세(끼니별 반찬·잔반율)를 펼쳐 보여준다"(2026-08-19)를 각자 거의 그대로
// 복제해서 만들었다가, 유지보수 관점에서 하나로 뺐다(코드 리뷰 지적) — 두 화면이 같은
// DietHistoryEntry 모양을 그대로 쓰기 때문에 결과물이 완전히 같다.
export function DietDayDetail({
  date,
  tone,
  toneDotClass,
  entries,
}: {
  date: string;
  tone: MealTone;
  toneDotClass: string;
  /** null = 원본 조회 자체가 아직 안 됐거나 실패함(그리드 톤은 있어도 상세는 확인 불가).
   *  빈 배열([])이면 조회는 됐지만 그날 남겨진 끼니 기록이 없다는 뜻 — 두 경우를 구분해서
   *  보여줘야 "왜 안 보이지"에 답이 된다. */
  entries: DietHistoryEntry[] | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{formatMonthDayLabel(date)}</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${toneDotClass}`} />
          {tone}
        </span>
      </div>
      {entries === null ? (
        <p className="text-sm text-muted-foreground">이 날의 상세 기록은 지금 확인할 수 없어요.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 날은 남겨진 끼니 기록이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...entries]
            .sort((a, b) => MEAL_TYPE_ORDER.indexOf(a.mealType) - MEAL_TYPE_ORDER.indexOf(b.mealType))
            .map((entry) => (
              <div key={entry.mealId} className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {MEAL_TYPE_LABEL[entry.mealType] ?? entry.mealType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.completed
                      ? "사진 분석 완료"
                      : entry.quickCheckStatus
                        ? `자가 체크 · ${entry.quickCheckStatus}`
                        : "기록 없음"}
                  </span>
                </div>
                {entry.dishes.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {entry.dishes.map((dish, di) => (
                      <div key={di} className="flex justify-between text-sm">
                        <span className="text-foreground">{dish.banchanName ?? "반찬"}</span>
                        <span className="text-muted-foreground">{Math.round(dish.leftoverPct)}% 남음</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
