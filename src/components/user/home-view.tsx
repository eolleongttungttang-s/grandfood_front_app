"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Mic,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";
import { getRepresentativeDish } from "@/lib/dishes";
import { NotificationItem, fetchElderNotifications, notificationBadgeClass } from "@/lib/notifications";
import { SUITABILITY_CLASS, SUITABILITY_LABEL } from "@/lib/banchan-recommendation";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { DislikeToggleButton } from "@/components/app/dislike-toggle-button";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { getNutritionTip } from "@/lib/nutrition-tip";
import { dislikesStore, toggleDislike, wardDislikes } from "@/lib/dislikes-store";
import {
  getCurrentMealSlot,
  getTodayQuickMealCheck,
  quickMealCheckStore,
  setQuickMealCheck,
  submitQuickMealCheck,
} from "@/lib/meal-log-store";
import { useLocalStore } from "@/lib/use-store";
import { getSpeechRecognition, speak } from "@/lib/accessibility";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";

export function HomeView({
  name,
  ward,
  detail,
}: {
  name: string;
  ward: Ward;
  detail: WardDetail;
}) {
  const dislikes = wardDislikes(useLocalStore(dislikesStore), ward.id);
  const mealCheck = getTodayQuickMealCheck(useLocalStore(quickMealCheckStore), ward.id);
  const [listening, setListening] = useState(false);
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  // diet-view.tsx와 같은 이유로 신규 회원(AI 반찬 추천을 한 번도 받은 적 없음)인지 본다 —
  // 여기 있는 카드들도 대부분 오늘의 추천 반찬 조합(목업)에서 파생된 값이라, 아직 실제 추천을
  // 한 번도 못 받아본 사람에게 먼저 보여줄 이유가 없다. 조건부 return은 아래 다른 Hook을 전부
  // 호출한 뒤(맨 아래 return 문 자리)에 둔다.
  const banchanRecommendation = useMonthlyBanchanRecommendation({
    wardId: ward.id,
    wardName: ward.name,
    wardAge: ward.age,
    wardAddress: ward.address,
  });

  // null이면 아직 응답 안 옴(로딩 중), 배열이면 로딩 완료(비어있어도) — notifications-view.tsx와
  // 같은 패턴. 이렇게 구분해야 로딩/에러 중에 "안내 사항 없음"으로 잘못 안내하지 않는다.
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchElderNotifications({ mockWardId: ward.id })
      .then((result) => {
        if (!cancelled) setNotifications(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setNotificationsError(err instanceof Error ? err.message : "안내 사항을 불러오지 못했어요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ward.id]);

  // 오늘 실제 AI 추천이 있으면 그걸, 없으면 목업으로 자연스럽게 폴백한다 — diet-view.tsx와
  // 같은 이유(2026-08-13 피드백, "오늘의 추천 반찬 조합" 카드와 AI 반찬 추천 달력이 서로
  // 다른 답을 보여주던 문제).
  const todayMenu = resolveTodayMenu(detail.recommendedCombo, banchanRecommendation.monthly);
  const representativeDish = getRepresentativeDish(detail.recommendedCombo);
  // isGenerating일 때도 목업 이모지를 그대로 두면 "생성 중" 문구 옆에 무관한 목업 반찬
  // 이모지가 남는다 — diet-view.tsx와 동일하게 그때도 기본 이모지를 쓴다.
  const menuEmoji =
    todayMenu.isReal || todayMenu.isGenerating ? "🍽️" : (representativeDish?.imageEmoji ?? "🍽️");
  // isGenerating이면 items가 비어 있어 그대로 문장을 지으면 "...준비했어요. 입니다." 같은
  // 빈 목록 문장이 되므로, 화면 문구와 같은 생성 중 안내로 맞춘다.
  const recommendedComboSpeech = todayMenu.isGenerating
    ? TODAY_MENU_GENERATING_MESSAGE
    : `오늘의 추천 반찬 조합이에요. ${partnerStore?.name ?? "담당 반찬가게"}에서 준비했어요. ${todayMenu.items
        .map((item) => (dislikes.includes(item.id) ? `${item.name}, 기피 표시됨` : item.name))
        .join(", ")}입니다.`;
  const deliverySpeech = `오늘 점심 배송이 ${detail.deliveryEta}에 예정되어 있어요.`;
  const mealCheckSpeech = mealCheck
    ? `식사하셨으면 다 먹었어요 또는 남겼어요를 눌러 알려주세요. 오늘은 ${mealCheck}으로 체크하셨어요.`
    : "식사하셨으면 다 먹었어요 또는 남겼어요를 눌러 알려주세요. 말로 알려주셔도 돼요.";
  // 영양 팁 문장이 카드 폭에 거의 딱 맞게 들어가 있어서, SpeakableCard의 기본(우상단 오버레이)
  // 아이콘이 문장 끝과 겹친다. 이 카드는 원래도 맨 앞에 이모지(💬)가 있으니, 그 자리를 스피커
  // 아이콘으로 "교체"하는 variant="leading"을 쓴다 — 카드 높이/줄바꿈에 영향 없음.
  const nutritionTipSpeech = `영양 팁이에요. ${getNutritionTip(detail)}`;
  const notificationsSpeech = notificationsError
    ? "안내 사항이에요. 지금은 불러올 수 없어요."
    : notifications === null
      ? "안내 사항이에요. 아직 불러오는 중이에요."
      : notifications.length > 0
        ? `안내 사항이에요. ${notifications
            .slice(0, 3)
            .map((n) => n.message)
            .join(". ")}`
        : "안내 사항이에요. 아직 새로운 안내 사항이 없어요.";

  function checkMeal(status: "완식" | "남김") {
    // 로컬에 즉시 반영 — 네트워크 왕복을 기다리지 않고 버튼을 누른 순간 "오늘 체크: 완식"
    // 표시/TTS가 바로 나온다(낙관적 업데이트).
    setQuickMealCheck(ward.id, status);
    const message = status === "완식" ? "잘 하셨어요! 다음 식사도 챙겨드릴게요." : "알겠어요, 남긴 반찬은 다음 식단에 참고할게요.";
    toast.success(message);
    speak(message);

    // 실제 저장은 백그라운드로 — 아직 실제 백엔드에 연결 안 된 대상자(데모/자가등록 전
    // 등)나 네트워크 문제로 실패해도 위 로컬 반영/음성 안내는 이미 끝났으니 어르신 경험은
    // 끊기지 않는다. 이미 사진 기반 실제 기록이 있는 끼니면 applied:false로 와서, 그때만
    // 별도로 알려준다(grandfood_backend 145ee63).
    submitQuickMealCheck({
      wardId: ward.id,
      wardName: ward.name,
      wardAge: ward.age,
      wardAddress: ward.address,
      mealSlot: getCurrentMealSlot(),
      status,
    })
      .then((result) => {
        if (!result.applied) {
          toast.info("이미 사진으로 기록된 끼니라 이번 체크는 반영되지 않았어요.");
        }
      })
      .catch(() => {
        // 조용히 무시 — submitMealLogPhotos와 달리 이 버튼은 실패해도 사용자에게 막힌 느낌을
        // 주면 안 되는 가벼운 원탭이다.
      });
  }

  function listenForMealStatus() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast.error("이 브라우저에서는 음성 명령을 지원하지 않아요. 버튼을 눌러주세요.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.includes("남")) checkMeal("남김");
      else checkMeal("완식");
    };
    recognition.onerror = () => {
      toast.error("음성을 잘 듣지 못했어요. 다시 시도해 주세요.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  // isNewMember가 아직 null(최초 조회 중)이면 판단이 서기 전까지는 기존 홈 화면도, 신규
  // 회원용 소개 화면도 아닌 최소 로딩만 보여준다 — diet-view.tsx와 같은 이유로, 판단이 늦게
  // 서서 화면이 통째로 바뀌는 깜빡임을 피한다.
  if (banchanRecommendation.isNewMember == null) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title={`안녕하세요, ${name}님`} subtitle={partnerStore?.name} />
        <div className="px-5">
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (banchanRecommendation.isNewMember) {
    // 구독이 없으면 "AI 반찬 추천 받으러 가기"를 눌러 /user/diet에 가봐야 거기서 다시
    // 막힌다(health/service.py가 활성 구독을 요구함) — 처음 시작하는 화면에서부터 구독을
    // 먼저 안내한다. hasActiveSubscription이 아직 null(확인 중)이면 어느 쪽 버튼을 보여줄지
    // 아직 몰라서, 판단이 서기 전까지는 카드 자체를 잠깐 비워둔다(깜빡임 방지).
    if (banchanRecommendation.hasActiveSubscription == null) {
      return (
        <div className="flex flex-1 flex-col gap-4 pb-6">
          <TopBar title={`환영해요, ${name}님`} subtitle="그랜드푸드가 처음이시군요" />
        </div>
      );
    }

    const needsSubscription = !banchanRecommendation.hasActiveSubscription;
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title={`환영해요, ${name}님`} subtitle="그랜드푸드가 처음이시군요" />
        <div className="flex flex-col gap-4 px-5">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <GrandFoodMark className="h-14 w-14" />
            <p className="text-base font-bold text-foreground">GrandFood와 함께 시작해요</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              그랜드푸드는 건강 상태와 질환·알레르기에 맞춰 AI가 매주 반찬을 추천하고, 담당
              반찬가게가 그대로 배송해드리는 서비스예요. 잔반 사진만 올리면 잔반율도 자동으로
              분석해드려요.
              {needsSubscription && " 먼저 구독을 시작하면 바로 이용하실 수 있어요."}
            </p>
            {needsSubscription ? (
              <Button className="mt-1 w-full" nativeButton={false} render={<Link href="/user/subscription" />}>
                <Sparkles />
                구독하고 시작하기
              </Button>
            ) : (
              <Button className="mt-1 w-full" nativeButton={false} render={<Link href="/user/diet" />}>
                <Sparkles />
                AI 반찬 추천 받으러 가기
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title={`안녕하세요, ${name}님`} subtitle={partnerStore?.name} />

      <div className="flex flex-col gap-4 px-5">
        <SpeakableCard
          id="home-delivery-eta"
          text={deliverySpeech}
          className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm text-foreground"
        >
          <Truck className="h-4 w-4 shrink-0 text-accent" />
          오늘 점심 배송 예정 · <span className="font-semibold">{detail.deliveryEta}</span>
        </SpeakableCard>

        {/* 배송 알림 바로 아래에 둔다 — 배송예정/영양팁 둘 다 "오늘의 짧은 공지"라 시각적으로
            묶이는 게 자연스럽다. 각자 별도 SpeakableCard라 text가 안 합쳐지므로, TTS는
            눌렀을 때 이 카드 내용만 읽는다(배송 정보와 안 섞임). */}
        <SpeakableCard
          id="home-nutrition-tip"
          text={nutritionTipSpeech}
          tone="sidebar"
          variant="leading"
          className="rounded-2xl bg-sidebar p-4 text-sm text-sidebar-foreground shadow-sm"
        >
          {getNutritionTip(detail)}
        </SpeakableCard>

        <SpeakableCard
          id="home-today-meal"
          text={`${recommendedComboSpeech} ${mealCheckSpeech}`}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl">{menuEmoji}</span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">
                오늘의 추천 반찬 조합
              </span>
              <span className="text-lg font-extrabold text-foreground">
                {partnerStore?.name ?? "담당 반찬가게"}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {todayMenu.isGenerating ? (
              <p className="text-sm text-muted-foreground">{TODAY_MENU_GENERATING_MESSAGE}</p>
            ) : todayMenu.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">이 날은 배정된 반찬이 없어요.</p>
            ) : (
              todayMenu.items.map((item) => {
                const disliked = dislikes.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${disliked ? "text-muted-foreground line-through" : "text-foreground"}`}
                      >
                        {item.name}
                      </span>
                      {item.suitability && (
                        <Badge className={SUITABILITY_CLASS[item.suitability]}>
                          {SUITABILITY_LABEL[item.suitability]}
                        </Badge>
                      )}
                    </div>
                    <DislikeToggleButton
                      disliked={disliked}
                      onClick={() => toggleDislike(ward.id, item.id)}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <span className="text-xs font-semibold text-muted-foreground">
              식사하셨으면 알려주세요
            </span>
            <div className="flex gap-2">
              <Button
                size="lg"
                className="h-14 flex-1 text-base"
                onClick={(e) => {
                  e.stopPropagation();
                  checkMeal("완식");
                }}
              >
                다 먹었어요
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 flex-1 text-base"
                onClick={(e) => {
                  e.stopPropagation();
                  checkMeal("남김");
                }}
              >
                남겼어요
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-fit self-center text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                listenForMealStatus();
              }}
              disabled={listening}
            >
              <Mic className={listening ? "animate-pulse text-destructive" : ""} />
              {listening ? "듣고 있어요..." : "말로 알려주기"}
            </Button>
            {mealCheck && (
              <p className="text-center text-xs text-muted-foreground">
                오늘 체크: <span className="font-semibold text-foreground">{mealCheck}</span>
              </p>
            )}
          </div>
        </SpeakableCard>

        <Button
          size="lg"
          className="h-14 w-full text-base"
          nativeButton={false}
          render={<Link href="/user/assistant" />}
        >
          <Sparkles className="h-5 w-5" />
          AI 도우미와 이야기하기
        </Button>

        <Link
          href="/user/diet"
          className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3"
        >
          <span className="text-sm font-semibold text-foreground">식단 상세 보기</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        {/* 로딩 중이거나 에러거나 실제 안내가 있을 때만 보여준다 — 다 불러왔는데 그냥
            아무것도 없는 경우까지 빈 카드로 보여주면 화면만 늘어난다. */}
        {(notificationsError || notifications === null || notifications.length > 0) && (
          <SpeakableCard
            id="home-notifications"
            text={notificationsSpeech}
            className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <span className="text-xs font-bold text-foreground">안내 사항</span>
            {notificationsError && (
              <span className="text-xs text-muted-foreground">{notificationsError}</span>
            )}
            {!notificationsError && notifications === null && (
              <span className="text-xs text-muted-foreground">불러오는 중이에요...</span>
            )}
            {(notifications ?? []).slice(0, 3).map((n) => (
              <div key={n.id} className="flex items-start gap-2.5 text-sm">
                <Badge className={`${notificationBadgeClass(n.type)} shrink-0`}>
                  {n.type}
                </Badge>
                <div className="flex flex-col">
                  <span className="text-foreground">{n.message}</span>
                  <span className="text-xs text-muted-foreground">{n.date}</span>
                </div>
              </div>
            ))}
          </SpeakableCard>
        )}
      </div>
    </div>
  );
}
