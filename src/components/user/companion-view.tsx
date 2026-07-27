"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = { from: "me" | "companion"; text: string };

const COMPANION_REPLIES = [
  "오늘도 잘 챙겨 드시고 계시죠? 저는 늘 여기 있어요.",
  "그러셨군요, 저한테 얘기해주셔서 고마워요.",
  "오늘 날씨가 참 좋네요. 창문 한번 열어보시는 건 어때요?",
  "재미있는 이야기네요! 더 들려주세요.",
  "무리하지 마시고 편하게 쉬셔도 돼요.",
];

const INITIAL_POSTS = [
  { name: "이복순 (78)", text: "오늘 점심 반찬 진짜 맛있었어요 :)" },
  { name: "김판석 (81)", text: "손주가 놀러와서 기분이 좋네요." },
  { name: "서말자 (79)", text: "산책하기 딱 좋은 날씨네요, 다들 나가보세요~" },
];

export function CompanionView({ name }: { name: string }) {
  const [tab, setTab] = useState<"companion" | "community">("companion");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [postText, setPostText] = useState("");

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { from: "me", text: trimmed }]);
    setText("");
    const reply = COMPANION_REPLIES[messages.length % COMPANION_REPLIES.length];
    setTimeout(() => {
      setMessages((prev) => [...prev, { from: "companion", text: reply }]);
    }, 800);
  }

  function post() {
    const trimmed = postText.trim();
    if (!trimmed) return;
    setPosts((prev) => [{ name: `${name}님`, text: trimmed }, ...prev]);
    setPostText("");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="말벗" subtitle="심심할 때 편하게 이야기해요" />

      <div className="mx-5 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("companion")}
          className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
            tab === "companion" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          말벗과 대화
        </button>
        <button
          type="button"
          onClick={() => setTab("community")}
          className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
            tab === "community" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          소통방
        </button>
      </div>

      {tab === "companion" ? (
        <div className="flex flex-col gap-2.5 px-5">
          {messages.length === 0 && (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              {name}님, 오늘 하루 어떠셨어요?
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.from === "me"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
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
              placeholder="이야기를 들려주세요"
            />
            <Button size="icon" onClick={send} aria-label="전송">
              <Send />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5">
          <div className="flex items-center gap-2">
            <Input
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") post();
              }}
              placeholder="오늘 하루를 나눠보세요"
            />
            <Button onClick={post}>올리기</Button>
          </div>
          {posts.map((p, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <span className="text-xs font-semibold text-accent">{p.name}</span>
              <p className="text-sm text-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
