"use client";

import { ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { speakCard, stopSpeaking, useSpeakingCardId } from "@/lib/accessibility";
import { cn } from "@/lib/utils";

// 카드 전체가 탭 영역이다 — 우상단 스피커 아이콘만 작게 탭 영역으로 두지 않는다. 70·80대가
// 작은 아이콘을 정확히 누르기 어렵고, 그걸 새로 가르치는 것도 부담이라 판단했다(카드는 이미
// "누를 수 있는 것"으로 익숙함). 아이콘은 "눌러서 들을 수 있다"는 시각적 표시 역할만 한다.
// 카드 배경마다 아이콘 배색을 다르게 써야 한다 — foreground/accent 토큰은 밝은 bg-card
// 카드를 기준으로 잡혀 있어서, 항상 어두운 bg-sidebar 카드(오늘의 추천 반찬 조합)에 그대로
// 쓰면 배경색과 아이콘 색이 거의 같아져 안 보인다(실제로 헤드리스 브라우저 스크린샷으로
// 확인한 버그). 카드가 어떤 배경을 쓰는지는 호출하는 쪽만 아니까 tone prop으로 받는다.
const ICON_TONE = {
  default: {
    idle: "bg-foreground/10 text-foreground/50",
    speaking: "bg-accent text-accent-foreground",
  },
  sidebar: {
    idle: "bg-sidebar-foreground/15 text-sidebar-foreground",
    speaking: "bg-sidebar-primary text-sidebar-primary-foreground",
  },
} as const;

export function SpeakableCard({
  id,
  text,
  className,
  tone = "default",
  variant = "overlay",
  children,
}: {
  id: string;
  text: string;
  className?: string;
  tone?: keyof typeof ICON_TONE;
  /** "overlay"(기본): 카드 우상단에 아이콘을 얹음. "leading": 문장 맨 앞에 아이콘을 인라인으로
   *  넣음 — 카드 문구가 폭에 거의 딱 맞아 overlay 아이콘과 겹칠 때, 그리고 문구 맨 앞에
   *  원래 이모지 등을 아이콘으로 대체하고 싶을 때 쓴다(예: 홈 화면 영양 팁 카드). "none": 이
   *  카드 안에는 아이콘을 아예 안 그림 — 카드 자체(탭 영역·TTS 로직)는 그대로 쓰되, 스피커
   *  아이콘을 카드 바깥 다른 자리에 따로 둬야 할 때(예: 튜토리얼 오버레이의 "1/4" 옆) 쓴다.
   *  이 경우 시각적 표시가 카드 밖에 있으니, 카드가 눌러서 들을 수 있다는 걸 다른 방법으로
   *  알려줘야 한다. */
  variant?: "overlay" | "leading" | "none";
  children: ReactNode;
}) {
  const isSpeaking = useSpeakingCardId() === id;

  function handleTap() {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakCard(id, text);
    }
  }

  const icon = isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => {
        // 안쪽 실제 버튼(다 먹었어요/이거 싫어요 등)에서 Enter·Space를 누르면 keydown이
        // 이 div까지 버블링돼서 handleTap()이 중복 실행되는 문제가 있었다(카드 TTS가
        // 방금 누른 버튼과 동시에 읽힘). target === currentTarget일 때만, 즉 카드 자신이
        // 포커스를 받은 상태에서 눌렸을 때만 반응하도록 해서 막는다.
        //
        // 버튼마다 onKeyDown에 stopPropagation()을 넣는 방식으로 "완전히" 막지는 않는다 —
        // 그러면 (1) 실수로 preventDefault()까지 같이 넣을 경우 버튼의 네이티브 Enter→click
        // 합성 자체가 취소돼 키보드로 버튼이 아예 안 눌리는 회귀가 생기고, (2) Enter/Space로
        // 범위를 좁히지 않으면 Tab/Escape 등 다른 키의 버블링까지 막혀 나중에 상위에 추가될
        // 키보드 기능(예: Escape로 닫기)이 이 카드 안에서만 조용히 안 먹는 버그가 생기고,
        // (3) 버튼이 늘어날 때마다 매번 이 패치를 빼먹지 않아야 하는 유지보수 부담이 생긴다.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleTap();
        }
      }}
      className={cn(className, "relative cursor-pointer")}
    >
      {variant === "overlay" && (
        // 여백을 따로 예약하지 않고 카드 위에 그냥 얹는다 — 카드 높이/줄바꿈이 아이콘 때문에
        // 절대 바뀌면 안 된다는 게 우선순위라, 극히 드물게 카드 폭에 문장이 딱 맞게 들어간
        // 경우엔 아이콘이 마지막 글자 위에 살짝 겹칠 수 있다. 그게 카드 전체가 밀리는 것보다는
        // 낫다고 판단했다.
        <span
          aria-hidden
          className={cn(
            "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full opacity-80 shadow-sm backdrop-blur-sm transition-colors",
            isSpeaking ? ICON_TONE[tone].speaking : ICON_TONE[tone].idle
          )}
        >
          {icon}
        </span>
      )}
      {variant === "leading" && (
        <span
          aria-hidden
          className={cn(
            "mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full align-[-4px] transition-colors",
            isSpeaking ? ICON_TONE[tone].speaking : ICON_TONE[tone].idle
          )}
        >
          {isSpeaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </span>
      )}
      {children}
    </div>
  );
}
