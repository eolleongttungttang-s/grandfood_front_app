"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addMessage,
  chatStore,
  nutritionistThreadId,
  threadMessages,
} from "@/lib/chat-store";
import { useLocalStore } from "@/lib/use-store";

const REPLIES = [
  "네, 확인했어요. 다음 식단에 바로 반영할게요.",
  "말씀 감사해요. 그 부분은 지금처럼 드시면 충분해요.",
  "조리팀에 전달했어요. 다음 배송부터 바꿔드릴게요.",
  "네 어르신, 편하게 더 말씀해 주세요.",
];

export function NutritionistChatView({ wardId, name }: { wardId: string; name: string }) {
  const threadId = nutritionistThreadId(wardId);
  const messages = threadMessages(useLocalStore(chatStore), threadId);
  const [text, setText] = useState("");

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMessage(threadId, "본인", trimmed);
    setText("");
    const reply = REPLIES[messages.length % REPLIES.length];
    setTimeout(() => addMessage(threadId, "영양사 김보라", reply), 900);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="영양사 상담" subtitle="영양사 김보라 · 평일 09:00-18:00" />

      <div className="flex flex-col gap-2.5 px-5">
        {messages.length === 0 && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {name}님, 식단이나 컨디션에 대해 편하게 물어보세요.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.from === "본인" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                m.from === "본인"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.from !== "본인" && (
                <div className="mb-0.5 text-xs font-semibold text-accent">{m.from}</div>
              )}
              {m.text}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="메시지를 입력하세요"
          />
          <Button size="icon" onClick={send} aria-label="전송">
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
