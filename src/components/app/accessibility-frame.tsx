"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { accessibilityStore, stopSpeaking } from "@/lib/accessibility";
import { useLocalStore } from "@/lib/use-store";

export function AccessibilityFrame({ children }: { children: React.ReactNode }) {
  const settings = useLocalStore(accessibilityStore);
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.dataset.textSize = settings.largeText ? "large" : "normal";
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
  }, [settings.largeText, settings.highContrast]);

  // 다른 화면으로 이동하면(pathname 변경) 재생 중이던 TTS를 멈춘다.
  // 최초 마운트 때도 한 번 실행되지만, 그 시점엔 재생 중인 게 없어서 영향 없음.
  useEffect(() => {
    stopSpeaking();
  }, [pathname]);

  return (
    <div className="print-frame mx-auto flex min-h-screen w-full max-w-md flex-col bg-background text-foreground sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10 overflow-hidden">
      {children}
    </div>
  );
}
