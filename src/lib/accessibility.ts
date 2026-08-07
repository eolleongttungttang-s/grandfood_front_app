"use client";

import { useSyncExternalStore } from "react";
import { API_BASE_URL } from "@/lib/api-config";
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

// 지금 재생 중인 Azure 음성(Audio 엘리먼트)을 들고 있는다 — 브라우저 음성(speechSynthesis)은
// window가 자체적으로 재생 상태를 들고 있어서 별도 추적이 필요 없지만, Audio는 우리가 직접
// 참조를 갖고 있어야 다음 재생 시작 전에, 또는 stopSpeaking()에서 멈출 수 있다.
let currentAzureAudio: HTMLAudioElement | null = null;
// 백엔드가 준 오디오 바이트로 만든 임시 재생 URL(createObjectURL) — 브라우저 메모리에만
// 존재하고 우리가 명시적으로 revokeObjectURL()로 해제해야 새는 걸 막을 수 있다. Blob
// Storage를 거치지 않게 되면서 생긴 정리 대상.
let currentObjectUrl: string | null = null;
// 진행 중인 TTS 합성 요청을 취소할 수 있게 들고 있는다 — 새 카드를 연달아 탭하면 이전
// 요청은 더 이상 필요 없으니 끊는다. 다만 백엔드가 이미 Azure Speech 변환을 시작한 뒤라면
// 그 작업 자체는 서버에서 끝까지 진행된다(스레드 강제 중단 불가) — 아직 처리 시작 전인
// 요청의 비용만 절약되는, 부분적인 최적화다.
let currentAbortController: AbortController | null = null;

// speakRaw가 네트워크 왕복(fetch)을 거치는 동안 다른 카드가 연달아 탭되거나 stopSpeaking()이
// 불릴 수 있다 — 이 함수를 거칠 때마다 토큰을 올려서, 이미 나가있는 fetch가 나중에 응답을
// 받아도 "그 사이 취소/대체됐다"는 걸 알고 재생을 포기하게 한다.
let playbackToken = 0;

function stopCurrentPlayback() {
  playbackToken++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAzureAudio) {
    currentAzureAudio.pause();
    currentAzureAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

function speakWithBrowserVoice(text: string, cardId?: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
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

// 카드 문구는 챗봇 답변(rag-chat.ts, 30초)보다 훨씬 짧아 정상적으로는 금방 끝난다 — 그보다
// 짧게 잡아서, 응답이 안 오는 상황(백엔드 다운 등)에서 어르신이 카드를 눌러도 아무 반응 없이
// 오래 멈춰있는 시간을 줄인다.
const TTS_REQUEST_TIMEOUT_MS = 10_000;

// 백엔드 Azure Speech 엔드포인트로 음성을 합성해 재생한다. 실패(백엔드 다운, Azure 설정
// 누락, 타임아웃 등)하면 지금까지 쓰던 브라우저 내장 음성으로 폴백한다 — 이 함수 하나만
// 이렇게 바꾸면 speak/speakOnDemand/speakCard 등 호출부는 손댈 필요 없다.
async function speakRaw(text: string, cardId?: string) {
  if (typeof window === "undefined") return;
  stopCurrentPlayback();
  const myToken = playbackToken; // stopCurrentPlayback()이 이미 올려둔 값 = 이 호출의 신분증

  const controller = new AbortController();
  currentAbortController = controller;
  const timeoutId = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/health/tts/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) throw new Error(`TTS 합성 실패 (${response.status})`);
    const audioBlob = await response.blob();
    if (myToken !== playbackToken) return; // 그 사이 더 최신 요청이 들어옴 — 이 응답은 버림

    const objectUrl = URL.createObjectURL(audioBlob);
    currentObjectUrl = objectUrl;
    const audio = new Audio(objectUrl);
    currentAzureAudio = audio;
    // 재생이 끝나거나(정상/에러 모두) object URL을 해제한다. currentObjectUrl이 그 사이 다른
    // 재생으로 이미 바뀌었다면(stopCurrentPlayback에서 이미 revoke됐을 것) 자기 것일 때만
    // 지워서 중복 해제를 피한다.
    const revokeIfStillCurrent = () => {
      if (currentObjectUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentObjectUrl = null;
      }
    };
    audio.addEventListener("ended", revokeIfStillCurrent);
    audio.addEventListener("error", revokeIfStillCurrent);
    if (cardId) {
      const clearIfStillCurrent = () => {
        if (speakingCardId === cardId) setSpeakingCardId(null);
      };
      audio.onplay = () => setSpeakingCardId(cardId);
      audio.onended = clearIfStillCurrent;
      audio.onerror = clearIfStillCurrent;
    }
    await audio.play();
  } catch {
    if (myToken !== playbackToken) return;
    // 백엔드/Azure 실패 시 브라우저 음성으로 폴백
    speakWithBrowserVoice(text, cardId);
  }
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
  stopCurrentPlayback();
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
