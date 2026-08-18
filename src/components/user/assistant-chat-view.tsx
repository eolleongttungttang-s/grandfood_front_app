"use client";

import { useState } from "react";
import { Mic, Send } from "lucide-react";
import { toast } from "sonner";

import { Ward } from "@/lib/wards";
import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpeakableCard } from "@/components/app/speakable-card";
import { getSpeechRecognition } from "@/lib/accessibility";
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
  const [listening, setListening] = useState(false);
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

  // 예전 홈 화면 "완식/남김" 음성 명령(home-view.tsx, 잔반 사진 분석으로 대체되며 제거됨)과
  // 같은 Web Speech API 패턴을 그대로 가져온다. 다만 거긴 단어 하나짜리 명령이라 인식 결과로
  // 바로 동작(checkMeal)을 실행했지만, 여긴 자유 문장을 묻는 채팅이라 잘못 알아들은 걸 그대로
  // AI에 보내면 안 된다 — 입력창에 채우기만 하고 전송은 사용자가 확인 후 직접 누르게 한다.
  function listenForMessage() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast.error("이 브라우저에서는 음성 입력을 지원하지 않아요. 직접 입력해 주세요.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    recognition.onerror = () => {
      toast.error("음성을 잘 듣지 못했어요. 다시 시도해 주세요.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
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
        {messages.map((m) =>
          m.from === "본인" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-primary px-3.5 py-2 text-sm whitespace-pre-line text-primary-foreground">
                {m.text}
              </div>
            </div>
          ) : (
            // AI 답변은 눌러서 읽어주기가 되어야 어르신이 화면 대신 귀로 들을 수 있다 —
            // 홈/식단 화면의 다른 카드들과 같은 SpeakableCard 규칙(작은 아이콘 대신 카드
            // 전체를 탭 영역으로)을 그대로 따른다. 라벨("AI 도우미")과 답변 사이에 아이콘이
            // 끼어들지 않도록, 아이콘 뒤에 라벨을 인라인으로 붙이고 답변은 그 아래 새 줄에
            // 별도 블록으로 둔다(variant="leading"은 children 맨 앞에 아이콘 하나만 붙임).
            <div key={m.id} className="flex justify-start">
              <SpeakableCard
                id={m.id}
                text={m.text}
                variant="leading"
                className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-foreground"
              >
                <span className="text-xs font-semibold text-accent">{m.from}</span>
                <div className="mt-0.5 whitespace-pre-line">{m.text}</div>
              </SpeakableCard>
            </div>
          )
        )}
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
            placeholder={listening ? "듣고 있어요..." : "메시지를 입력하세요"}
            disabled={sending}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={listenForMessage}
            aria-label={listening ? "음성 듣는 중" : "음성으로 입력"}
            disabled={sending || listening}
          >
            <Mic className={listening ? "animate-pulse text-destructive" : ""} />
          </Button>
          {/* listening 중에도 막지 않는다 — 인식이 응답 없이 오래 걸리거나(느린 네트워크,
              무음) 안 끝나는 경우에도 이미 입력창에 타이핑해 둔 내용은 언제든 보낼 수 있어야
              한다. 나중에 인식 결과가 뒤늦게 와도 그땐 입력창이 비어있어 새로 채워질 뿐,
              이미 보낸 메시지에는 영향 없다. */}
          <Button size="icon" onClick={send} aria-label="전송" disabled={sending}>
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
