"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

import { SpeakableCard } from "@/components/app/speakable-card";
import { Button } from "@/components/ui/button";
import { USER_TOUR_STEPS } from "@/lib/user-tour";

type Highlight = { top: number; left: number; width: number; height: number; containerHeight: number };

// 실제 하단 탭바 버튼 위치를 읽어서 그 자리만 밝게 남기고 나머지를 어둡게 덮는 스포트라이트
// 오버레이. containerRef 기준 상대 좌표로 그려야 한다 — 이 오버레이는 UserShell의
// position:relative 박스(=이 기기의 실제 화면 영역) 안에 absolute로 얹히는데,
// getBoundingClientRect()는 뷰포트 기준 좌표를 주기 때문에 컨테이너 좌표를 빼줘야 한다.
export function TabTourOverlay({
  containerRef,
  step,
  onNext,
  onBack,
  onSkip,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  step: number;
  onNext: () => void;
  onBack?: () => void;
  onSkip: () => void;
}) {
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const current = USER_TOUR_STEPS[step];
  const isLast = step === USER_TOUR_STEPS.length - 1;

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const target = document.querySelector(`[data-tour-target="${current.href}"]`);
      if (!container || !target) {
        setHighlight(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setHighlight({
        top: targetRect.top - containerRect.top,
        left: targetRect.left - containerRect.left,
        width: targetRect.width,
        height: targetRect.height,
        containerHeight: containerRect.height,
      });
    }
    // 페이지 전환 직후(다른 탭으로 실제 라우팅) 탭바가 다시 그려지는 한 프레임 뒤에야
    // 자리가 잡히는 경우가 있어, 다음 프레임에 한 번 더 측정한다.
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, current.href]);

  if (!highlight) return null;

  const pad = 8;
  const highlightBoxStyle: React.CSSProperties = {
    top: highlight.top - pad,
    left: highlight.left - pad,
    width: highlight.width + pad * 2,
    height: highlight.height + pad * 2,
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.7)",
  };
  const calloutStyle: React.CSSProperties = {
    bottom: highlight.containerHeight - (highlight.top - pad) + 12,
  };

  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-label="사용법 안내">
      <div className="absolute rounded-2xl transition-all duration-300" style={highlightBoxStyle} />
      <div
        className="absolute right-4 left-4 flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-2xl transition-all duration-300"
        style={calloutStyle}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {step + 1} / {USER_TOUR_STEPS.length}
          </span>
          <button
            type="button"
            className="text-sm font-semibold text-muted-foreground underline underline-offset-2"
            onClick={onSkip}
          >
            건너뛰기
          </button>
        </div>
        {/* 다른 화면 카드들과 같은 규칙(SpeakableCard, 애저 스피치)으로 이 안내도 눌러서
            들을 수 있게 한다(2026-08-26 피드백) — id를 step으로 구분해서 탭을 넘길 때마다
            새 문구로 바뀐다. */}
        <SpeakableCard
          id={`tour-step-${step}`}
          text={`${current.title}. ${current.hint}`}
          className="flex flex-col gap-1"
        >
          <h2 className="text-xl leading-snug font-extrabold text-foreground">{current.title}</h2>
          <p className="text-base text-muted-foreground">{current.hint}</p>
        </SpeakableCard>
        <div className="flex gap-2">
          {onBack && (
            <Button variant="outline" size="lg" className="h-12 flex-1 text-base" onClick={onBack}>
              이전
            </Button>
          )}
          <Button size="lg" className="h-12 flex-[2] text-base" onClick={onNext}>
            {isLast ? "시작하기" : "다음"}
          </Button>
        </div>
      </div>
    </div>
  );
}
