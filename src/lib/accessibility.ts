"use client";

import { useSyncExternalStore } from "react";
import { API_BASE_URL } from "@/lib/api-config";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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
    // pause()는 ended/error 이벤트를 안 일으킨다 — 그 이벤트에 걸려있는 clearIfStillCurrent
    // (speakingCardId 정리)가 안 불릴 수 있으므로, 여기서 직접 지운다. speechSynthesis는
    // cancel()이 onerror를 안정적으로 발생시켜서 원래 문제없었지만 Audio는 그렇지 않다.
    currentAzureAudio.pause();
    currentAzureAudio = null;
  }
  setSpeakingCardId(null);
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

  const { promise, controller, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/health/tts/synthesize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
    TTS_REQUEST_TIMEOUT_MS
  );
  // fetch가 끝나기 전부터(await 전에) 바로 잡아둔다 — 그래야 이 fetch가 진행되는 동안 다른
  // 카드가 탭돼도 stopCurrentPlayback()이 이 요청을 바로 취소할 수 있다.
  currentAbortController = controller;

  try {
    let audioBlob: Blob;
    try {
      const response = await promise;
      if (!response.ok) throw new Error(`TTS 합성 실패 (${response.status})`);
      // 타임아웃을 이 바디 다운로드가 끝날 때까지 살려둔다 — 헤더는 빨리 왔는데 바디
      // 스트리밍이 멈추는 경우도 커버해야 한다.
      audioBlob = await response.blob();
    } finally {
      clearRequestTimeout();
    }
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

// SOS 확인 음성처럼 "즉시 들려야" 하는 안내 전용 — speak()/speakOnDemand()와 달리 Azure
// 네트워크 TTS를 아예 시도하지 않고 브라우저 내장 음성으로 곧바로 재생한다. speakRaw()로
// 통일하면서 카드 읽어주기 등은 더 자연스러운 Azure 목소리를 우선 쓰게 됐는데, 그 대가로
// 응답이 없으면 최대 TTS_REQUEST_TIMEOUT_MS(10초)까지 무음일 수 있다 — 응급 상황일수록
// 네트워크가 불안정하기 쉬운 상황에서 안내가 늦게 나가는 건 받아들일 수 없어서 이 경로는
// 분리한다.
export function speakUrgent(text: string) {
  if (typeof window === "undefined") return;
  stopCurrentPlayback();
  speakWithBrowserVoice(text);
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

export type ListenController = { stop: () => void };

// 마이크 권한 팝업이 뜬 채로 사용자가 응답을 미루는 등, onresult/onerror/onend 중
// 아무것도 안 불리는 상황을 대비한 안전망(코드 리뷰 지적) — 없으면 "듣는 중" state가
// 영원히 안 풀리고, 그 state로 disabled되는 마이크 버튼도 영구히 눌러지지 않는 상태가
// 된다(복구법이 "이 화면을 나갔다가 다시 들어오는 것"뿐이었음). TTS_REQUEST_TIMEOUT_MS
// (10초)보다 넉넉하게 잡는다 — 저긴 순수 네트워크 왕복이지만 여긴 "사용자가 브라우저
// 권한 팝업을 보고 실제로 클릭"하는 사람의 반응 시간까지 포함해야 한다.
const LISTEN_TIMEOUT_MS = 20_000;

// 음성 인식 한 번을 시작하고, "끝났다"는 신호(onEnd)를 정확히 한 번, 무조건 불러주는 걸
// 보장하는 게 이 함수의 핵심 역할이다 — 호출부(예: assistant-chat-view.tsx)는 보통
// onEnd에서 "듣는 중" state를 끄는데, start()가 동기적으로 던지거나(예: 마이크 권한이
// 방금 취소된 경우) onerror 뒤에 onend가 안 오는 브라우저에서 onEnd가 한 번도 안 불리면
// 그 state가 영원히 안 풀린다 — 코드 리뷰에서 지적된 문제. finish()를 한 곳에 모아 어느
// 경로로 끝나든(정상 종료/에러/시작 실패/타임아웃) 딱 한 번만 불리게 한다.
//
// 반환하는 컨트롤러의 stop()은 화면이 언마운트될 때 호출부가 꼭 불러야 한다 — 안 그러면
// 사용자가 마이크를 켠 채 다른 화면으로 이동해도 인식이 계속 켜져 있고, 나중에 도착하는
// onresult/onend가 이미 떠난 화면의 오래된 클로저를 건드리게 된다(마찬가지로 코드
// 리뷰 지적). supported:false면 stop()은 그냥 아무 일도 안 하는 no-op이라 호출부가
// null 체크 없이 항상 unmount cleanup에서 불러도 안전하다.
export function listenOnce(callbacks: {
  onResult: (transcript: string) => void;
  onError: () => void;
  onEnd: () => void;
}): { supported: boolean } & ListenController {
  const Recognition = getSpeechRecognition();
  if (!Recognition) {
    return { supported: false, stop: () => {} };
  }

  const recognition = new Recognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let ended = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function clearListenTimeout() {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function finish() {
    if (ended) return;
    ended = true;
    clearListenTimeout();
    callbacks.onEnd();
  }

  // stop()(수동 취소·언마운트·타임아웃)이 recognition.stop()을 부른 뒤에도, Web Speech
  // API 특성상 마지막 onresult(드물게 onerror)가 한 번 더 비동기로 도착할 수 있다 — 이미
  // 떠난 화면의 오래된 클로저를 건드려, 사용자가 지금 보고 있는 다른 화면에 뜬금없는
  // 에러 토스트가 뜨는 원인이었다(코드 리뷰 지적). 핸들러 자체를 무력화해서 늦게 오는
  // 이벤트가 아무 데도 닿지 않게 한다.
  function detachHandlers() {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }

  recognition.onresult = (event) => {
    callbacks.onResult(event.results[0][0].transcript);
  };
  recognition.onerror = () => {
    // onend가 뒤따를 거라고 믿지 않는다 — onerror 뒤에 onend를 안 불러주는 브라우저가
    // 있어서(코드 리뷰 지적), 여기서 바로 finish()까지 부른다. 진짜로 onend가 나중에
    // 또 오더라도 ended 플래그가 막아줘서 onEnd가 두 번 불리진 않는다.
    callbacks.onError();
    finish();
  };
  recognition.onend = finish;

  try {
    recognition.start();
  } catch {
    // 권한이 막 취소됐거나 이미 다른 인식이 돌고 있는 등, start() 자체가 동기적으로 던지는
    // 경우 — onerror/onend가 아예 안 불릴 상황이라 여기서 직접 처리해야 한다.
    callbacks.onError();
    finish();
    return { supported: true, stop: () => {} };
  }

  timeoutId = setTimeout(() => {
    detachHandlers();
    try {
      recognition.stop();
    } catch {
      // 이미 끝난 인식에 stop()을 부르면 일부 브라우저가 던진다 — finish()는 아래서
      // 어차피 부르니 무시해도 안전하다.
    }
    callbacks.onError();
    finish();
  }, LISTEN_TIMEOUT_MS);

  return {
    supported: true,
    stop: () => {
      detachHandlers();
      try {
        recognition.stop();
      } catch {
        // 이미 끝난 인식에 stop()을 부르면 일부 브라우저가 던진다 — finish()는 아래서
        // 어차피 부르니 무시해도 안전하다.
      }
      finish();
    },
  };
}
