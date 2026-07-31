"use client";

import { useState } from "react";

import {
  CONDITION_POOL,
  DISLIKED_INGREDIENT_POOL,
  EMPTY_CARE_PROFILE_COMMAND,
  LivingArrangement,
  MobilityLevel,
  RegisterCareProfileCommand,
} from "@/lib/care-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 9;

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
  onComplete,
  onSkip,
}: {
  wardId: string;
  wardName: string;
  initialValues?: RegisterCareProfileCommand;
  onComplete: (cmd: RegisterCareProfileCommand) => void | Promise<void>;
  onSkip: (partial: RegisterCareProfileCommand) => void | Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RegisterCareProfileCommand>(
    initialValues ?? { ...EMPTY_CARE_PROFILE_COMMAND, wardId }
  );
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof RegisterCareProfileCommand>(
    key: K,
    value: RegisterCareProfileCommand[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete(form);
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
      await onSkip(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
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

      <div className="flex flex-1 flex-col gap-5 px-5 py-6">
        {step === 0 && (
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

        {step === 1 && (
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

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
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

        {step === 5 && (
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

        {step === 6 && (
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

        {step === 7 && (
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

        {step === 8 && (
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
                <Input
                  id="ec-phone"
                  className="h-14 text-lg"
                  placeholder="010-0000-0000"
                  value={form.emergencyContactPhone}
                  onChange={(e) => update("emergencyContactPhone", e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 px-5 pb-6">
        {step > 0 && (
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
          {isLast ? "완료" : "다음"}
        </Button>
      </div>
    </div>
  );
}
