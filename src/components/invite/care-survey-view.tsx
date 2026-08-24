"use client";

import { useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

import {
  CARE_SURVEY_STEP,
  CARE_SURVEY_TOTAL_STEPS,
  CONDITION_POOL,
  DISLIKED_INGREDIENT_POOL,
  EMPTY_CARE_PROFILE_COMMAND,
  LIVING_ARRANGEMENT_LABEL,
  LivingArrangement,
  MEDICATION_POOL,
  MEDICATION_PRODUCT_POOL,
  MEDICATION_TIMING_POOL,
  MOBILITY_LABEL,
  MobilityLevel,
  RegisterCareProfileCommand,
} from "@/lib/care-profile";
import { ACTIVITY_LEVEL_LABEL, ActivityLevel } from "@/lib/health-profile";
import { MedicationFoodSuggestionStep } from "@/components/invite/MedicationFoodSuggestionStep";
import { PhoneInput } from "@/components/app/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NumberWheelSelect } from "@/components/app/number-wheel-select";
import { cn } from "@/lib/utils";

// 키/몸무게/혈압/혈당/활동수준 — care-profile.ts의 "생활 정보"와는 다른 데이터 모델
// (health-profile.ts의 RegisterHealthProfileCommand)에 저장되지만, 어르신 입장에선 한
// 설문 흐름으로 이어지는 게 자연스러워서 이 컴포넌트가 두 데이터를 같이 수집한다 — 제출은
// 호출부(예: invite/survey/page.tsx)가 registerCareProfile()/registerHealthProfile() 둘로
// 나눠서 각자의 저장소에 넣는다.
export type HealthMetricsForm = {
  heightCm?: number;
  weightKg?: number;
  systolicBP?: number;
  diastolicBP?: number;
  fastingGlucose?: number;
  activityLevel?: ActivityLevel;
};

export const EMPTY_HEALTH_METRICS_FORM: HealthMetricsForm = {};

const ACTIVITY_LEVEL_OPTIONS: ActivityLevel[] = ["inactive", "light", "active", "very_active"];

// care-profile.ts의 단계 뒤에 이어 붙인다 — CARE_SURVEY_STEP처럼 값 자체보다 "몇 번째
// 단계인가"가 중요해서, 상수 하나(HEALTH_STEP_OFFSET)만 바꾸면 전체가 같이 밀리게 했다.
const HEALTH_STEP_OFFSET = CARE_SURVEY_TOTAL_STEPS;
const HEALTH_STEP = {
  height: HEALTH_STEP_OFFSET,
  weight: HEALTH_STEP_OFFSET + 1,
  bloodPressure: HEALTH_STEP_OFFSET + 2,
  glucose: HEALTH_STEP_OFFSET + 3,
  activityLevel: HEALTH_STEP_OFFSET + 4,
} as const;
const HEALTH_METRICS_TOTAL_STEPS = Object.keys(HEALTH_STEP).length;

const TOTAL_STEPS = CARE_SURVEY_TOTAL_STEPS + HEALTH_METRICS_TOTAL_STEPS;

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center rounded-2xl border-2 px-5 text-left text-lg font-semibold transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

// 약 복용 시간(아침/점심/저녁/자기 전) 체크용 — OptionButton보다 작은 보조 컨트롤이라
// 터치 타겟을 h-11(44px)까지만 줄인다(diet-view.tsx의 ExpandToggle과 같은 기준). 여러 개
// 동시 선택 가능(하루에 여러 번 먹는 약도 있음)이라 라디오가 아니라 토글이다.
function TimingChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

// 약군 하나를 체크하면 그 밑에서 실제 복용 중인 구체적인 약물명을 고를 수 있게 하는
// 칩 목록 + 직접 입력. 지금은 "질환·알레르기·복약" 요약 화면에 표시하는 용도로만
// 쓴다(care-profile.ts의 MedicationEntry.products 주석 참고) — 반찬 추천에 반영할지는
// 법적 검토가 먼저 필요해 별도로 다루기로 했다.
function MedicationProductPicker({
  categoryName,
  products,
  // 기본값 [] — getCareProfile()이 옛 localStorage 데이터(products 필드가 생기기 전)도
  // 이미 채워서 내려주지만, 혹시 모를 다른 경로로 undefined가 들어와도 여기서 한 번 더
  // 막는다(같은 크래시를 두 번 겪지 않기 위한 방어).
  selected = [],
  onToggle,
  onAddCustom,
  onRemove,
}: {
  categoryName: string;
  products: string[];
  selected: string[];
  onToggle: (product: string) => void;
  onAddCustom: (product: string) => void;
  onRemove: (product: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");
  // 목록에 없는데 이미 선택된 것 = 직접 입력으로 추가한 것들.
  const customEntries = selected.filter((p) => !products.includes(p));

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-sm font-semibold text-muted-foreground">
        {categoryName} 중 실제로 드시는 약이 있으면 골라주세요
      </span>
      <div className="flex flex-wrap gap-2">
        {products.map((product) => (
          <button
            key={product}
            type="button"
            onClick={() => onToggle(product)}
            className={cn(
              "rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors",
              selected.includes(product)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {product}
          </button>
        ))}
      </div>
      {customEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customEntries.map((product) => (
            <span
              key={product}
              className="flex items-center gap-1.5 rounded-full border-2 border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold text-foreground"
            >
              {product}
              <button type="button" aria-label={`${product} 지우기`} onClick={() => onRemove(product)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="목록에 없으면 직접 입력해주세요"
          className="h-9 flex-1 text-sm"
        />
        <button
          type="button"
          aria-label="직접 입력한 약물명 추가"
          onClick={() => {
            onAddCustom(customInput);
            setCustomInput("");
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// 수정하려는 항목 하나 때문에 14단계를 처음부터 다시 눌러가야 했던 문제(2026-08-13
// 피드백) — 이미 한 번 채워진 값이 있을 때(initialValues 있음)는 이 목록 화면을 먼저
// 보여주고, 항목을 누르면 그 단계로 바로 들어간다.
function OverviewRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-muted"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold text-foreground">{value}</span>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-2xl leading-snug font-extrabold text-foreground">{title}</h2>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
    </div>
  );
}

const LIVING_ARRANGEMENT_OPTIONS: { value: LivingArrangement; label: string }[] = [
  { value: "alone", label: "혼자 거주해요" },
  { value: "with_family", label: "가족과 함께 살아요" },
  { value: "care_facility", label: "요양시설에 계세요" },
];

const MOBILITY_OPTIONS: { value: MobilityLevel; label: string }[] = [
  { value: "independent", label: "혼자 잘 걸어다녀요" },
  { value: "needs_assistance", label: "걸을 때 도움이 필요해요" },
  { value: "bedridden", label: "누워서 지내는 시간이 많아요" },
];

// 마이페이지에서 "생활 정보"와 "건강 프로필" 카드를 각자 따로 수정할 수 있게 분리한
// 진입 모드(2026-08-21 피드백 — "건강 프로필에는 개별 입력 버튼이 없다, 둘을 나누고
// 싶다"). "both"는 기존처럼 15문항을 하나로 이어 묻는다(초대/자가가입 최초 온보딩 전용 —
// 그 흐름은 이번 요청과 무관해 그대로 둔다). "care"는 생활 정보 10문항만, "health"는
// 건강 프로필 5문항만 다룬다 — 절대 step 번호(CARE_SURVEY_STEP/HEALTH_STEP)는 그대로
// 두고, 이 범위 밖으로 못 나가게 진행/뒤로가기/목록만 구간에 맞게 제한한다.
export type CareSurveySection = "care" | "health" | "both";

export function CareSurveyView({
  wardId,
  wardName,
  section = "both",
  initialValues,
  initialHealthValues,
  onComplete,
  onSkip,
}: {
  wardId: string;
  wardName: string;
  section?: CareSurveySection;
  // completed/answeredStep은 CareProfileView(care-profile.ts)에만 있는 필드라 optional로
  // 열어둔다 — 호출부가 실제로는 CareProfileView 전체를 넘기지만(user/survey/page.tsx),
  // 이 컴포넌트가 필요한 만큼만 타입에 요구한다.
  initialValues?: RegisterCareProfileCommand & { completed?: boolean; answeredStep?: number };
  initialHealthValues?: HealthMetricsForm;
  onComplete: (cmd: RegisterCareProfileCommand, health: HealthMetricsForm) => void | Promise<void>;
  onSkip: (
    partial: RegisterCareProfileCommand,
    answeredStep: number,
    health: HealthMetricsForm
  ) => void | Promise<void>;
}) {
  // 이 구간(section)에서 실제로 다룰 step 범위 — 절대 번호(0~14)는 그대로 두고 시작/끝만
  // 좁힌다. "health" 구간의 시작이 곧 HEALTH_STEP_OFFSET이라, 예전처럼 매번 0부터 세지
  // 않고 이 두 값만 바꾸면 진행률/이전·다음 경계가 전부 따라온다.
  const sectionStart = section === "health" ? HEALTH_STEP_OFFSET : 0;
  const sectionEnd = section === "care" ? CARE_SURVEY_TOTAL_STEPS - 1 : TOTAL_STEPS - 1;
  const sectionStepCount = sectionEnd - sectionStart + 1;

  // 목록 화면(overview)은 initialValues의 각 필드가 "실제로 답한 값"이라는 전제로 그대로
  // 보여준다 — completed가 false인 프로필(예전에 "나중에 할게요"로 건너뜀)은 답한 적 없는
  // 필드도 EMPTY_CARE_PROFILE_COMMAND 기본값(예: 음식 알레르기 "없음", 거동 "혼자 잘
  // 걸어다님")을 그대로 들고 있어서, 목록에 실제 답변처럼 보여주면 안 된다(코드 리뷰 지적 —
  // 이 값을 그대로 다시 저장하면 registerCareProfile이 completed:true로 확정해버려서, 실제로는
  // 안 물어본 답이 영구히 "답함"으로 남는다). 그래서 completed가 확실히 true일 때만 목록을
  // 보여주고, 아니면(건너뛴 적 있음/최초 온보딩) 지금까지처럼 순서대로 다 물어보게 둔다 —
  // 그래야 미답변 필드도 반드시 한 번은 화면에 노출된 뒤 저장된다.
  //
  // "health" 구간은 care-profile.ts 같은 completed/answeredStep 추적이 아예 없다(건강
  // 수치는 전부 선택 항목이라 "완료"라는 개념 자체가 옅다) — 대신 이 대상자의 건강 프로필이
  // 한 번이라도 저장된 적 있으면(initialHealthValues 존재) 목록 화면을, 처음이면 순서대로
  // 물어보는 흐름을 보여준다.
  // "health" 구간은 completed 같은 확정 플래그가 없어(주석 위 참고) 대신 5문항이 전부
  // 채워져 있는지로 판단한다 — 예전엔 initialHealthValues가 있기만 하면(하나라도 채워져
  // 있으면) 곧장 overview로 보내서, 아래 firstUnansweredStep의 health 이어서 시작 로직이
  // 실제로는 절대 실행될 수 없는 죽은 코드였다(2026-08-21 코드 리뷰 지적 — h가 wizard
  // 모드에선 항상 undefined라 키부터 다시 시작됨). 부분 입력이면 wizard로 보내 이어서
  // 답하게 하고, 5문항이 다 있을 때만 overview로 보낸다.
  //
  // "care"(생활 정보 단독 수정) 구간도 completed는 false지만 실제로는 10문항을 다 답하고
  // 건강 문항 중에 건너뛴 경우(careFullyAnswered)가 있다 — 이때도 completed만 보면 매번
  // 마지막 문항(비상연락처)을 안 답한 것처럼 다시 보여주게 된다(2026-08-21 코드 리뷰
  // 지적). "both"는 여기 포함하지 않는다 — care가 다 채워졌어도 건강 문항이 남아있을 수
  // 있어(정상 흐름), 아래 firstUnansweredStep이 이어서 건강 문항으로 넘어가도록 따로 처리한다.
  const careFullyAnswered = (initialValues?.answeredStep ?? 0) >= CARE_SURVEY_TOTAL_STEPS;
  const isHealthComplete =
    initialHealthValues != null &&
    initialHealthValues.heightCm != null &&
    initialHealthValues.weightKg != null &&
    (initialHealthValues.systolicBP != null || initialHealthValues.diastolicBP != null) &&
    initialHealthValues.fastingGlucose != null &&
    initialHealthValues.activityLevel != null;
  const isEditMode =
    section === "health"
      ? isHealthComplete
      : initialValues?.completed === true || (section === "care" && careFullyAnswered);
  const [mode, setMode] = useState<"overview" | "wizard">(isEditMode ? "overview" : "wizard");
  // 목록 화면에서 특정 단계로 바로 들어온 경우, 그 단계를 확인하고 나면 다음 단계로
  // 넘어가는 게 아니라 목록으로 돌아가야 한다 — 순서대로 진행 중인 것과 버튼 동작이
  // 달라야 해서 이 값으로 구분한다.
  const [enteredFromOverview, setEnteredFromOverview] = useState(false);

  // 위저드 모드(isEditMode=false)로 들어오면 항상 맨 처음(0번)부터 다시 물었었다 — 예전에
  // "나중에 할게요"로 몇 문항 답하고 건너뛴 적 있어도 다시 1번부터였다(2026-08-21 피드백,
  // "미입력한 부분부터 시작하면 좋겠다"). care/both 구간은 answeredStep(실제로 답하고 지나간
  // 문항 수)을 그대로 재시작 지점으로 쓴다. health 구간은 그런 진행도 추적이 없으니, 5문항을
  // 순서대로 훑어 값이 비어있는 첫 문항을 찾는다(혈압은 수축기·이완기 둘 다 없을 때만
  // "안 답함"으로 본다 — 한쪽만 있어도 이미 그 화면에 들어와 값을 남긴 것).
  function firstUnansweredStep(): number {
    if (section === "health") {
      const h = initialHealthValues;
      if (h?.heightCm == null) return HEALTH_STEP.height;
      if (h?.weightKg == null) return HEALTH_STEP.weight;
      if (h?.systolicBP == null && h?.diastolicBP == null) return HEALTH_STEP.bloodPressure;
      if (h?.fastingGlucose == null) return HEALTH_STEP.glucose;
      return HEALTH_STEP.activityLevel;
    }
    // "both" 구간에서 케어 10문항은 다 답했는데(careFullyAnswered) 건강 문항 중에
    // 건너뛴 경우, 아래 Math.min 그대로 쓰면 이미 답한 마지막 케어 문항(비상연락처)을
    // 안 답한 것처럼 다시 보여주게 된다(2026-08-21 코드 리뷰 지적) — 이어서 건강
    // 문항부터 시작한다. "care" 단독 구간은 careFullyAnswered면 위에서 이미 overview로
    // 보내(isEditMode) 이 함수 자체가 wizard 진입용으로 안 불리니 여기선 안 다룬다.
    if (section === "both" && careFullyAnswered) return HEALTH_STEP_OFFSET;
    return Math.min(initialValues?.answeredStep ?? 0, CARE_SURVEY_TOTAL_STEPS - 1);
  }
  const [step, setStep] = useState(firstUnansweredStep);
  // EMPTY_CARE_PROFILE_COMMAND를 먼저 펼치고 그 위에 initialValues를 덮어쓴다 — 그냥
  // initialValues를 통째로 쓰면, 이 설문에 필드가 새로 추가된 뒤(예: medications 체크리스트)
  // 그 필드가 생기기 전에 저장된 옛 localStorage 데이터엔 새 필드 자체가 없어서
  // undefined가 되고, 그 필드를 쓰는 화면이 그대로 죽는다(실제로 겪은 크래시).
  const [form, setForm] = useState<RegisterCareProfileCommand>(
    initialValues ? { ...EMPTY_CARE_PROFILE_COMMAND, ...initialValues } : { ...EMPTY_CARE_PROFILE_COMMAND, wardId }
  );
  const [healthForm, setHealthForm] = useState<HealthMetricsForm>(
    initialHealthValues ?? EMPTY_HEALTH_METRICS_FORM
  );
  const [submitting, setSubmitting] = useState(false);

  // "복용 중인 약" 항목을 목록에서 바로 골라 들어왔다가(jumpToStep) 확인을 누르면, 원래는
  // enteredFromOverview 때문에 곧장 목록으로 돌아가서 바로 다음 단계인 "약물 관련 기피
  // 음식"(제안 카드)을 볼 기회가 없었다 — 방금 추가한 약 때문에 새로 뜬 제안이 있어도
  // 모른 채 저장하고 끝나는 문제(2026-08-21 피드백). 이 단계에 들어온 시점의 약 목록을
  // 스냅샷으로 남겨뒀다가, 확인 시점에 실제로 바뀌었을 때만 목록으로 안 돌아가고 그
  // 다음 단계로 한 번 더 이어준다 — 안 바꿨으면(그냥 확인만) 예전처럼 바로 돌아간다.
  const [medicationSnapshotOnEnter, setMedicationSnapshotOnEnter] = useState<string | null>(null);

  function medicationKey(f: RegisterCareProfileCommand): string {
    return f.takesMedication
      ? [...f.medications, ...f.customMedications].map((m) => m.name).filter(Boolean).join("|")
      : "";
  }

  function jumpToStep(target: number) {
    setStep(target);
    setEnteredFromOverview(true);
    setMode("wizard");
    setMedicationSnapshotOnEnter(target === CARE_SURVEY_STEP.medication ? medicationKey(form) : null);
  }

  async function handleFinishEditing() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete(form, healthForm);
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof RegisterCareProfileCommand>(
    key: K,
    value: RegisterCareProfileCommand[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateHealth<K extends keyof HealthMetricsForm>(key: K, value: HealthMetricsForm[K]) {
    setHealthForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIngredient(name: string) {
    setForm((prev) => ({
      ...prev,
      dislikedIngredients: prev.dislikedIngredients.includes(name)
        ? prev.dislikedIngredients.filter((n) => n !== name)
        : [...prev.dislikedIngredients, name],
    }));
  }

  function toggleCondition(name: string) {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.includes(name)
        ? prev.conditions.filter((n) => n !== name)
        : [...prev.conditions, name],
    }));
  }

  // "혈압약을 먹는다"는 체크(있음/없음)와 "언제 먹는다"는 체크(아침/점심/저녁/자기 전,
  // 복수 선택)가 따로 논다 — 있음 체크를 끄면 그 약의 복용 시간 선택도 같이 지운다(꺼진
  // 약에 시간만 남아있으면 나중에 다시 켰을 때 사용자가 고른 적 없는 시간이 그대로
  // 남아있는 것처럼 보인다).
  function toggleMedicationChecked(name: string) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.some((m) => m.name === name)
        ? prev.medications.filter((m) => m.name !== name)
        : [...prev.medications, { name, timings: [], products: [] }],
    }));
  }

  function toggleMedicationTiming(name: string, timing: string) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m) =>
        m.name === name
          ? {
              ...m,
              timings: m.timings.includes(timing)
                ? m.timings.filter((t) => t !== timing)
                : [...m.timings, timing],
            }
          : m
      ),
    }));
  }

  // toggleMedicationTiming과 같은 모양 — 약군 하나 안에서 구체적인 약물명은 여러 개
  // 고를 수 있다(예: 혈압약 중 노바스크정+알닥톤 둘 다 복용하는 경우).
  function toggleMedicationProduct(name: string, product: string) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m) =>
        m.name === name
          ? {
              ...m,
              products: m.products.includes(product)
                ? m.products.filter((p) => p !== product)
                : [...m.products, product],
            }
          : m
      ),
    }));
  }

  // MEDICATION_PRODUCT_POOL에 없는 약물명(직접 입력)도 products 배열에 그대로 추가한다 —
  // 별도 자료구조를 안 만들고 toggleMedicationProduct와 동일하게 다룬다(이미 있으면
  // 무시, 없으면 추가만 — 직접 입력은 지웠다 다시 추가하는 토글 동작이 필요 없다).
  function addCustomMedicationProduct(name: string, product: string) {
    const trimmed = product.trim();
    if (!trimmed) return;
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m) =>
        m.name === name && !m.products.includes(trimmed)
          ? { ...m, products: [...m.products, trimmed] }
          : m
      ),
    }));
  }

  function removeMedicationProduct(name: string, product: string) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m) =>
        m.name === name ? { ...m, products: m.products.filter((p) => p !== product) } : m
      ),
    }));
  }

  // 기타(목록에 없는 약)는 하나가 아니라 여러 개일 수 있고, 약마다 복용 시간이 다를 수 있다
  // (2026-08-14 피드백 — 피부약은 점심에만, 알레르기약은 아침·저녁에 먹는 경우 등, 자유
  // 텍스트 한 줄 + 시간 체크 하나를 공유하면 이 둘을 구분할 방법이 없었다). 그래서 이름도
  // 자유 입력인 채로 여러 개 담을 수 있게 medications와 같은 모양(이름+시간)의 배열로 관리한다.
  // 이름이 입력 중엔 비어있거나 일시적으로 겹칠 수 있어 이름이 아니라 배열 인덱스로 다룬다.
  function addCustomMedication() {
    setForm((prev) => ({
      ...prev,
      customMedications: [...prev.customMedications, { name: "", timings: [], products: [] }],
    }));
  }

  function removeCustomMedication(index: number) {
    setForm((prev) => ({
      ...prev,
      customMedications: prev.customMedications.filter((_, i) => i !== index),
    }));
  }

  function renameCustomMedication(index: number, name: string) {
    setForm((prev) => ({
      ...prev,
      customMedications: prev.customMedications.map((m, i) => (i === index ? { ...m, name } : m)),
    }));
  }

  function toggleCustomMedicationTiming(index: number, timing: string) {
    setForm((prev) => ({
      ...prev,
      customMedications: prev.customMedications.map((m, i) =>
        i === index
          ? {
              ...m,
              timings: m.timings.includes(timing)
                ? m.timings.filter((t) => t !== timing)
                : [...m.timings, timing],
            }
          : m
      ),
    }));
  }

  const isLast = step === sectionEnd;

  async function handleNext() {
    // 목록에서 골라 들어온 단계면 "다음"이 다음 단계로 넘어가는 게 아니라 방금 고친 값을
    // 들고 목록으로 돌아간다 — 순서대로 쭉 진행하는 흐름과는 이 버튼의 의미 자체가 다르다.
    if (enteredFromOverview) {
      // 예외: "복용 중인 약" 단계를 들어왔다 나갈 때 실제로 약 목록이 바뀌었으면, 목록으로
      // 바로 안 돌아가고 "약물 관련 기피 음식"(제안 카드) 단계를 한 번 더 보여준다 — 새로
      // 추가한 약 때문에 새로 뜬 제안을 놓치지 않게 하려는 것(2026-08-21 피드백). 안
      // 바꿨으면(그냥 확인만 눌렀으면) 예전처럼 바로 목록으로 돌아간다.
      if (
        step === CARE_SURVEY_STEP.medication &&
        medicationSnapshotOnEnter !== null &&
        medicationKey(form) !== medicationSnapshotOnEnter
      ) {
        setMedicationSnapshotOnEnter(null);
        setStep(CARE_SURVEY_STEP.medicationFoodAvoidance);
        return;
      }
      // 예전엔 여기서 목록 화면으로만 돌아가고, 실제 저장은 그 목록의 별도 "완료" 버튼을
      // 한 번 더 눌러야 일어났다 — "지금 드시고 있는 약이 있으세요?"에서 약을 고르고
      // "확인"을 누르면 사용자는 그걸로 끝났다고 여기기 쉬운데, 실제로는 목록 화면에서
      // 한 번 더 눌러야 서버에 반영되는 함정이었다(2026-08-24 피드백, "완료까지 누르지
      // 않아도 확인만 되면 저장하는 구조로"). 그래서 목록에서 들어온 단일 항목 편집은
      // "확인" 자체가 그대로 저장(완료와 동일한 onComplete 호출)까지 끝내도록 바꾼다 —
      // 최초 15문항 온보딩 흐름(엔터드프롬오버뷰 아님)은 그대로 "완료"에서만 저장된다.
      setEnteredFromOverview(false);
      if (submitting) return;
      setSubmitting(true);
      try {
        await onComplete(form, healthForm);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete(form, healthForm);
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(sectionStart, s - 1));
  }

  async function handleSkip() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // care-profile.ts의 answeredStep은 "care-profile 단계 중 몇 번째까지 답했는지"라는
      // 의미로 문서화돼 있어(0~CARE_SURVEY_TOTAL_STEPS) — 건강정보 단계까지 진행한 뒤
      // 건너뛰어도 care-profile 쪽엔 그 의미를 벗어나지 않게 상한을 맞춰서 전달한다.
      // (health는 건너뛴 시점의 값 그대로 partial 저장 — 별도 진행도 추적은 안 함.)
      //
      // "health" 구간을 건너뛸 땐 step이 애초에 care 범위 밖(10~14)이라, 그대로
      // Math.min(step, 10)을 쓰면 care를 한 번도 안 물어봤어도 "10문항 다 답함"으로
      // 잘못 기록된다(2026-08-21, 생활 정보/건강 프로필 분리하며 발견) — care 진행도는
      // 이 구간에서 전혀 안 바뀌었으니 원래 있던 값을 그대로 돌려보낸다.
      const careAnsweredStep =
        section === "health" ? (initialValues?.answeredStep ?? 0) : Math.min(step, CARE_SURVEY_TOTAL_STEPS);
      await onSkip(form, careAnsweredStep, healthForm);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "overview") {
    const allRows: { step: number; label: string; value: string }[] = [
      { step: CARE_SURVEY_STEP.mealsPerDay, label: "하루 식사 횟수", value: `${form.mealsPerDay}회` },
      {
        step: CARE_SURVEY_STEP.livingArrangement,
        label: "동거 형태",
        value: LIVING_ARRANGEMENT_LABEL[form.livingArrangement],
      },
      {
        step: CARE_SURVEY_STEP.dislikedIngredients,
        label: "못 먹거나 싫어하는 재료",
        value:
          [...form.dislikedIngredients, form.dislikedIngredientsNote].filter(Boolean).join(", ") || "없음",
      },
      {
        step: CARE_SURVEY_STEP.allergy,
        label: "음식 알레르기",
        value: form.hasAllergy ? form.allergyNote || "있음" : "없음",
      },
      {
        step: CARE_SURVEY_STEP.conditions,
        label: "진단받은 질환",
        value: [...form.conditions, form.conditionsNote].filter(Boolean).join(", ") || "없음",
      },
      {
        step: CARE_SURVEY_STEP.medication,
        label: "복용 중인 약",
        value: form.takesMedication
          ? [...form.medications, ...form.customMedications].map((m) => m.name).filter(Boolean).join(", ") || "있음"
          : "없음",
      },
      {
        step: CARE_SURVEY_STEP.medicationFoodAvoidance,
        label: "약물 관련 기피 음식",
        value: form.medicationFoodAvoidances.join(", ") || "없음",
      },
      {
        step: CARE_SURVEY_STEP.chewingDifficulty,
        label: "씹기 · 삼키기",
        value: form.chewingDifficulty ? "불편함" : "괜찮음",
      },
      { step: CARE_SURVEY_STEP.mobility, label: "거동", value: MOBILITY_LABEL[form.mobilityLevel] },
      {
        step: CARE_SURVEY_STEP.emergencyContact,
        label: "비상연락처",
        value: form.emergencyContactPhone
          ? `${form.emergencyContactName}(${form.emergencyContactRelation}) ${form.emergencyContactPhone}`
          : "미입력",
      },
      {
        step: HEALTH_STEP.height,
        label: "키",
        value: healthForm.heightCm != null ? `${healthForm.heightCm}cm` : "미입력",
      },
      {
        step: HEALTH_STEP.weight,
        label: "체중",
        value: healthForm.weightKg != null ? `${healthForm.weightKg}kg` : "미입력",
      },
      {
        step: HEALTH_STEP.bloodPressure,
        label: "혈압",
        value:
          healthForm.systolicBP != null && healthForm.diastolicBP != null
            ? `${healthForm.systolicBP}/${healthForm.diastolicBP} mmHg`
            : "미입력",
      },
      {
        step: HEALTH_STEP.glucose,
        label: "공복혈당",
        value: healthForm.fastingGlucose != null ? `${healthForm.fastingGlucose} mg/dL` : "미입력",
      },
      {
        step: HEALTH_STEP.activityLevel,
        label: "활동 수준",
        value: healthForm.activityLevel ? ACTIVITY_LEVEL_LABEL[healthForm.activityLevel] : "미입력",
      },
    ];
    // "care"/"health" 구간은 이 화면이 각자 자기 몫만 다루므로, 목록도 그 구간에 속한
    // 항목만 보여준다 — "both"(최초 온보딩)는 지금까지처럼 15개 전부.
    const rows = allRows.filter((row) => row.step >= sectionStart && row.step <= sectionEnd);

    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 px-5 py-6">
          <StepHeading
            title="무엇을 수정하시겠어요?"
            hint="항목을 누르면 그 질문으로 바로 이동해요"
          />
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <OverviewRow
                key={row.step}
                label={row.label}
                value={row.value}
                onClick={() => jumpToStep(row.step)}
              />
            ))}
          </div>
        </div>
        <div className="px-5 pb-6">
          <Button
            size="lg"
            className="h-14 w-full text-lg"
            onClick={handleFinishEditing}
            disabled={submitting}
          >
            {submitting ? "저장하는 중..." : "완료"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {enteredFromOverview ? (
        // 목록에서 골라 들어온 단계엔 "X / 14" 진행률이나 "나중에 할게요"가 의미가 없다 —
        // 순서대로 훑는 중이 아니라 이 질문 하나만 고치러 왔기 때문.
        <div className="px-5 pt-5">
          <button
            type="button"
            className="text-base font-semibold text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setEnteredFromOverview(false);
              setMode("overview");
            }}
            disabled={submitting}
          >
            ← 목록으로
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-5 pt-5">
            <span className="text-base font-semibold text-muted-foreground">
              {step - sectionStart + 1} / {sectionStepCount}
            </span>
            <button
              type="button"
              className="text-base font-semibold text-muted-foreground underline underline-offset-2"
              onClick={handleSkip}
              disabled={submitting}
            >
              나중에 할게요
            </button>
          </div>
          <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((step - sectionStart + 1) / sectionStepCount) * 100}%` }}
            />
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col gap-5 px-5 py-6">
        {step === CARE_SURVEY_STEP.mealsPerDay && (
          <>
            <StepHeading
              title={`${wardName}님은 하루에 식사를 몇 번 하세요?`}
              hint="간식 말고, 끼니로 챙겨 드시는 횟수예요"
            />
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((n) => (
                <OptionButton
                  key={n}
                  selected={form.mealsPerDay === n}
                  onClick={() => update("mealsPerDay", n as 1 | 2 | 3 | 4)}
                >
                  {n === 4 ? "4회 이상 (간식 포함)" : `${n}회`}
                </OptionButton>
              ))}
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.livingArrangement && (
          <>
            <StepHeading title={`${wardName}님은 지금 어떻게 지내고 계세요?`} />
            <div className="flex flex-col gap-3">
              {LIVING_ARRANGEMENT_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  selected={form.livingArrangement === opt.value}
                  onClick={() => update("livingArrangement", opt.value)}
                >
                  {opt.label}
                </OptionButton>
              ))}
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.dislikedIngredients && (
          <>
            <StepHeading
              title="못 먹거나 싫어하는 재료가 있으세요?"
              hint="해당하는 걸 모두 골라주세요"
            />
            <div className="flex flex-col gap-3">
              {DISLIKED_INGREDIENT_POOL.map((name) => (
                <OptionButton
                  key={name}
                  selected={form.dislikedIngredients.includes(name)}
                  onClick={() => toggleIngredient(name)}
                >
                  {name}
                </OptionButton>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="disliked-note" className="text-base">
                그 밖에 못 드시는 음식이 있으면 적어주세요
              </Label>
              <Textarea
                id="disliked-note"
                className="min-h-20 text-lg"
                placeholder="예: 홍어, 순대"
                value={form.dislikedIngredientsNote}
                onChange={(e) => update("dislikedIngredientsNote", e.target.value)}
              />
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.allergy && (
          <>
            <StepHeading title="음식 알레르기가 있으세요?" />
            <div className="flex gap-3">
              <OptionButton selected={form.hasAllergy} onClick={() => update("hasAllergy", true)}>
                <span className="mx-auto">있어요</span>
              </OptionButton>
              <OptionButton
                selected={!form.hasAllergy}
                onClick={() => update("hasAllergy", false)}
              >
                <span className="mx-auto">없어요</span>
              </OptionButton>
            </div>
            {form.hasAllergy && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="allergy-note" className="text-base">
                  어떤 알레르기인지 적어주세요
                </Label>
                <Textarea
                  id="allergy-note"
                  className="min-h-20 text-lg"
                  placeholder="예: 새우 알레르기"
                  value={form.allergyNote}
                  onChange={(e) => update("allergyNote", e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {step === CARE_SURVEY_STEP.conditions && (
          <>
            <StepHeading
              title="진단받은 질환이 있으세요?"
              hint="해당하는 걸 모두 골라주세요"
            />
            <div className="flex flex-col gap-3">
              {CONDITION_POOL.map((name) => (
                <OptionButton
                  key={name}
                  selected={form.conditions.includes(name)}
                  onClick={() => toggleCondition(name)}
                >
                  {name}
                </OptionButton>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conditions-note" className="text-base">
                그 밖에 앓고 있는 질환이 있으면 적어주세요
              </Label>
              <Textarea
                id="conditions-note"
                className="min-h-20 text-lg"
                placeholder="예: 갑상선 질환"
                value={form.conditionsNote}
                onChange={(e) => update("conditionsNote", e.target.value)}
              />
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.medication && (
          <>
            <StepHeading title="지금 드시고 있는 약이 있으세요?" />
            <div className="flex gap-3">
              <OptionButton
                selected={form.takesMedication}
                onClick={() => update("takesMedication", true)}
              >
                <span className="mx-auto">있어요</span>
              </OptionButton>
              <OptionButton
                selected={!form.takesMedication}
                onClick={() => update("takesMedication", false)}
              >
                <span className="mx-auto">없어요</span>
              </OptionButton>
            </div>
            {form.takesMedication && (
              <>
                <div className="flex flex-col gap-3">
                  {MEDICATION_POOL.map((name) => {
                    const entry = form.medications.find((m) => m.name === name);
                    return (
                      <div
                        key={name}
                        className={cn(
                          "flex flex-col gap-3 rounded-2xl border-2 p-4 transition-colors",
                          entry ? "border-primary bg-primary/10" : "border-border bg-card"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleMedicationChecked(name)}
                          className="flex min-h-11 items-center justify-between text-left text-lg font-semibold text-foreground"
                        >
                          <span>{name}</span>
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              entry ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {entry ? "있음" : "없음"}
                          </span>
                        </button>
                        {entry && (
                          <>
                            <div className="flex gap-2">
                              {MEDICATION_TIMING_POOL.map((timing) => (
                                <TimingChip
                                  key={timing}
                                  label={timing}
                                  selected={entry.timings.includes(timing)}
                                  onClick={() => toggleMedicationTiming(name, timing)}
                                />
                              ))}
                            </div>
                            <MedicationProductPicker
                              categoryName={name}
                              products={MEDICATION_PRODUCT_POOL[name]}
                              selected={entry.products}
                              onToggle={(product) => toggleMedicationProduct(name, product)}
                              onAddCustom={(product) => addCustomMedicationProduct(name, product)}
                              onRemove={(product) => removeMedicationProduct(name, product)}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-3">
                  <Label className="flex flex-col items-start text-base">
                    <span>기타 — 목록에 없는 약이 있으면 이름을 적어주세요</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      (약마다 따로 추가할 수 있어요)
                    </span>
                  </Label>
                  {form.customMedications.map((med, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={med.name}
                          onChange={(e) => renameCustomMedication(i, e.target.value)}
                          placeholder="예: 위장약"
                          className="h-11 flex-1 text-lg"
                        />
                        <button
                          type="button"
                          aria-label="이 약 지우기"
                          onClick={() => removeCustomMedication(i)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {MEDICATION_TIMING_POOL.map((timing) => (
                          <TimingChip
                            key={timing}
                            label={timing}
                            selected={med.timings.includes(timing)}
                            onClick={() => toggleCustomMedicationTiming(i, timing)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addCustomMedication}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border text-base font-semibold text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    기타 약 추가
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === CARE_SURVEY_STEP.medicationFoodAvoidance && (
          <MedicationFoodSuggestionStep
            medicationLabels={
              form.takesMedication
                ? [...form.medications, ...form.customMedications].map((m) => m.name).filter(Boolean)
                : []
            }
            selected={form.medicationFoodAvoidances}
            onChange={(next) => update("medicationFoodAvoidances", next)}
          />
        )}

        {step === CARE_SURVEY_STEP.chewingDifficulty && (
          <>
            <StepHeading title="씹거나 삼키는 게 불편하세요?" />
            <div className="flex gap-3">
              <OptionButton
                selected={form.chewingDifficulty}
                onClick={() => update("chewingDifficulty", true)}
              >
                <span className="mx-auto">불편해요</span>
              </OptionButton>
              <OptionButton
                selected={!form.chewingDifficulty}
                onClick={() => update("chewingDifficulty", false)}
              >
                <span className="mx-auto">괜찮아요</span>
              </OptionButton>
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.mobility && (
          <>
            <StepHeading title="거동은 어떠세요?" />
            <div className="flex flex-col gap-3">
              {MOBILITY_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  selected={form.mobilityLevel === opt.value}
                  onClick={() => update("mobilityLevel", opt.value)}
                >
                  {opt.label}
                </OptionButton>
              ))}
            </div>
          </>
        )}

        {step === CARE_SURVEY_STEP.emergencyContact && (
          <>
            <StepHeading
              title="비상시 연락할 분을 알려주세요"
              hint="갑자기 연락이 안 될 때 대신 연락드릴 분이에요"
            />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ec-name" className="text-base">
                  성함
                </Label>
                <Input
                  id="ec-name"
                  className="h-14 text-lg"
                  placeholder="예: 박은정"
                  value={form.emergencyContactName}
                  onChange={(e) => update("emergencyContactName", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ec-relation" className="text-base">
                  관계
                </Label>
                <Input
                  id="ec-relation"
                  className="h-14 text-lg"
                  placeholder="예: 딸, 아들, 며느리"
                  value={form.emergencyContactRelation}
                  onChange={(e) => update("emergencyContactRelation", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ec-phone" className="text-base">
                  전화번호
                </Label>
                <PhoneInput
                  id="ec-phone"
                  className="h-14 text-lg"
                  placeholder="010-0000-0000"
                  value={form.emergencyContactPhone}
                  onChange={(value) => update("emergencyContactPhone", value)}
                />
              </div>
            </div>
          </>
        )}

        {step === HEALTH_STEP.height && (
          <>
            <StepHeading
              title={`${wardName}님 키가 어떻게 되세요?`}
              hint="모르시면 그냥 다음으로 넘어가셔도 괜찮아요"
            />
            <NumberWheelSelect
              id="health-height"
              label="키"
              value={healthForm.heightCm}
              onChange={(v) => updateHealth("heightCm", v)}
              min={130}
              max={200}
              unit="cm"
            />
          </>
        )}

        {step === HEALTH_STEP.weight && (
          <>
            <StepHeading
              title={`${wardName}님 몸무게가 어떻게 되세요?`}
              hint="모르시면 그냥 다음으로 넘어가셔도 괜찮아요"
            />
            <NumberWheelSelect
              id="health-weight"
              label="몸무게"
              value={healthForm.weightKg}
              onChange={(v) => updateHealth("weightKg", v)}
              min={30}
              max={150}
              unit="kg"
            />
          </>
        )}

        {step === HEALTH_STEP.bloodPressure && (
          <>
            <StepHeading
              title="최근 잰 혈압이 있으세요?"
              hint="혈압계로 잰 두 숫자예요. 모르시면 그냥 다음으로 넘어가셔도 괜찮아요"
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="health-systolic" className="text-base">
                혈압 위쪽 숫자 (수축기)
              </Label>
              <NumberWheelSelect
                id="health-systolic"
                label="혈압 위쪽 숫자 (수축기)"
                value={healthForm.systolicBP}
                onChange={(v) => updateHealth("systolicBP", v)}
                min={80}
                max={200}
                unit="mmHg"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="health-diastolic" className="text-base">
                혈압 아래쪽 숫자 (이완기)
              </Label>
              <NumberWheelSelect
                id="health-diastolic"
                label="혈압 아래쪽 숫자 (이완기)"
                value={healthForm.diastolicBP}
                onChange={(v) => updateHealth("diastolicBP", v)}
                min={50}
                max={120}
                unit="mmHg"
              />
            </div>
          </>
        )}

        {step === HEALTH_STEP.glucose && (
          <>
            <StepHeading
              title="최근 잰 혈당이 있으세요?"
              hint="모르시면 그냥 다음으로 넘어가셔도 괜찮아요"
            />
            <NumberWheelSelect
              id="health-glucose"
              label="혈당"
              value={healthForm.fastingGlucose}
              onChange={(v) => updateHealth("fastingGlucose", v)}
              min={50}
              max={300}
              unit="mg/dL"
            />
          </>
        )}

        {step === HEALTH_STEP.activityLevel && (
          <>
            <StepHeading title={`${wardName}님은 평소 얼마나 움직이세요?`} />
            <div className="flex flex-col gap-3">
              {ACTIVITY_LEVEL_OPTIONS.map((level) => (
                <OptionButton
                  key={level}
                  selected={healthForm.activityLevel === level}
                  onClick={() => updateHealth("activityLevel", level)}
                >
                  {ACTIVITY_LEVEL_LABEL[level]}
                </OptionButton>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 px-5 pb-6">
        {/* 목록에서 골라 들어온 단계엔 "이전"이 의미가 없다 — 순서상 앞 단계로 가는 버튼이지,
            목록으로 돌아가는 버튼이 아니라서 그대로 두면 오히려 헷갈린다. */}
        {!enteredFromOverview && step > sectionStart && (
          <Button
            variant="outline"
            size="lg"
            className="h-14 flex-1 text-lg"
            onClick={handleBack}
            disabled={submitting}
          >
            이전
          </Button>
        )}
        <Button
          size="lg"
          className="h-14 flex-[2] text-lg"
          onClick={handleNext}
          disabled={submitting}
        >
          {enteredFromOverview ? "확인" : isLast ? "완료" : "다음"}
        </Button>
      </div>
    </div>
  );
}
