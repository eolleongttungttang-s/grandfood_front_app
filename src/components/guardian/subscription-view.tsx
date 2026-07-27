"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { PLANS, PAYMENT_METHOD, subscriptionStore, formatWon } from "@/lib/subscription";
import { useLocalStore } from "@/lib/use-store";

export function SubscriptionView() {
  const currentPlanId = useLocalStore(subscriptionStore);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="구독 관리" subtitle="플랜과 결제수단" />

      <div className="flex flex-col gap-3 px-5">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
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
                  onClick={() => {
                    subscriptionStore.write(plan.id);
                    toast.success(`${plan.name} 플랜으로 변경했어요.`);
                  }}
                >
                  이 플랜으로 변경
                </Button>
              )}
            </div>
          );
        })}

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
