"use client";

import { Camera, CircleCheck, CircleX } from "lucide-react";

import { SpeakableCard } from "@/components/app/speakable-card";
import { Button } from "@/components/ui/button";

// 예전엔 손그림 SVG 일러스트 하나로 "이렇게 찍어주세요"를 설명했는데, 실제 반찬 사진(올바른
// 예/잘못된 예 각 2장)으로 바꿨다(2026-08-26 피드백) — 그림보다 실물 사진이 70~80대 사용자가
// "내 상황"에 바로 대입해서 이해하기 쉽다. 이미지는 public/tutorial/에 미리 리사이즈해서
// 넣어뒀다(원본은 Grandfood/튜토리얼 예시이미지, 각 1.6~1.8MB짜리 PNG라 800px·JPEG로
// 줄임 — 모바일 데이터로 튜토리얼 여는 어르신 기준 로딩 부담을 줄이기 위함).
function ExampleImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 정적 export 앱이라 next/image 미사용(next.config.ts 참고)
    <img src={src} alt={alt} className="aspect-square w-full rounded-xl border border-border object-cover" />
  );
}

export function PhotoGuideView({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end px-5 pt-5">
        <button
          type="button"
          className="text-base font-semibold text-muted-foreground underline underline-offset-2"
          onClick={onSkip}
        >
          건너뛰기
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        {/* 이 화면 전부에 카드별 TTS(SpeakableCard, 애저 스피치)를 붙인다(2026-08-26
            피드백) — 홈/식단 화면과 같은 규칙으로, 문구를 눈으로 읽기 쉽게 다듬은 그대로가
            아니라 사람이 말하듯 풀어 쓴 문장(text)을 따로 준다. */}
        <SpeakableCard
          id="tutorial-photo-intro"
          text="사진은 이렇게 찍어주세요. 정확한 잔반 분석을 위해 꼭 확인해주세요."
          className="flex flex-col gap-1.5"
        >
          <h2 className="text-2xl leading-snug font-extrabold break-keep text-foreground">
            사진은 이렇게 찍어주세요
          </h2>
          <p className="text-base break-keep text-muted-foreground">
            정확한 잔반 분석을 위해 꼭 확인해주세요
          </p>
        </SpeakableCard>

        {/* 식사 전/후 각 한 장씩, 총 두 장이 필요하다는 게 이 화면에서 가장 중요한 규칙인데
            예전엔 "이렇게 찍어주세요" 카드 안에 전/후 두 사진을 나란히만 놓아서 그 규칙
            자체가 눈에 안 띄었다(2026-08-26 피드백) — 배지로 먼저 못박아 둔다. 한글은 띄어쓰기
            없이도 아무 글자 사이에서나 줄바꿈이 되는 게 기본값이라(break-keep 없으면), 좁은
            배지 안에서 "찍어주세요"가 "찍"/"어주세요"로 잘려 보이는 문제가 있었다(2026-08-26
            피드백) — break-keep으로 어절 단위 줄바꿈을 강제하고, 줄바꿈 위치 자체도
            "식사 전후로"/"한 장씩 찍어주세요!"로 못박는다. */}
        <SpeakableCard
          id="tutorial-photo-badge"
          text="식사 전후로 한 장씩 찍어주세요!"
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3.5"
        >
          <Camera className="h-5 w-5 shrink-0 text-primary-foreground" />
          <span className="text-lg leading-snug font-extrabold break-keep text-primary-foreground">
            식사 전후로
            <br />한 장씩 찍어주세요!
          </span>
        </SpeakableCard>

        {/* 전/후 예시를 한 카드에 나란히 두면 "이게 전 사진인지 후 사진인지" 구분이 잘 안
            된다(2026-08-26 피드백, "개별적으로 잘 인식할 수 있게") — 카드를 분리해서 각각
            "식사 전에는"/"식사 후에는"이라고 못박고 사진도 하나씩 크게 보여준다. 아래 캡션들도
            같은 이유(break-keep)로 어절 중간이 아니라 띄어쓰기 단위로만 줄바꿈되게 한다. */}
        <SpeakableCard
          id="tutorial-photo-before"
          text="식사 전에는 이렇게 찍어주세요. 뚜껑을 벗기고 바로 위에서, 반찬과 그릇이 전부 나오게 찍어주세요."
          className="flex flex-col gap-2 rounded-2xl border-2 border-primary bg-primary/5 p-4"
        >
          <div className="flex items-center gap-1.5">
            <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-lg font-bold break-keep text-foreground">식사 전에는 이렇게 찍어주세요</span>
          </div>
          <ExampleImage src="/tutorial/before-good.jpg" alt="뚜껑을 벗기고 위에서 찍은 식사 전 사진" />
          <p className="text-sm break-keep text-muted-foreground">
            뚜껑을 벗기고 바로 위에서,
            <br />반찬과 그릇이 전부 나오게
          </p>
        </SpeakableCard>

        <SpeakableCard
          id="tutorial-photo-after"
          text="식사 후에는 이렇게 찍어주세요. 식사 전 사진과 똑같은 각도로 찍어주세요."
          className="flex flex-col gap-2 rounded-2xl border-2 border-primary bg-primary/5 p-4"
        >
          <div className="flex items-center gap-1.5">
            <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-lg font-bold break-keep text-foreground">식사 후에는 이렇게 찍어주세요</span>
          </div>
          <ExampleImage src="/tutorial/after-good.jpg" alt="식사 전과 같은 각도로 찍은 식사 후 사진" />
          <p className="text-sm break-keep text-muted-foreground">식사 전 사진과 똑같은 각도로 찍어주세요</p>
        </SpeakableCard>

        <SpeakableCard
          id="tutorial-photo-bad"
          text="이렇게 찍으면 안 돼요. 뚜껑을 안 벗겼어요. 수저가 반찬을 가렸어요."
          className="flex flex-col gap-2 rounded-2xl border-2 border-destructive bg-destructive/5 p-4"
        >
          <div className="flex items-center gap-1.5">
            <CircleX className="h-5 w-5 shrink-0 text-destructive" />
            <span className="text-lg font-bold break-keep text-foreground">이렇게 찍으면 안 돼요</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <ExampleImage src="/tutorial/before-bad.jpg" alt="비닐 뚜껑을 벗기지 않고 찍은 사진" />
              <p className="text-center text-sm break-keep text-muted-foreground">뚜껑을 안 벗겼어요</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <ExampleImage src="/tutorial/after-bad.jpg" alt="수저가 반찬을 가리게 찍은 사진" />
              <p className="text-center text-sm break-keep text-muted-foreground">수저가 반찬을 가렸어요</p>
            </div>
          </div>
        </SpeakableCard>
      </div>

      <div className="flex px-5 pb-6">
        <Button size="lg" className="h-14 w-full text-lg" onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
