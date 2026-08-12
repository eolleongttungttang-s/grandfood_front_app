"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Mic,
  PhoneCall,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";
import { getRepresentativeDish } from "@/lib/dishes";
import { NotificationItem, fetchElderNotifications, notificationBadgeClass } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { getNutritionTip } from "@/lib/nutrition-tip";
import { dislikesStore, toggleDislike, wardDislikes } from "@/lib/dislikes-store";
import { quickMealCheckStore, setQuickMealCheck } from "@/lib/meal-log-store";
import { useLocalStore } from "@/lib/use-store";
import { getSpeechRecognition, speak } from "@/lib/accessibility";

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
  const mealCheck = useLocalStore(quickMealCheckStore)[ward.id] ?? null;
  const [listening, setListening] = useState(false);
  const partnerStore = getPartnerStore(ward.partnerStoreId);

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

  const representativeDish = getRepresentativeDish(detail.recommendedCombo);
  const recommendedComboSpeech = `오늘의 추천 반찬 조합이에요. ${partnerStore?.name ?? "담당 반찬가게"}에서 준비했어요. ${detail.recommendedCombo.items
    .map((item) => (dislikes.includes(item.dishId) ? `${item.name}, 기피 표시됨` : item.name))
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
    setQuickMealCheck(ward.id, status);
    const message = status === "완식" ? "잘 하셨어요! 다음 식사도 챙겨드릴게요." : "알겠어요, 남긴 반찬은 다음 식단에 참고할게요.";
    toast.success(message);
    speak(message);
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

        <SpeakableCard
          id="home-recommended-combo"
          text={recommendedComboSpeech}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl">{representativeDish?.imageEmoji ?? "🍽️"}</span>
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
            {detail.recommendedCombo.items.map((item) => {
              const disliked = dislikes.includes(item.dishId);
              return (
                <div
                  key={item.dishId}
                  className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2"
                >
                  <span
                    className={`text-sm ${disliked ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDislike(ward.id, item.dishId);
                    }}
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
        </SpeakableCard>

        <SpeakableCard
          id="home-meal-check"
          text={mealCheckSpeech}
          className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
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
        </SpeakableCard>

        <SpeakableCard
          id="home-nutrition-tip"
          text={nutritionTipSpeech}
          tone="sidebar"
          variant="leading"
          className="rounded-2xl bg-sidebar p-4 text-sm text-sidebar-foreground shadow-sm"
        >
          {getNutritionTip(detail)}
        </SpeakableCard>

        <Button
          variant="outline"
          className="h-auto flex-col gap-1.5 py-3"
          nativeButton={false}
          render={<Link href="/user/assistant" />}
        >
          <Sparkles className="h-5 w-5 text-accent" />
          <span className="text-sm">AI 도우미와 이야기하기</span>
        </Button>

        {ward.lastMeal.tone !== "완식" && (
          <Button
            variant="outline"
            className="w-fit"
            onClick={() =>
              toast.success(`${partnerStore?.name ?? "담당 반찬가게"}에 연락 요청을 보냈어요.`)
            }
          >
            <PhoneCall />
            매장에 문의하기
          </Button>
        )}

        <Link
          href="/user/diet"
          className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3"
        >
          <span className="text-sm font-semibold text-foreground">
            식단 상세와 건강지표 더보기
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

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
          {!notificationsError && notifications !== null && notifications.length === 0 && (
            <span className="text-xs text-muted-foreground">아직 안내 사항이 없어요.</span>
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
      </div>
    </div>
  );
}
