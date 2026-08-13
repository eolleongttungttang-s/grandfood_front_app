"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  CARE_SURVEY_STEP,
  CARE_SURVEY_TOTAL_STEPS,
  CONDITION_POOL,
  DISLIKED_INGREDIENT_POOL,
  EMPTY_CARE_PROFILE_COMMAND,
  LIVING_ARRANGEMENT_LABEL,
  LivingArrangement,
  MOBILITY_LABEL,
  MobilityLevel,
  RegisterCareProfileCommand,
} from "@/lib/care-profile";
import { ACTIVITY_LEVEL_LABEL, ActivityLevel } from "@/lib/health-profile";
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

export function CareSurveyView({
  wardId,
  wardName,
  initialValues,
  initialHealthValues,
  onComplete,
  onSkip,
}: {
  wardId: string;
  wardName: string;
  initialValues?: RegisterCareProfileCommand;
  initialHealthValues?: HealthMetricsForm;
  onComplete: (cmd: RegisterCareProfileCommand, health: HealthMetricsForm) => void | Promise<void>;
  onSkip: (
    partial: RegisterCareProfileCommand,
    answeredStep: number,
    health: HealthMetricsForm
  ) => void | Promise<void>;
}) {
  // 이미 한 번 답한 적 있으면(initialValues 있음) 14단계를 처음부터 다시 훑게 하는 대신,
  // "무엇을 수정할지" 고르는 목록 화면을 먼저 보여준다 — 처음 온보딩(초대/가입 직후, 답한
  // 적 없음)은 지금까지처럼 순서대로 다 물어본다.
  const isEditMode = initialValues !== undefined;
  const [mode, setMode] = useState<"overview" | "wizard">(isEditMode ? "overview" : "wizard");
  // 목록 화면에서 특정 단계로 바로 들어온 경우, 그 단계를 확인하고 나면 다음 단계로
  // 넘어가는 게 아니라 목록으로 돌아가야 한다 — 순서대로 진행 중인 것과 버튼 동작이
  // 달라야 해서 이 값으로 구분한다.
  const [enteredFromOverview, setEnteredFromOverview] = useState(false);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RegisterCareProfileCommand>(
    initialValues ?? { ...EMPTY_CARE_PROFILE_COMMAND, wardId }
  );
  const [healthForm, setHealthForm] = useState<HealthMetricsForm>(
    initialHealthValues ?? EMPTY_HEALTH_METRICS_FORM
  );
  const [submitting, setSubmitting] = useState(false);

  function jumpToStep(target: number) {
    setStep(target);
    setEnteredFromOverview(true);
    setMode("wizard");
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

  const isLast = step === TOTAL_STEPS - 1;

  async function handleNext() {
    // 목록에서 골라 들어온 단계면 "다음"이 다음 단계로 넘어가는 게 아니라 방금 고친 값을
    // 들고 목록으로 돌아간다 — 순서대로 쭉 진행하는 흐름과는 이 버튼의 의미 자체가 다르다.
    if (enteredFromOverview) {
      setEnteredFromOverview(false);
      setMode("overview");
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
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSkip() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // care-profile.ts의 answeredStep은 "care-profile 단계 중 몇 번째까지 답했는지"라는
      // 의미로 문서화돼 있어(0~CARE_SURVEY_TOTAL_STEPS) — 건강정보 단계(9~13)까지 진행한
      // 뒤 건너뛰어도 care-profile 쪽엔 그 의미를 벗어나지 않게 상한을 맞춰서 전달한다.
      // (health는 건너뛴 시점의 값 그대로 partial 저장 — 별도 진행도 추적은 안 함.)
      await onSkip(form, Math.min(step, CARE_SURVEY_TOTAL_STEPS), healthForm);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "overview") {
    const rows: { step: number; label: string; value: string }[] = [
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
        value: form.takesMedication ? form.medicationNote || "있음" : "없음",
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
              {step + 1} / {TOTAL_STEPS}
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
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="medication-note" className="text-base">
                  약 이름이나 복용 시간을 적어주세요 (아는 만큼만 적어도 괜찮아요)
                </Label>
                <Textarea
                  id="medication-note"
                  className="min-h-20 text-lg"
                  placeholder="예: 혈압약, 아침 식후"
                  value={form.medicationNote}
                  onChange={(e) => update("medicationNote", e.target.value)}
                />
              </div>
            )}
          </>
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
        {!enteredFromOverview && step > 0 && (
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
