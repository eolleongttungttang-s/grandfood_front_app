"use client";

// diet-view.tsx(이용자)와 ward-detail-view.tsx(보호자) 둘 다 "AI 반찬 추천" 카드를 보여줘야
// 하고, diet-view.tsx는 추가로 그 결과를 보고 "신규 회원인지"까지 판단해서 화면 전체를
// 바꿔야 한다 — 그래서 fetch/요청 상태를 컴포넌트 안에 가두지 않고 이 훅으로 뽑아서, 카드를
// 그리는 BanchanRecommendationSection과 그 상위 화면이 같은 상태를 공유하게 한다.

import { useEffect, useMemo, useState } from "react";

import {
  BanchanRecommendation,
  fetchBanchanRecommendation,
  getWeekStartDate,
  hasEverReceivedBanchanRecommendation,
  markBanchanRecommendationReceived,
  requestBanchanRecommendation,
} from "@/lib/banchan-recommendation";

export type WardIdentity = { wardId: string; wardName: string; wardAge: number; wardAddress: string };

export type BanchanRecommendationState = {
  weekStartDate: string;
  recommendation: BanchanRecommendation | null;
  loading: boolean;
  requesting: boolean;
  error: string | null;
  /** null = 아직 판단 전(최초 조회 중). true = 지금까지 AI 반찬 추천을 한 번도 받은 적
   *  없는 신규 회원. false = 예전에(이번 주가 아니어도) 한 번이라도 받은 적 있는 기존 회원. */
  isNewMember: boolean | null;
  request: () => Promise<void>;
};

function formatErrorMessage(err: unknown): string {
  return err instanceof TypeError
    ? "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."
    : err instanceof Error
      ? err.message
      : "AI 반찬 추천 요청에 실패했어요.";
}

export function useBanchanRecommendation(identity: WardIdentity): BanchanRecommendationState {
  // "이번 주"를 마운트 시점에 한 번 고정한다 — 자정을 넘겨 렌더가 다시 일어나도 이미 불러온
  // 결과와 요청 버튼이 갑자기 다른 주를 가리키지 않게 하기 위함.
  const weekStartDate = useMemo(() => getWeekStartDate(), []);
  const [recommendation, setRecommendation] = useState<BanchanRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 로컬에 "예전에 한 번이라도 받은 적 있다" 기록이 이미 있으면 조회 결과를 기다릴 것 없이
  // 바로 "기존 회원"으로 확정한다 — 없으면 이번 주 GET 결과가 올 때까지는 판단을 미룬다
  // (null): 신규 회원 온보딩 화면이 잠깐 떴다가 기존 회원 화면으로 바뀌는 깜빡임을 피한다.
  const [isNewMember, setIsNewMember] = useState<boolean | null>(
    hasEverReceivedBanchanRecommendation(identity.wardId) ? false : null
  );

  useEffect(() => {
    let cancelled = false;
    // BanchanRecommendationSection의 원래 effect와 같은 이유로(react-hooks/set-state-in-effect
    // 회피) initial state를 그대로 쓰고 effect 안에서 setLoading(true)를 다시 부르지 않는다 —
    // 이 화면은 대상자별로 다시 마운트되는 구조라 effect는 사실상 마운트당 한 번만 돈다.
    fetchBanchanRecommendation(identity, weekStartDate)
      .then((result) => {
        if (cancelled) return;
        setRecommendation(result);
        if (result) {
          markBanchanRecommendationReceived(identity.wardId);
          setIsNewMember(false);
        } else if (!hasEverReceivedBanchanRecommendation(identity.wardId)) {
          setIsNewMember(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // wardName/Age/Address는 최초 백엔드 User 생성(ensureBackendWardId) 시에만 쓰이는 더미
    // 필드라 wardId 하나만 바뀌었을 때 다시 부르면 충분하다 — rag-chat.ts 호출부들과 동일한 전제.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.wardId, weekStartDate]);

  async function request() {
    setRequesting(true);
    setError(null);
    try {
      const result = await requestBanchanRecommendation(identity, weekStartDate);
      setRecommendation(result);
      markBanchanRecommendationReceived(identity.wardId);
      setIsNewMember(false);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setRequesting(false);
    }
  }

  return { weekStartDate, recommendation, loading, requesting, error, isNewMember, request };
}
