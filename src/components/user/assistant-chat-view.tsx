"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Ward } from "@/lib/wards";
import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addMessage,
  assistantThreadId,
  chatStore,
  threadMessages,
} from "@/lib/chat-store";
import { askHealthQuestion } from "@/lib/rag-chat";
import { useLocalStore } from "@/lib/use-store";

// "영양사와 상담하기" + "말벗과 이야기하기"를 하나로 합친 AI 도우미. 백엔드 RAG가 근거 문서
// 기반으로만 답하도록 되어 있어(domains/rag/service.py), 건강과 무관한 잡담엔 "모른다"고
// 답할 수 있다 — 그래도 하나의 도우미로 합치는 쪽을 택했다(2026-08-06 논의).
export function AssistantChatView({ ward, name }: { ward: Ward; name: string }) {
  const threadId = assistantThreadId(ward.id);
  const messages = threadMessages(useLocalStore(chatStore), threadId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    addMessage(threadId, "본인", trimmed);
    setText("");
    setSending(true);
    try {
      const result = await askHealthQuestion({
        wardId: ward.id,
        wardName: ward.name,
        wardAge: ward.age,
        wardAddress: ward.address,
        query: trimmed,
      });
      addMessage(threadId, "AI 도우미", result.answer);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."
          : err instanceof Error
            ? err.message
            : "AI 도우미가 답변하지 못했어요."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="AI 도우미" subtitle="건강 질문도, 편한 이야기도 물어보세요" />

      <div className="flex flex-col gap-2.5 px-5">
        {messages.length === 0 && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {name}님, 식단이나 건강, 오늘 하루에 대해 편하게 물어보세요.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.from === "본인" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line ${
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
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
              답변을 준비하고 있어요...
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="메시지를 입력하세요"
            disabled={sending}
          />
          <Button size="icon" onClick={send} aria-label="전송" disabled={sending}>
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
