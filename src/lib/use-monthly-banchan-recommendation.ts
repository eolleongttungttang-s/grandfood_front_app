"use client";

// diet-view.tsx(이용자)와 ward-detail-view.tsx(보호자) 둘 다 "AI 반찬 추천" 카드를 보여줘야
// 하고, diet-view.tsx는 추가로 그 결과를 보고 "신규 회원인지"까지 판단해서 화면 전체를
// 바꿔야 한다 — 그래서 fetch/요청 상태를 컴포넌트 안에 가두지 않고 이 훅으로 뽑아서, 카드를
// 그리는 BanchanRecommendationSection과 그 상위 화면이 같은 상태를 공유하게 한다. 월간은
// 추가로 "생성이 백그라운드에서 끝날 때까지 폴링"까지 이 훅이 맡는다 — 화면 컴포넌트는 매 주의
// generationStatus만 보고 그리면 되고, 언제 다시 불러올지는 신경 쓸 필요가 없게 하기 위함.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchMonthlyBanchanRecommendation,
  getMonthString,
  hasEverReceivedBanchanRecommendation,
  markBanchanRecommendationReceived,
  MonthlyBanchanRecommendation,
  requestMonthlyBanchanRecommendation,
  WardIdentity,
} from "@/lib/banchan-recommendation";
import { fetchActiveSubscriptionBackend } from "@/lib/subscription";

export type MonthlyBanchanRecommendationState = {
  month: string;
  monthly: MonthlyBanchanRecommendation | null;
  loading: boolean;
  requesting: boolean;
  /** 어느 한 주라도 generationStatus가 "generating"이라 백그라운드에서 자동으로 다시 조회 중 */
  polling: boolean;
  error: string | null;
  /** null = 아직 판단 전(최초 조회 중). true = 지금까지 AI 반찬 추천을 한 번도 요청한 적
   *  없는 신규 회원. false = 예전에(이번 달이 아니어도) 한 번이라도 요청한 적 있는 기존 회원. */
  isNewMember: boolean | null;
  /** null = 아직 확인 전. AI 반찬 추천/구독 둘 다 활성 구독(health/service.py의
   *  get_active_subscription)이 없으면 항상 404로 막히므로, 화면이 "AI 추천받기" 버튼을
   *  보여주기 전에 먼저 구독부터 하도록 안내하는 데 쓴다(home-view.tsx/diet-view.tsx/
   *  banchan-recommendation-section.tsx). 구독을 누가 만들었는지(본인/보호자)는 안 가린다 —
   *  활성 구독만 있으면 true. */
  hasActiveSubscription: boolean | null;
  request: () => Promise<void>;
};

// 폴링을 이 횟수 넘게 반복하면 포기하고 에러로 전환한다 — 백엔드가 응답 자체는 200으로 계속
// 주는데 generating에서 안 벗어나는 이상 상태(예: 백그라운드 태스크가 죽음)에서 무한히
// 네트워크를 쏘지 않기 위한 안전장치. 4초 * 45회 = 3분이면 정상적인 한 달치 생성(주 4~5개)
// 시간으로 충분히 넉넉하다.
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 45;

function formatErrorMessage(err: unknown): string {
  return err instanceof TypeError
    ? "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."
    : err instanceof Error
      ? err.message
      : "AI 반찬 추천 요청에 실패했어요.";
}

function isGenerating(monthly: MonthlyBanchanRecommendation | null): boolean {
  return monthly?.weeks.some((week) => week.generationStatus === "generating") ?? false;
}

// 이 달에 대해 뭔가(생성 중이든 완료든 실패든) 이미 한 번이라도 요청된 적이 있는지 —
// 모든 주가 not_started면 이 달은 아직 한 번도 요청 안 한 것이다. banchan-recommendation-
// section.tsx도 "다시 추천받기" 문구를 이 기준으로 골라야 해서 export한다 — monthly가
// null이 아니라고 해서 실제로 뭔가 요청된 건 아니다(구독만 있어도 전부 not_started인 채로
// 200이 옴, banchan-recommendation.ts의 fetchMonthlyBanchanRecommendation 주석 참고).
export function hasAnyProgress(monthly: MonthlyBanchanRecommendation | null): boolean {
  return monthly?.weeks.some((week) => week.generationStatus !== "not_started") ?? false;
}

export function useMonthlyBanchanRecommendation(identity: WardIdentity): MonthlyBanchanRecommendationState {
  // weekStartDate와 같은 이유로 "이 달"을 마운트 시점에 한 번 고정한다.
  const month = useMemo(() => getMonthString(), []);
  const [monthly, setMonthly] = useState<MonthlyBanchanRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);
  // 폴링 재실행을 monthly 참조 변경에만 기대면, 폴링 도중 fetch가 실패/null을 반환한 회차엔
  // setMonthly가 아예 안 불려서 monthly 참조가 안 바뀌고 — 그럼 이 값을 의존성으로 쓰는
  // 아래 useEffect가 다시 안 돌아 폴링이 조용히 영구 정지한다(에러 메시지도 안 뜸). 매
  // 폴링 시도마다(성공/실패 무관) 이 값을 올려서 effect가 항상 다시 실행되게 한다.
  const [pollTick, setPollTick] = useState(0);
  // 로컬에 "예전에 한 번이라도 받은 적 있다" 기록이 이미 있으면 조회 결과를 기다릴 것 없이
  // 바로 "기존 회원"으로 확정한다 — 없으면 이번 달 GET 결과가 올 때까지는 판단을 미룬다
  // (null): 신규 회원 온보딩 화면이 잠깐 떴다가 기존 회원 화면으로 바뀌는 깜빡임을 피한다.
  const [isNewMember, setIsNewMember] = useState<boolean | null>(
    hasEverReceivedBanchanRecommendation(identity.wardId) ? false : null
  );
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMonthlyBanchanRecommendation(identity, month)
      .then((result) => {
        if (cancelled) return;
        setMonthly(result);
        if (hasAnyProgress(result)) {
          markBanchanRecommendationReceived(identity.wardId);
          setIsNewMember(false);
        } else if (!hasEverReceivedBanchanRecommendation(identity.wardId)) {
          setIsNewMember(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // 신규 회원 화면(home-view.tsx/diet-view.tsx)이 "AI 추천받기"를 누르기도 전에 구독부터
    // 안내해야 하므로, 월간 조회와 별도로(둘 다 서로 결과를 안 기다림) 병렬로 확인한다.
    fetchActiveSubscriptionBackend({ mockWardId: identity.wardId }).then((result) => {
      if (!cancelled) setHasActiveSubscription(result !== null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.wardId, month]);

  // monthly가 갱신될 때마다 "아직 생성 중인 주가 있는지" 확인해서, 있으면 스스로 다음 폴링을
  // 예약한다(각 폴링이 다음 폴링을 트리거하는 체인 방식) — 없으면 아무것도 안 하고 멈춘다.
  useEffect(() => {
    if (!isGenerating(monthly)) {
      pollAttemptsRef.current = 0;
      return;
    }
    if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
      setError("생성이 예상보다 오래 걸리고 있어요. 잠시 후 화면을 새로고침해 주세요.");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      pollAttemptsRef.current += 1;
      const result = await fetchMonthlyBanchanRecommendation(identity, month);
      if (cancelled) return;
      if (result) setMonthly(result);
      // 성공/실패 무관하게 다음 회차를 예약하도록 effect를 다시 트리거한다 — result가
      // null이어도(일시적 네트워크 오류 등) 폴링이 멈추지 않게 하기 위함.
      setPollTick((t) => t + 1);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, pollTick, identity.wardId, month]);

  async function request() {
    setRequesting(true);
    setError(null);
    try {
      const result = await requestMonthlyBanchanRecommendation(identity, month);
      pollAttemptsRef.current = 0;
      setMonthly(result);
      markBanchanRecommendationReceived(identity.wardId);
      setIsNewMember(false);
      // 이 요청 자체가 활성 구독을 요구하므로(health/service.py), 성공했다는 건 구독이
      // 있다는 뜻이다 — 마운트 시점의 병렬 확인이 아직 안 끝났거나 그 사이 상태가 바뀐
      // 경우에도 여기서 확실하게 맞춰준다.
      setHasActiveSubscription(true);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setRequesting(false);
    }
  }

  return {
    month,
    monthly,
    loading,
    requesting,
    polling: isGenerating(monthly),
    error,
    isNewMember,
    hasActiveSubscription,
    request,
  };
}
