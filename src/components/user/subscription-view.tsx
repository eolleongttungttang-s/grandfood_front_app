"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import {
  PLANS,
  PAYMENT_METHOD,
  subscriptionStore,
  formatWon,
  syncSubscriptionToBackend,
  fetchActiveSubscriptionBackend,
} from "@/lib/subscription";
import { useLocalStore } from "@/lib/use-store";
import type { Ward } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";

// 보호자가 없는(자가등록) 이용자 본인 전용 구독 화면 — guardian/subscription-view.tsx와
// UI는 거의 같지만 대상자가 항상 본인 한 명뿐이고, funding_source가 "guardian"이 아니라
// "self"로 나간다(subscription.ts 참고). 이 화면이 없으면 자가등록 이용자는 건강 프로필까지
// 다 채워도 AI 반찬 추천이 "구독 없음"으로 영구히 막혀 있었다.
export function SelfSubscriptionView({ ward }: { ward: Ward }) {
  const currentPlanId = useLocalStore(subscriptionStore);
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  const identity = { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address };

  // subscriptionStore는 실제로 구독을 만든 적 없어도 기본값이 "standard"라, 로컬 값만
  // 보면 자가등록 직후에도 화면이 "이용중"으로 거짓 표시될 수 있다 — 백엔드에 진짜 활성
  // 구독이 있는지 마운트 시 한 번 확인해서, 있을 때만 "이용중" 배지를 보여준다.
  const [checkingBackend, setCheckingBackend] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSubscriptionBackend(identity).then((result) => {
      if (cancelled) return;
      setHasActiveSubscription(result !== null);
      setCheckingBackend(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward.id]);

  async function handleSelectPlan(planId: string) {
    setSyncingPlanId(planId);
    const ok = await syncSubscriptionToBackend(identity, planId, "self");
    setSyncingPlanId(null);
    if (!ok) {
      toast.error("구독 신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    subscriptionStore.write(planId);
    setHasActiveSubscription(true);
    const plan = PLANS.find((p) => p.id === planId);
    toast.success(`${plan?.name ?? "선택하신"} 플랜 구독을 시작했어요.`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="구독 관리" subtitle="플랜과 결제수단" />

      <div className="flex flex-col gap-3 px-5">
        {!checkingBackend && !hasActiveSubscription && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            아직 구독 중인 플랜이 없어요. 플랜을 선택하면 AI 반찬 추천을 포함한 서비스를 바로
            이용하실 수 있어요.
          </div>
        )}

        {PLANS.map((plan) => {
          const isCurrent = hasActiveSubscription && plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-sm ${
                isCurrent ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-extrabold text-foreground">{plan.name}</span>
                {isCurrent && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                    <Check className="h-3.5 w-3.5" />
                    이용중
                  </span>
                )}
              </div>
              <span className="text-lg font-bold text-foreground">
                {formatWon(plan.priceWon)}
                <span className="text-xs font-normal text-muted-foreground"> /월</span>
              </span>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {!isCurrent && (
                <Button
                  size="sm"
                  className="w-fit"
                  disabled={checkingBackend || syncingPlanId !== null}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {syncingPlanId === plan.id
                    ? "신청 중..."
                    : hasActiveSubscription
                      ? "이 플랜으로 변경"
                      : "이 플랜으로 시작하기"}
                </Button>
              )}
            </div>
          );
        })}

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">배송 파트너 매장</span>
          <div className="flex justify-between text-sm">
            <span className="text-foreground">{ward.name}</span>
            <span className="text-muted-foreground">{partnerStore?.name ?? "-"}</span>
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
    </div>
  );
}
