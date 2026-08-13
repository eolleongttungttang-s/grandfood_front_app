"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { PLANS, PAYMENT_METHOD, subscriptionStore, formatWon, syncSubscriptionToBackend } from "@/lib/subscription";
import { useLocalStore } from "@/lib/use-store";
import type { Ward } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";

export function SubscriptionView({ wards }: { wards: Ward[] }) {
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
                  onClick={async () => {
                    subscriptionStore.write(plan.id);
                    toast.success(`${plan.name} 플랜으로 변경했어요.`);
                    // 이 화면은 보호자 계정 전체에 플랜 하나만 고르는 UI라, 관리하는 모든
                    // 대상자에게 같은 플랜을 백엔드에도 반영한다(subscription.ts 주석 참고).
                    // 실패해도(서버 일시 장애 등) 이미 로컬 변경/안내는 끝난 뒤라 조용히 넘어간다.
                    await Promise.all(
                      wards.map((w) =>
                        syncSubscriptionToBackend(
                          { mockWardId: w.id, name: w.name, age: w.age, address: w.address },
                          plan.id
                        )
                      )
                    );
                  }}
                >
                  이 플랜으로 변경
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
    </div>
  );
}
