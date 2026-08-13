"use client";

// "AI 반찬 추천 요청 + 결과" 카드. 이용자 본인 화면(diet-view.tsx)과 보호자 화면
// (ward-detail-view.tsx) 양쪽에서 그대로 재사용한다 — 두 화면 다 대상자 신원(ward)만
// 알면 되고 화면별로 다른 게 없어서, ward-invite-view.tsx류처럼 화면마다 따로 만들지 않았다.
//
// fetch/요청 상태는 이 컴포넌트가 직접 들고 있지 않고 use-monthly-banchan-recommendation.ts의
// useMonthlyBanchanRecommendation() 훅 결과를 상위 화면에서 props로 받는다 — diet-view.tsx는 이
// 상태(특히 isNewMember)를 보고 카드 자체가 아니라 화면 전체를 다르게 그려야 해서, 상태를
// 컴포넌트 안에 가두면 상위 화면이 같은 데이터를 다시 fetch해야 하는 구조가 된다.

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MonthlyBanchanRecommendationState } from "@/lib/use-monthly-banchan-recommendation";
import { BanchanRecommendationCalendar } from "@/components/app/banchan-recommendation-calendar";

export function BanchanRecommendationSection({
  state,
  subscribeHref,
}: {
  state: MonthlyBanchanRecommendationState;
  /** 구독이 없어서(hasActiveSubscription === false) 못 받을 때 보여줄 "구독하러 가기"
   *  버튼이 이동할 경로 — 이용자 본인 화면(diet-view.tsx)은 "/user/subscription", 보호자
   *  화면(ward-detail-view.tsx)은 "/guardian/subscription"으로 서로 다르다. */
  subscribeHref: string;
}) {
  const { month, monthly, loading, requesting, polling, error, hasActiveSubscription, request } = state;
  // health/service.py의 get_active_subscription이 활성 구독을 요구하기 때문에, 구독이 없는
  // 상태에서 "AI 추천받기"를 눌러봐야 항상 404로 실패한다 — 실패를 겪게 두는 대신, 구독부터
  // 하도록 안내한다. hasActiveSubscription이 아직 null(확인 중)이면 판단이 서기 전까지는
  // 기존 버튼을 disabled로 두고(깜빡임 방지), false로 확정된 뒤에야 버튼을 통째로 바꾼다.
  const needsSubscription = hasActiveSubscription === false;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sidebar-primary">AI 반찬 추천</span>
          <span className="text-base font-bold text-foreground">{month} 월 배송 추천</span>
        </div>
        {needsSubscription ? (
          <Button size="sm" nativeButton={false} render={<Link href={subscribeHref} />}>
            <Sparkles />
            구독하러 가기
          </Button>
        ) : (
          <Button size="sm" onClick={request} disabled={requesting || loading || hasActiveSubscription == null}>
            <Sparkles />
            {requesting ? "요청하는 중..." : monthly ? "다시 추천받기" : "AI 추천받기"}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">추천 정보를 불러오는 중...</p>
      ) : needsSubscription ? (
        <p className="text-sm text-muted-foreground">
          구독이 있어야 AI 반찬 추천을 받을 수 있어요. 위 버튼을 눌러 먼저 구독을 시작해 주세요.
        </p>
      ) : !monthly || monthly.weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 이번 달 AI 반찬 추천을 요청하지 않았어요. 위 버튼을 눌러 받아보세요.
        </p>
      ) : (
        <BanchanRecommendationCalendar monthly={monthly} polling={polling} />
      )}
    </div>
  );
}
