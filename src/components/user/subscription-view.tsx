"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import {
  PLANS,
  PAYMENT_METHOD,
  selfSubscriptionPlanStore,
  resolveDisplayPlanId,
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
//
// 이 화면은 QR 초대로 보호자가 관리하는 대상자의 마이페이지에서도 똑같이 열린다(profile-view.tsx가
// 역할 구분 없이 카드를 보여줌) — 그런 대상자는 이미 보호자가 funding_source="guardian"으로
// 구독을 만들어놨을 수 있는데, 여기서 아무 플랜이나 눌러 새로 구독하면 백엔드가 기존 구독을
// 자동 취소하고 이걸로 대체해버린다(subscription/router.py register_subscription 주석). 이미
// 활성 구독이 있는 상태에서 다른 플랜을 고르면 "지금 구독을 대체하는 것"임을 명시적으로
// 확인받는다 — 특히 본인이 이 화면에서 만든 게 아닌 구독(funding_source !== "self", 즉
// 보호자가 만들었을 가능성이 높은 경우)은 문구를 더 강하게 경고한다.
export function SelfSubscriptionView({ ward }: { ward: Ward }) {
  const rememberedPlans = useLocalStore(selfSubscriptionPlanStore);
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  const identity = { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address };

  const [checkingBackend, setCheckingBackend] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  // 백엔드 PlanType은 base/premium 2단계뿐이라 basic/standard를 구분 못 한다 — 실제로
  // 활성 상태인 plan_type과, 이 화면에서 마지막으로 골랐던 3단계 id를 합쳐서 표시용 id를
  // 만든다(resolveDisplayPlanId). 아직 백엔드 상태를 확인 전(null)엔 아무 카드도 "이용중"
  // 취급하지 않는다.
  const [displayPlanId, setDisplayPlanId] = useState<string | null>(null);
  const [activeFundingSource, setActiveFundingSource] = useState<string | null>(null);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSubscriptionBackend(identity).then((result) => {
      if (cancelled) return;
      setHasActiveSubscription(result !== null);
      setActiveFundingSource(result?.fundingSource ?? null);
      setDisplayPlanId(result ? resolveDisplayPlanId(result.planType, rememberedPlans[ward.id]) : null);
      setCheckingBackend(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward.id]);

  async function handleSelectPlan(planId: string) {
    if (hasActiveSubscription) {
      const warning =
        activeFundingSource && activeFundingSource !== "self"
          ? "이미 보호자가 관리하는 구독이 활성화돼 있어요. 지금 다른 플랜을 선택하면 그 구독이 취소되고 이 플랜으로 바뀌어요. 계속할까요?"
          : "지금 이용 중인 구독을 취소하고 이 플랜으로 바꿀까요?";
      if (!window.confirm(warning)) return;
    }

    setSyncingPlanId(planId);
    const result = await syncSubscriptionToBackend(identity, planId, "self");
    setSyncingPlanId(null);
    if (!result.ok) {
      // "no-backend-access"는 fetch를 시도조차 못 한 경우다(이 대상자로 백엔드에 로그인한
      // 이력이 없어 resolveBackendWardAccess가 토큰을 못 구함) — 가입 시 백엔드가 일시
      // 장애였을 때 흔히 생기고, 재로그인하면 그 세션이 새로 만들어져 해결된다. 나머지
      // (network/rejected)는 일반적인 "잠시 후 다시" 안내로 충분하다.
      toast.error(
        result.reason === "no-backend-access"
          ? "이 계정으로 백엔드에 연결된 적이 없어요. 로그아웃 후 다시 로그인하면 해결될 수 있어요."
          : "구독 신청에 실패했어요. 잠시 후 다시 시도해 주세요."
      );
      return;
    }
    selfSubscriptionPlanStore.update((prev) => ({ ...prev, [ward.id]: planId }));
    setHasActiveSubscription(true);
    setActiveFundingSource("self");
    setDisplayPlanId(planId);
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
        {!checkingBackend && hasActiveSubscription && activeFundingSource && activeFundingSource !== "self" && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            지금 이용 중인 구독은 보호자가 관리하고 있어요. 다른 플랜으로 바꾸면 보호자가
            설정한 구독이 취소돼요.
          </div>
        )}

        {PLANS.map((plan) => {
          const isCurrent = hasActiveSubscription && plan.id === displayPlanId;
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
