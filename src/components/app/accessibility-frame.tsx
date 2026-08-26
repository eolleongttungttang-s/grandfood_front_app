"use client";

import { useEffect } from "react";

import { accessibilityStore } from "@/lib/accessibility";
import { useLocalStore } from "@/lib/use-store";

export function AccessibilityFrame({ children }: { children: React.ReactNode }) {
  const settings = useLocalStore(accessibilityStore);

  useEffect(() => {
    document.documentElement.dataset.textSize = settings.largeText ? "large" : "normal";
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
  }, [settings.largeText, settings.highContrast]);

  return (
    <div className="print-frame mx-auto flex h-dvh w-full max-w-md flex-col bg-background text-foreground sm:my-6 sm:h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10 overflow-hidden">
      {/* 이 프레임은 이제 고정 높이(h-dvh)라 내부 어딘가가 직접 스크롤을 책임져야 한다.
          user/guardian 레이아웃처럼 자체 main(overflow-y-auto)을 가진 화면엔 이 div가
          사실상 아무 효과가 없다(그 main이 이미 꽉 채워서 여기까지 넘칠 내용이 없음) —
          하지만 signup/login/invite 같은 홑화면은 자기 main에 overflow-y-auto가 없어서,
          내용이 뷰포트보다 길면(가입 2단계 동의 화면 등) 이 div가 없으면 화면 아래쪽
          (제출 버튼 포함)이 통째로 잘려 나가고 스크롤할 방법도 없어진다 — 그 화면들을
          일일이 고치는 대신 여기 한 곳에서 기본 스크롤 가능 영역을 보장한다. */}
      <div className="print-frame-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
