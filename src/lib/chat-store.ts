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
