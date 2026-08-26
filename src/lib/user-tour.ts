"use client";

import { useSyncExternalStore } from "react";

// 튜토리얼 탭 4장(홈/식단/섭취기록/마이)을 더 이상 별도 화면(슬라이드)으로 안 보여주고,
// 실제 /user/home ~ /user/profile 화면 위에 스포트라이트로 하나씩 강조하는 방식으로
// 바꿨다(2026-08-26 피드백 — "튜토리얼 개별 화면으로 만드니까 실제 화면이랑 따로 놀아서
// 헷갈린다"). user/layout.tsx(UserShell)는 /user/* 안에서 페이지를 옮겨다녀도 계속 같은
// 컴포넌트로 남아있으므로(Next App Router 레이아웃 특성), 이 진행 상태를 거기서 들고
// 있으면 탭 사이를 실제로 이동하면서도 오버레이가 안 끊긴다. localStorage가 아니라 순수
// 메모리 상태인 이유: 새로고침까지 이어갈 필요 없는 일회성 안내라, 굳이 영속화해서
// 복잡하게 만들 필요가 없다.
export type UserTourStep = {
  href: string;
  title: string;
  hint: string;
};

export const USER_TOUR_STEPS: UserTourStep[] = [
  {
    href: "/user/home",
    title: "홈에서 오늘 상태를 한눈에 확인해요",
    hint: "새로운 안내나 확인할 알림이 있으면 여기서 보여드려요",
  },
  {
    href: "/user/diet",
    title: "식단에서 오늘 드실 반찬을 미리 봐요",
    hint: "AI가 추천한 반찬을 매 끼니 확인할 수 있어요",
  },
  {
    href: "/user/records",
    title: "섭취기록에서 잔반 분석 결과를 확인해요",
    hint: "식사 사진을 올리면 반찬별로 얼마나 드셨는지 알려드려요",
  },
  {
    href: "/user/profile",
    title: "마이에서 내 정보를 관리해요",
    hint: "질환·복약 정보나 안부확인알람을 여기서 설정해요",
  },
];

let tourStep: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function startUserTour() {
  tourStep = 0;
  notify();
}

export function setUserTourStep(step: number) {
  tourStep = step;
  notify();
}

export function endUserTour() {
  tourStep = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return tourStep;
}

function getServerSnapshot() {
  return null;
}

export function useUserTourStep(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
