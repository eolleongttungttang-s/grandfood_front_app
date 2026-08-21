"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { fetchFoodSuggestions, FoodSuggestion } from "@/lib/medication-food-suggestions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// care-survey-view.tsx의 복약 단계(step === CARE_SURVEY_STEP.medication) 바로 뒤에 새
// 단계로 끼워 넣는 컴포넌트. 새 화면/새 라우트를 만들지 않고 기존 설문 마법사 흐름
// 안에 단계 하나만 추가한다 (2026-08-20 팀 합의 1번 — 별도 화면 대신 기존 UI 재사용,
// INTEGRATION.md의 care-survey-view.tsx 패치 참고).
//
// "제안"이지 자동 반영이 아니다 — 체크박스는 전부 기본 해제 상태로 시작하고, 사용자가
// 직접 누른 것만 기피 목록에 들어간다(합의 2번, 법적 리스크 회피 방침 그대로).
export function MedicationFoodSuggestionStep({
  medicationLabels,
  selected,
  onChange,
}: {
  /** 지금 체크된 약 이름들(한국어 라벨) — 이게 바뀌면 제안 목록을 다시 불러온다. */
  medicationLabels: string[];
  /** 이미 골라둔 음식 이름들(기피 목록에 들어갈 것들) — 제안 목록 밖 항목은 직접 입력한
   *  것으로 취급해 별도로 보여준다. */
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // 제안 목록과 "어느 medicationLabelsKey 기준으로 받은 결과인지"를 한 state에 같이
  // 담는다 — loading을 별도 state/ref로 안 두고 이 값과 지금 key를 비교해서 계산한다.
  // effect 본문에서 setState를 동기적으로 바로 부르면 react-hooks/set-state-in-effect
  // 린트 규칙에 걸리고(콜백 안에서만 setState하라는 규칙), ref는 렌더 중에 못 읽는다
  // (react-hooks/refs) — state로 감싸면 둘 다 피하면서 "로딩 중이었는데 medicationLabels가
  // 또 바뀌어 실제로는 낡은 결과"인 경우도 자동으로 처리된다(key가 다르면 무조건 로딩중).
  const [loaded, setLoaded] = useState<
    { key: string; suggestions: FoodSuggestion[]; consultNotice: string | null } | null
  >(null);
  const [customInput, setCustomInput] = useState("");

  // 배열을 그대로 deps에 넣으면 매 렌더마다 새 배열 참조라 무한 재요청이 된다 — 내용이
  // 같으면 같은 값으로 취급되도록 문자열로 합쳐서 비교한다(순서가 바뀌면 다시 부르는
  // 것도 허용 가능한 정도의 낭비라 실용적으로 이렇게 뒀다).
  const medicationLabelsKey = medicationLabels.join("|");
  const loading = medicationLabels.length > 0 && loaded?.key !== medicationLabelsKey;
  const suggestions = loaded?.key === medicationLabelsKey ? loaded.suggestions : [];
  const consultNotice = loaded?.key === medicationLabelsKey ? loaded.consultNotice : null;

  useEffect(() => {
    let cancelled = false;
    if (medicationLabels.length === 0) {
      return;
    }
    fetchFoodSuggestions(medicationLabels)
      .then(({ suggestions, consultNotice }) => {
        if (!cancelled) setLoaded({ key: medicationLabelsKey, suggestions, consultNotice });
      })
      .catch(() => {
        // 제안을 못 가져와도 설문 자체는 막지 않는다 — 이 단계는 참고용 보조 기능이라,
        // 실패하면 그냥 빈 목록으로 다음 단계로 넘어가면 된다.
        if (!cancelled) setLoaded({ key: medicationLabelsKey, suggestions: [], consultNotice: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicationLabelsKey]);

  function toggle(food: string) {
    onChange(selected.includes(food) ? selected.filter((f) => f !== food) : [...selected, food]);
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name || selected.includes(name)) return;
    onChange([...selected, name]);
    setCustomInput("");
  }

  function removeCustom(name: string) {
    onChange(selected.filter((f) => f !== name));
  }

  // 제안 목록에 없는데 이미 선택된 항목 = 사용자가 직접 입력한 것들.
  const customEntries = selected.filter((f) => !suggestions.some((s) => s.food === f));

  if (medicationLabels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        앞에서 고른 약이 없어서 이 단계는 넘어갈게요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-foreground">
          드시는 약과 관련해 조심하면 좋은 음식이에요
        </h3>
        <p className="text-sm text-muted-foreground">
          기피 음식으로 추가하고 싶은 것만 골라주세요. 고르지 않아도 괜찮아요.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}

      {!loading && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          지금 고른 약 기준으로는 특별히 조심할 음식 안내가 없어요.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.food}
            type="button"
            onClick={() => toggle(s.food)}
            // medication.ts 상단 "⚠️ 화면에 반드시 지켜야 할 것" 2번(출처 표기) — 화면을
            // 더 채우지 않으려고 새 줄 대신 기존 툴팁에 이유와 같이 넣는다(2026-08-21,
            // "화면이 너무 가득 차면 안 된다" 피드백).
            title={`${s.reason} · 출처: ${s.source}`}
            className={cn(
              "rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors",
              selected.includes(s.food)
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {s.food}
          </button>
        ))}
      </div>

      {/* medication.ts 상단 "⚠️ 화면에 반드시 지켜야 할 것" 1번(consultNotice 항상 노출) —
          제안이 하나라도 있을 때만, 카드 전체에 한 줄만 덧붙인다(항목별로 안 넣는 이유는
          위와 동일, 화면을 채우지 않기 위함). */}
      {suggestions.length > 0 && consultNotice && (
        <p className="text-xs text-muted-foreground">{consultNotice}</p>
      )}

      <div className="flex flex-col gap-2">
        {customEntries.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/10 px-4 py-2"
          >
            <span className="text-sm font-semibold text-foreground">{name}</span>
            <button
              type="button"
              aria-label={`${name} 지우기`}
              onClick={() => removeCustom(name)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="목록에 없으면 직접 입력해주세요"
            className="h-11 flex-1"
          />
          <button
            type="button"
            onClick={addCustom}
            aria-label="직접 입력한 음식 추가"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
