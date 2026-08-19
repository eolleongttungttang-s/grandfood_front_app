"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { ButtonSelectGroup } from "@/components/app/button-select-group";
import {
  PLANS,
  PAYMENT_METHOD,
  BANCHAN_PAYMENT_NOTICE,
  resolveDisplayPlanId,
  formatWon,
  syncSubscriptionToBackend,
  subscriptionSyncFailureMessage,
  fetchActiveSubscriptionBackend,
} from "@/lib/subscription";
import type { Ward } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";

type WardPlanState = { planId: string; fundingSource: string } | null;

export function SubscriptionView({ wards }: { wards: Ward[] }) {
  const [selectedWardId, setSelectedWardId] = useState(wards[0]?.id ?? "");
  // 대상자별로 플랜이 다를 수 있어서(2026-08-18 피드백 — 식사 준비가 아예 어려운
  // 어르신과 하루 한 끼만 챙겨도 되는 어르신처럼 필요한 수준이 다르다) 대상자 id를
  // 키로 하는 맵으로 관리한다. 값이 null이면 "확인했지만 구독 없음", 키 자체가
  // 없으면 아직 확인 전이라는 뜻이다 — "확인 전"과 "확인했지만 없음"을 별도
  // checkingBackend 불리언으로 구분하면(2026-08-18 코드 리뷰 지적), 대상자 목록이
  // 나중에 바뀌어(예: 보호자 백그라운드 동기화로 새 대상자가 추가됨) 이 맵을 다시
  // 채우는 동안 그 불리언을 true로 되돌리는 걸 깜빡하기 쉽고, 실제로 그래서 방금
  // 동기화된 대상자가 잠깐 "구독 없음"으로 잘못 보이는 문제가 있었다. 이 맵에 그
  // 대상자의 키가 있는지 없는지만으로 "확인 여부"를 그때그때 파생시키면 그런
  // 불일치 자체가 생길 수 없다.
  const [wardPlans, setWardPlans] = useState<Record<string, WardPlanState>>({});
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);

  const wardIdsKey = wards.map((w) => w.id).join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      wards.map((w) =>
        fetchActiveSubscriptionBackend({ mockWardId: w.id }).then(
          (result) =>
            [w.id, result ? { planId: resolveDisplayPlanId(result.planType), fundingSource: result.fundingSource } : null] as const
        )
      )
    ).then((entries) => {
      if (cancelled) return;
      setWardPlans(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardIdsKey]);

  // 처음 이 화면에 왔을 때 대상자가 0명이라 selectedWardId가 ""로 초기화된 채였다가,
  // 보호자 백그라운드 동기화(guardian-ward-sync.tsx)로 대상자가 뒤늦게 생기면 useState
  // 초기값은 재계산되지 않아 계속 ""로 남아 아무 대상자도 선택 안 된 채로 있는 문제가
  // 있었다 — selectedWardId가 현재 wards 목록에 없으면(이 경우 포함, 또는 선택했던
  // 대상자가 목록에서 빠진 경우) 첫 번째 대상자로 렌더 중에 바로 폴백한다. 이펙트로
  // setSelectedWardId를 다시 불러 상태를 동기화하는 대신 파생값으로 처리해서 불필요한
  // 리렌더 사이클을 만들지 않는다.
  const selectedWard =
    wards.find((w) => w.id === selectedWardId) ?? wards[0] ?? null;
  const selectedWardChecked = selectedWard !== null && selectedWard.id in wardPlans;
  const selectedWardPlan = selectedWard ? (wardPlans[selectedWard.id] ?? null) : null;

  async function handleSelectPlan(planId: string) {
    if (!selectedWard) return;
    const plan = PLANS.find((p) => p.id === planId);

    if (selectedWardPlan) {
      const warning =
        selectedWardPlan.fundingSource !== "guardian"
          ? `${selectedWard.name}님이 본인 명의로 직접 구독을 관리하고 있어요. 지금 변경하면 그 구독이 취소되고 이 플랜으로 바뀌어요. 계속할까요?`
          : `${selectedWard.name}님의 플랜을 "${plan?.name ?? "선택하신"}"(으)로 바꿀까요?`;
      if (!window.confirm(warning)) return;
    }

    setSyncingPlanId(planId);
    const result = await syncSubscriptionToBackend(
      { mockWardId: selectedWard.id, name: selectedWard.name, age: selectedWard.age, address: selectedWard.address },
      planId,
      "guardian"
    );
    setSyncingPlanId(null);

    if (!result.ok) {
      const message = subscriptionSyncFailureMessage(
        result.reason,
        "구독 변경에 실패했어요. 잠시 후 다시 시도해 주세요."
      );
      if (message) toast.error(message);
      return;
    }

    setWardPlans((prev) => ({ ...prev, [selectedWard.id]: { planId, fundingSource: "guardian" } }));
    toast.success(`${selectedWard.name}님을 "${plan?.name ?? "선택하신"}" 플랜으로 변경했어요.`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="구독 관리" subtitle="대상자별 플랜과 결제수단" />

      {wards.length === 0 ? (
        <div className="mx-5 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          아직 관리하는 대상자가 없어요. 대상자를 먼저 추가해주세요.
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <ButtonSelectGroup
              label="어느 대상자의 플랜을 바꿀까요?"
              options={wards.map((w) => ({ value: w.id, label: w.name }))}
              value={selectedWard?.id ?? ""}
              onChange={setSelectedWardId}
              columns={wards.length > 2 ? 3 : 2}
            />
          </div>

          {PLANS.map((plan) => {
            const isCurrent = !plan.comingSoon && selectedWardChecked && selectedWardPlan?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-sm ${
                  isCurrent ? "border-primary" : "border-border"
                } ${plan.comingSoon ? "opacity-70" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-foreground">{plan.name}</span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                      <Check className="h-3.5 w-3.5" />
                      {selectedWard?.name}님 이용중
                    </span>
                  )}
                  {plan.comingSoon && (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      출시 예정
                    </span>
                  )}
                </div>
                <span className="text-lg font-bold text-foreground">
                  {formatWon(plan.priceWon)}
                  <span className="text-xs font-normal text-muted-foreground"> /월</span>
                </span>
                <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                  {BANCHAN_PAYMENT_NOTICE}
                </span>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                {!isCurrent && !plan.comingSoon && (
                  <Button
                    size="sm"
                    className="w-fit"
                    disabled={!selectedWardChecked || syncingPlanId !== null}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    {syncingPlanId === plan.id
                      ? "변경 중..."
                      : selectedWardPlan
                        ? "이 플랜으로 변경"
                        : "이 플랜으로 시작하기"}
                  </Button>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xs font-bold text-foreground">배송 파트너 매장</span>
            <div className="flex flex-col gap-1">
              {wards.map((ward) => {
                const store = getPartnerStore(ward.partnerStoreId);
                return (
                  <div key={ward.id} className="flex justify-between text-sm">
                    <span className="text-foreground">{ward.name}</span>
                    <span className="text-muted-foreground">{store?.name ?? "-"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xs font-bold text-foreground">결제 수단</span>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">
                {PAYMENT_METHOD.brand} •••• {PAYMENT_METHOD.last4}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("결제수단 변경 화면으로 연결할게요.")}
              >
                변경
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
