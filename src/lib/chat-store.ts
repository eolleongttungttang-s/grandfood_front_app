"use client";

import { createLocalStore } from "@/lib/local-store";

export type ChatMessage = {
  id: string;
  threadId: string;
  from: string;
  text: string;
  timestamp: number;
};

export const chatStore = createLocalStore<ChatMessage[]>("grandfood-app-chat", []);

export function nutritionistThreadId(wardId: string) {
  return `nutritionist:${wardId}`;
}

export function assistantThreadId(wardId: string) {
  return `assistant:${wardId}`;
}

export function familyThreadId(wardId: string) {
  return `family:${wardId}`;
}

export function addMessage(threadId: string, from: string, text: string) {
  chatStore.update((prev) => [
    ...prev,
    { id: crypto.randomUUID(), threadId, from, text, timestamp: Date.now() },
  ]);
}

export function threadMessages(all: ChatMessage[], threadId: string) {
  return all.filter((m) => m.threadId === threadId);
}

// AI 도우미(assistant-chat-view.tsx) 전용 — 나가면 대화 기록을 지운다(2026-08-21 피드백,
// "나가기 기능"/"재접속 시 초기화"를 화면을 벗어날 때 한 번에 지우는 걸로 묶어서 처리).
// 영양사 상담(nutritionist-chat-view.tsx)은 이력을 남겨두는 게 맞는 화면이라(과거 상담 내용
// 참고), 여기서 threadId를 받는 형태로 남겨서 다른 스레드에 실수로 안 번지게 한다.
export function clearThread(threadId: string): void {
  chatStore.update((prev) => prev.filter((m) => m.threadId !== threadId));
}
