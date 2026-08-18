"use client";

import { useState } from "react";
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
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);

  // 대상자 수만큼 syncSubscriptionToBackend를 반복 호출한 뒤(이 화면은 보호자 계정 전체에
  // 플랜 하나만 고르는 UI라 관리하는 모든 대상자에게 동일 플랜을 반영, subscription.ts
  // 주석 참고) 결과를 종합한다. 예전엔 이 결과를 아예 안 보고 항상 성공 토스트를 먼저
  // 띄웠다 — 실제로는 no-backend-session(이 보호자로 백엔드에 로그인한 적이 없어 토큰
  // 자체를 못 구함)이라 fetch조차 한 번도 안 나갔는데도 "변경했어요"만 보이는, 버튼이
  // 눌러도 아무 반응이 없는 것처럼 느껴지던 원인이었다.
  async function handleSelectPlan(planId: string) {
    setSyncingPlanId(planId);
    const results = await Promise.all(
      wards.map((w) =>
        syncSubscriptionToBackend(
          { mockWardId: w.id, name: w.name, age: w.age, address: w.address },
          planId,
          "guardian"
        )
      )
    );
    setSyncingPlanId(null);

    const plan = PLANS.find((p) => p.id === planId);
    const succeeded = results.filter((r) => r.ok).length;

    // 대상자가 아예 없으면(관리하는 어르신을 아직 안 만든 보호자) 백엔드에 반영할 대상이
    // 없는 게 정상이라 바로 성공 처리한다 — results가 빈 배열이라 succeeded === 0이지만
    // wards.length도 0이라 "전부 실패"와 구분해야 한다.
    if (wards.length === 0 || succeeded === wards.length) {
      subscriptionStore.write(planId);
      toast.success(`${plan?.name ?? "선택하신"} 플랜으로 변경했어요.`);
      return;
    }

    if (succeeded > 0) {
      // 일부 대상자만 반영된 상태 — 여기서 subscriptionStore를 쓰면 이 플랜이 곧바로
      // "이용중"(isCurrent) 처리돼서, 실패한 대상자를 다시 반영할 "이 플랜으로 변경"
      // 버튼(!isCurrent 조건)이 화면에서 사라져버린다(코드 리뷰 지적) — 그래서 로컬
      // 표시는 갱신하지 않고, 나머지는 재시도해야 한다는 것만 알려준다.
      toast.warning(
        `${succeeded}/${wards.length}명에게만 플랜이 반영됐어요. 나머지는 잠시 후 다시 시도해 주세요.`
      );
      return;
    }

    // 전부 실패 — 세션 만료(401)로 인한 실패라면 fetch-with-timeout.ts의 전역 핸들러가
    // 이미 "다시 로그인해주세요" 토스트+리다이렉트를 처리 중이라 여기서 또 안내하지 않는다.
    if (results.some((r) => !r.ok && r.reason === "session-expired")) return;

    const allNoSession = results.every((r) => !r.ok && r.reason === "no-backend-session");
    toast.error(
      allNoSession
        ? "이 계정으로 백엔드에 연결된 적이 없어요. 로그아웃 후 다시 로그인하면 해결될 수 있어요."
        : "구독 변경에 실패했어요. 잠시 후 다시 시도해 주세요."
    );
  }

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
                  disabled={syncingPlanId !== null}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {syncingPlanId === plan.id ? "변경 중..." : "이 플랜으로 변경"}
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
