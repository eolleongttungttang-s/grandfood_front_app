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
    <div className="print-frame mx-auto flex min-h-screen w-full max-w-md flex-col bg-background text-foreground sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10 overflow-hidden">
      {children}
    </div>
  );
}
