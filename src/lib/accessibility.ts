"use client";

import { createLocalStore } from "@/lib/local-store";

export type AccessibilitySettings = {
  largeText: boolean;
  highContrast: boolean;
  voiceGuidance: boolean;
};

const DEFAULT_SETTINGS: AccessibilitySettings = {
  largeText: false,
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

export function speak(text: string) {
  if (typeof window === "undefined") return;
  if (!accessibilityStore.read().voiceGuidance) return;
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
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
