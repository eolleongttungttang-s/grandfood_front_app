"use client";

import { useSyncExternalStore } from "react";
import { createLocalStore } from "@/lib/local-store";

export type AccessibilitySettings = {
  largeText: boolean;
  highContrast: boolean;
  voiceGuidance: boolean;
};

// largeText는 기본값부터 켜둔다 — 어르신 대상 서비스라 "찾아서 켜야 하는 옵션"이 아니라
// 기본 화면 자체가 커야 한다는 피드백에 따른 것. 끄고 싶은 사람(보호자 등)은 마이 화면에서 끌 수 있다.
const DEFAULT_SETTINGS: AccessibilitySettings = {
  largeText: true,
  highContrast: false,
  voiceGuidance: false,
};

export const accessibilityStore = createLocalStore<AccessibilitySettings>(
  "grandfood-app-accessibility",
  DEFAULT_SETTINGS
);

export function updateAccessibility(patch: Partial<AccessibilitySettings>) {
  accessibilityStore.update((prev) => ({ ...prev, ...patch }));
}

// 카드별 읽어주기(SpeakableCard)가 "지금 재생 중인 카드가 어디인지" 알아야 아이콘 상태와
// 같은 카드 재탭 시 토글(멈춤)을 구현할 수 있다. 새로고침/다른 탭에 이어질 이유가 없는
// 휘발성 재생 상태라 local-store.ts(localStorage 영속)는 안 쓰고 메모리에만 둔다.
type Listener = () => void;
const speakingCardListeners = new Set<Listener>();
let speakingCardId: string | null = null;

function setSpeakingCardId(id: string | null) {
  if (speakingCardId === id) return;
  speakingCardId = id;
  speakingCardListeners.forEach((listener) => listener());
}

export function useSpeakingCardId(): string | null {
  return useSyncExternalStore(
    (callback) => {
      speakingCardListeners.add(callback);
      return () => speakingCardListeners.delete(callback);
    },
    () => speakingCardId,
    () => null
  );
}

function speakRaw(text: string, cardId?: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  if (cardId) {
    // onend/onerror 둘 다에서 정리한다 — cancel()로 끊긴 경우 onend가 아니라 onerror
    // (interrupted/canceled)로 오는 브라우저가 있어서 하나만 걸면 아이콘이 "재생 중"으로
    // 눌어붙는 경우가 생긴다. speakingCardId가 그 사이 다른 카드로 이미 바뀌었으면
    // (연달아 다른 카드를 탭한 경우) 그 카드 상태를 덮어쓰지 않도록 자기 것일 때만 지운다.
    const clearIfStillCurrent = () => {
      if (speakingCardId === cardId) setSpeakingCardId(null);
    };
    utterance.onstart = () => setSpeakingCardId(cardId);
    utterance.onend = clearIfStillCurrent;
    utterance.onerror = clearIfStillCurrent;
  }
  window.speechSynthesis.speak(utterance);
}

export function speak(text: string) {
  if (!accessibilityStore.read().voiceGuidance) return;
  speakRaw(text);
}

// 음성 안내 설정(voiceGuidance)과 무관하게 항상 읽어주는 버튼용.
// 로그인 전 화면(예: 동의 화면)은 설정을 미리 켜둘 방법이 없어 speak()로는 무음이 될 수 있다.
export function speakOnDemand(text: string) {
  speakRaw(text);
}

// SpeakableCard 전용 — 스피커 아이콘이 음성 안내 설정과 무관하게 항상 보이므로(눌렀는데
// 조용하면 고장으로 보인다), speak()가 아니라 speakOnDemand()와 같은 방식으로 항상 재생한다.
export function speakCard(id: string, text: string) {
  speakRaw(text, id);
}

// 재생 중이던 카드를 직접 멈출 때(같은 카드 재탭 토글) 쓴다.
export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  setSpeakingCardId(null);
}

// 브라우저별 webkit 접두사 대응을 위한 최소 타입
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
