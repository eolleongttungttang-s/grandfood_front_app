"use client";

import Link from "next/link";
import { Stethoscope } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { dislikesStore, toggleDislike, wardDislikes } from "@/lib/dislikes-store";
import { useLocalStore } from "@/lib/use-store";

export function DietView({
  ward,
  detail,
}: {
  ward: Ward;
  detail: WardDetail;
}) {
  const dislikes = wardDislikes(useLocalStore(dislikesStore), ward.id);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="내 식단" subtitle="오늘의 배정 식단과 근거" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm">
          <span className="text-xs font-bold tracking-wide text-sidebar-primary">
            배정 식단
          </span>
          <span className="text-xl font-extrabold">{detail.diet.name}</span>
          <div className="flex gap-4 pt-1 text-xs">
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">나트륨</span>
              <span className="font-semibold">{detail.diet.sodiumMg}mg</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">단백질</span>
              <span className="font-semibold">{detail.diet.proteinG}g</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">열량</span>
              <span className="font-semibold">{detail.diet.kcal}kcal</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">
            {detail.todayMenu.photoEmoji} 오늘 메뉴 구성
          </span>
          <div className="flex flex-col gap-1.5">
            {detail.todayMenu.items.map((item) => {
              const disliked = dislikes.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2"
                >
                  <span
                    className={`text-sm ${disliked ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDislike(ward.id, item.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                      disliked
                        ? "bg-destructive/10 text-destructive"
                        : "bg-transparent text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {disliked ? "기피 표시됨" : "이거 싫어요"}
                  </button>
                </div>
              );
            })}
          </div>
          {dislikes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              기피 표시한 반찬은 보호자와 담당 영양사에게 함께 보여요.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">왜 이 식단인가요</span>
          {detail.diet.reasons.map((reason, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-foreground"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {i + 1}
              </span>
              {reason}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">질환 · 알레르기 · 복약</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">진단 질환</span>
            <div className="flex flex-wrap gap-1.5">
              {ward.conditions.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">알레르기 · 금기</span>
            <div className="flex flex-wrap gap-1.5">
              {detail.allergies[0] === "없음" ? (
                <span className="text-sm text-muted-foreground">없음</span>
              ) : (
                detail.allergies.map((a) => (
                  <Badge key={a} className="bg-risk-high text-risk-high-foreground">
                    {a}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">복약</span>
            {detail.medications.map((m) => (
              <div key={m.name} className="flex justify-between text-sm">
                <span className="text-foreground">{m.name}</span>
                <span className="text-muted-foreground">{m.schedule}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              저작 · 연하 상태
            </span>
            <p className="text-sm text-foreground">{detail.chewingNote}</p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href="/user/nutritionist" />}
        >
          <Stethoscope />
          영양사와 채팅 상담하기
        </Button>
      </div>
    </div>
  );
}
