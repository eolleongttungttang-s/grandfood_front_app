"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Ward } from "@/lib/wards";
import { chatStore, nutritionistThreadId, threadMessages } from "@/lib/chat-store";
import { useLocalStore } from "@/lib/use-store";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";

export function NutritionistHistoryView({ ward }: { ward: Ward }) {
  const threadId = nutritionistThreadId(ward.id);
  const messages = threadMessages(useLocalStore(chatStore), threadId);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 bg-sidebar px-5 py-3 text-sidebar-foreground">
        <GrandFoodMark className="h-6 w-6 shrink-0 rounded-md" />
        <Link
          href={`/guardian/wards/detail?id=${ward.id}`}
          className="flex items-center gap-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {ward.name}님
        </Link>
      </div>

      <div className="flex flex-col gap-1 px-5">
        <h1 className="text-lg font-extrabold text-foreground">영양사 상담 이력</h1>
        <p className="text-sm text-muted-foreground">
          {ward.name}님과 영양사가 나눈 대화예요.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {messages.length === 0 && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            아직 상담 이력이 없어요.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === "본인" ? "justify-end" : "justify-start"}`}>
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
      </div>
    </div>
  );
}
