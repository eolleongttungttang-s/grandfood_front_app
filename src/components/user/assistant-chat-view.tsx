"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Ward } from "@/lib/wards";
import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpeakableCard } from "@/components/app/speakable-card";
import { listenOnce, type ListenController } from "@/lib/accessibility";
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
  // 음성 인식 결과가 막 입력창에 채워졌다는 표시 — 전송 버튼을 강조해서 "이제 이걸
  // 누르면 보내진다"는 다음 동작을 명확히 알려준다(2026-08-18 피드백: 마이크 버튼이
  // 뭘 하는 건지 안 와닿고, 인식 후 자동 전송도 안 되니 다음에 뭘 해야 할지 모호함).
  // 자동 전송 대신 강조로 택한 이유는 — 어르신은 말하다 잠깐씩 멈추는 경우가 잦은데,
  // 브라우저 음성인식의 침묵 감지가 그걸 "말 끝남"으로 오판해 문장이 잘린 채로
  // 자동 전송될 위험이 있기 때문(사용자 피드백). 사람이 마지막에 한 번 확인하고
  // 누르는 단계는 남기되, 그 단계를 최대한 눈에 띄게 만드는 절충.
  const [justRecognized, setJustRecognized] = useState(false);
  const listenControllerRef = useRef<ListenController | null>(null);

  // 강조를 계속 켜두면 나중엔 그냥 배경처럼 안 보이게 된다 — 몇 초 뒤 스스로 꺼지게
  // 해서, 그 사이에도 안 누르면 평소(안 강조된) 버튼으로 돌아간다.
  useEffect(() => {
    if (!justRecognized) return;
    const timer = setTimeout(() => setJustRecognized(false), 5000);
    return () => clearTimeout(timer);
  }, [justRecognized]);

  // 화면을 떠날 때(하단 탭으로 다른 화면 이동 등) 마이크가 계속 켜진 채로 남아있으면 안
  // 된다 — 인식이 계속 돌면서 이미 언마운트된 화면의 오래된 클로저(setText/setListening)를
  // 나중에 건드리게 된다(코드 리뷰 지적). listenOnce()가 돌려준 컨트롤러의 stop()은
  // 인식이 아직 없어도(never started) no-op이라 항상 안전하게 부를 수 있다.
  useEffect(() => {
    return () => {
      listenControllerRef.current?.stop();
    };
  }, []);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setJustRecognized(false);
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
  // 같은 Web Speech API 패턴이지만, lib/accessibility.ts의 listenOnce()로 옮겨 시작
  // 실패/언마운트 시 정리까지 한 곳에서 안전하게 처리한다(코드 리뷰 지적 — 이 화면에 직접
  // 풀어 쓰면 그 정리를 놓치기 쉽다). 거긴 단어 하나짜리 명령이라 인식 결과로 바로 동작
  // (checkMeal)을 실행했지만, 여긴 자유 문장을 묻는 채팅이라 잘못 알아들은 걸 그대로 AI에
  // 보내면 안 된다 — 입력창에 채우기만 하고 전송은 사용자가 확인 후 직접 누르게 한다.
  function listenForMessage() {
    // listenOnce가 이 아래에서 동기적으로 실패할 수 있다(예: start()가 즉시 던져서
    // onError→onEnd가 listenOnce() 호출 도중 바로 불림) — 그래서 setListening(true)를
    // listenOnce() 호출보다 먼저 해둬야, 그 즉시-실패 경로의 onEnd(setListening(false))가
    // 이걸 덮어써서 최종 상태가 정확히 "false"로 남는다. 순서를 반대로 하면(먼저 호출하고
    // 나중에 true로 덮어쓰면) 실패했는데도 "듣는 중" 상태에 갇히는 버그가 된다.
    setListening(true);
    const controller = listenOnce({
      onResult: (transcript) => {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        setJustRecognized(true);
      },
      onError: () => {
        toast.error("음성을 잘 듣지 못했어요. 다시 시도해 주세요.");
      },
      onEnd: () => setListening(false),
    });
    if (!controller.supported) {
      setListening(false);
      toast.error("이 브라우저에서는 음성 입력을 지원하지 않아요. 직접 입력해 주세요.");
      return;
    }
    listenControllerRef.current = controller;
  }

  // accessibility.ts의 listenOnce가 이제 continuous 모드라 침묵으로는 자동으로 안
  // 끝난다(2026-08-18 피드백 — 어르신이 잠깐 멈추는 걸 "말 끝남"으로 오판해 문장이
  // 잘리는 문제) — 그래서 버튼이 "시작"과 "그만 말하기(종료)"를 겸한다. 듣는 중엔
  // 눌러도 disabled로 막지 않고, stop()을 직접 불러 그 자리에서 마무리한다.
  function handleMicButtonClick() {
    if (listening) {
      listenControllerRef.current?.stop();
      return;
    }
    listenForMessage();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="AI 도우미" subtitle="건강 질문도, 편한 이야기도 물어보세요" />

      <div className="flex flex-col gap-3 px-5">
        {/* 대화가 비어있을 때만 보이는 첫인사 — 채팅창이 텅 비어 있으면 뭘 물어봐야 할지
            막막해 보인다는 인상을 준다(디자인 피드백, 2026-08-20). 여기 아이콘(Sparkles)은
            "AI 반찬 추천"류 라벨에서 이미 쓰는 것과 같은 장식용 짝꿍이라, 글자 라벨을
            아이콘으로 대체하는 게 아니다 — banchan-recommendation-calendar.tsx 피드백
            ("아이콘보다 글자 라벨이 명확하다")은 아이콘 *하나만* 두고 의미를 읽어야 하는
            경우 얘기라 여기와는 다르다. */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-sidebar px-5 py-6 text-center text-sidebar-foreground">
            <Sparkles className="h-6 w-6 text-sidebar-primary" />
            <p className="text-base leading-relaxed">
              {name}님, 식단이나 건강, 오늘 하루에 대해
              <br />
              편하게 물어보세요.
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.from === "본인" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-base whitespace-pre-line text-primary-foreground shadow-sm">
                {m.text}
              </div>
            </div>
          ) : (
            // AI 답변은 눌러서 읽어주기가 되어야 어르신이 화면 대신 귀로 들을 수 있다 —
            // 홈/식단 화면의 다른 카드들과 같은 SpeakableCard 규칙(작은 아이콘 대신 카드
            // 전체를 탭 영역으로)을 그대로 따른다. 라벨("AI 도우미")과 답변 사이에 아이콘이
            // 끼어들지 않도록, 아이콘 뒤에 라벨을 인라인으로 붙이고 답변은 그 아래 새 줄에
            // 별도 블록으로 둔다(variant="leading"은 children 맨 앞에 아이콘 하나만 붙임).
            // 배경을 bg-muted 대신 이 앱의 다른 카드들과 같은 bg-card+테두리+그림자로
            // 바꿔서, 채팅창만 동떨어진 기본 UI처럼 보이지 않고 나머지 화면과 톤이
            // 맞도록 했다(디자인 피드백, 2026-08-20).
            <div key={m.id} className="flex justify-start">
              <SpeakableCard
                id={m.id}
                text={m.text}
                variant="leading"
                className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-base text-foreground shadow-sm"
              >
                <span className="text-sm font-bold text-accent">{m.from}</span>
                <div className="mt-1 whitespace-pre-line">{m.text}</div>
              </SpeakableCard>
            </div>
          )
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-base text-muted-foreground shadow-sm">
              답변을 준비하고 있어요
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* 아이콘만 있는 작은 버튼으로는 "말해도 된다"는 게 한눈에 안 들어온다는
            피드백(2026-08-18) — 입력창과 나란한 부가 버튼이 아니라, 텍스트 라벨을 단
            전체너비 버튼으로 따로 한 줄을 차지하게 해서 "여기가 말하는 곳"이라는 신호를
            분명하게 준다. 크기·라벨·터치 영역은 그대로 두고(예전 피드백으로 다듬어진
            부분), 그냥 outline 사각 버튼처럼 밋밋해 보인다는 지적(2026-08-20)에 마이크를
            동그란 배지 안에 넣고 옅은 accent 톤 배경을 줘서 "음성 입력"이라는 정체성이
            바로 보이게 했다. */}
        <Button
          type="button"
          size="lg"
          variant={listening ? "default" : "outline"}
          className={`h-16 w-full gap-3 rounded-2xl text-lg font-bold ${
            listening ? "" : "border-accent/25 bg-accent/10 text-accent hover:bg-accent/15"
          }`}
          onClick={handleMicButtonClick}
          aria-label={listening ? "말하기 끝내기" : "말로 물어보기"}
          disabled={sending}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              listening ? "bg-primary-foreground/20" : "bg-accent text-accent-foreground"
            }`}
          >
            <Mic className={listening ? "size-5 animate-pulse" : "size-5"} />
          </span>
          {listening ? "말하기 끝났어요" : "말로 물어보기"}
        </Button>

        <div className="flex items-end gap-2">
          {/* 음성 인식 결과가 한 줄 입력창에 다 안 담기고 잘려 보이던 문제(2026-08-18
              피드백) — Textarea(field-sizing-content, ui/textarea.tsx)로 바꿔서 내용
              길이에 맞춰 세로로 자동으로 늘어나게 한다. Enter는 여전히 줄바꿈이 아니라
              전송으로 취급한다 — 이 화면의 목적이 "긴 글을 여러 문단으로 쓰기"가 아니라
              "음성으로 길게 물어본 걸 보내기 전에 다 보이게 하기"라서, Shift+Enter 같은
              추가 규칙을 배우게 하는 것보다 기존과 같은 단순한 동작을 유지하는 쪽을 택했다.
              resize-none — 기본 textarea는 브라우저가 우하단에 손잡이를 그려서 마우스로
              끌어 크기를 바꿀 수 있는데, field-sizing-content가 이미 내용에 맞춰 자동으로
              늘어나게 하고 있어서 그 손잡이는 아무 역할 없이 어색하게 튀어나온 UI로만
              보인다(디자인 피드백, 2026-08-20) — 자동 늘어남은 그대로 두고 손잡이만
              없앤다. 테두리도 두 배 두껍게, 모서리도 더 둥글게(rounded-xl) 해서 이 화면의
              다른 카드/버튼들과 톤을 맞췄다. */}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder={listening ? "듣고 있어요..." : "메시지를 입력하세요"}
            disabled={sending}
            rows={1}
            className="resize-none rounded-xl border-2 px-3.5 py-3 text-base"
          />
          {/* listening 중에도 막지 않는다 — 인식이 응답 없이 오래 걸리거나(느린 네트워크,
              무음) 안 끝나는 경우에도 이미 입력창에 타이핑해 둔 내용은 언제든 보낼 수 있어야
              한다. 나중에 인식 결과가 뒤늦게 와도 그땐 입력창이 비어있어 새로 채워질 뿐,
              이미 보낸 메시지에는 영향 없다.
              justRecognized일 때 링을 둘러 펄스시키는 이유는 위 justRecognized 선언부
              주석 참고 — 자동 전송 대신 "이제 이 버튼을 누르면 된다"를 강하게 알려준다.
              size="icon"(32px)은 이 앱이 다른 곳에서 쓰는 최소 터치 영역 기준(44px,
              button-select-group.tsx 주석 참고)보다 작았다 — 마이크 버튼과 높이를
              맞춘 정사각형(56px)으로 키우고 모서리도 rounded-2xl로 맞췄다(디자인
              피드백, 2026-08-20). */}
          <Button
            onClick={send}
            aria-label="전송"
            disabled={sending}
            className={`h-14 w-14 shrink-0 rounded-2xl [&_svg]:size-5 ${
              justRecognized ? "animate-pulse ring-4 ring-primary/50 ring-offset-2" : ""
            }`}
          >
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
