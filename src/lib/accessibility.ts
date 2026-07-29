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

function speakRaw(text: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  window.speechSynthesis.cancel();
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
