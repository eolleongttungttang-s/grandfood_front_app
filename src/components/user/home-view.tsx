"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronRight,
  PartyPopper,
  Sparkles,
  Truck,
} from "lucide-react";

import { MealTone, Ward, WardDetail } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";
import { getRepresentativeDish } from "@/lib/dishes";
import { deriveMealTones, fetchElderDietHistory } from "@/lib/meal-dashboard";
import { NotificationItem, fetchElderNotifications, notificationBadgeClass } from "@/lib/notifications";
import { SUITABILITY_CLASS, SUITABILITY_LABEL } from "@/lib/banchan-recommendation";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import {
  applyLeftoverAnalysisResult,
  getCurrentMealSlot,
  mealLogStore,
  submitMealLogPhotos,
  wardMealLogs,
} from "@/lib/meal-log-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { DislikeToggleButton } from "@/components/app/dislike-toggle-button";
import { LeftoverDishList, LeftoverOverallTile } from "@/components/app/leftover-result";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { getNutritionTip } from "@/lib/nutrition-tip";
import {
  dislikesStore,
  fetchDislikedFoodNames,
  syncDislikedFoodsToBackend,
  toggleDislike,
  wardDislikes,
} from "@/lib/dislikes-store";
import { useLocalStore } from "@/lib/use-store";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";

// diet-view.tsx에 있던 "식사 체크인 · 잔반 분석"을 홈 화면으로 옮기며 같이 옮긴 헬퍼 — 선택한
// File을 <img>로 미리보기할 blob URL로 바꿔준다. object URL은 브라우저 메모리에 남는 리소스라
// 파일이 바뀌거나 컴포넌트가 사라질 때 revoke까지 해줘야 한다.
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

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
  // dislikesStore(로컬 id 목록)만으로는 이 브라우저에서 누른 기록만 보인다 — 백엔드에
  // 이미 저장돼 있는 기피 목록(다른 기기에서 눌렀거나, 이전 세션에 눌러둔 것)은 이름
  // 기준이라 별도로 받아와서 이름으로 비교한다(dislikes-store.ts 상단 주석 참고).
  // todayMenu.items에 의존하지 않고 대상자 식별 정보만으로 한 번 받아온다 — todayMenu는
  // 매 렌더 다시 계산되는 값이라 의존성에 넣으면 불필요하게 반복 호출된다.
  const [backendDislikedNames, setBackendDislikedNames] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDislikedFoodNames({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }).then(
      (names) => {
        if (!cancelled && names) setBackendDislikedNames(new Set(names));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);
  // 로컬(이 브라우저에서 방금 누른 것, id 기준) + 백엔드(이름 기준) 둘 중 하나라도
  // 걸리면 기피로 본다 — 토글 직후엔 로컬이 먼저 반영되고(체감 즉시 반응), 다른
  // 기기/이전 세션에서 표시해둔 건 백엔드 값으로 잡힌다.
  function isDisliked(item: { id: string; name: string }): boolean {
    return dislikes.includes(item.id) || (backendDislikedNames?.has(item.name) ?? false);
  }
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

  // 완식 스트릭 격려 문구 — "최근 7일 중 5일 완식하셨어요" (2026-08-19 피드백). records-view.tsx의
  // "최근 14일 섭취 기록"과 같은 방식(fetchElderDietHistory + deriveMealTones)으로 최근
  // STREAK_DAYS일의 톤을 구해 그중 "완식"만 센다 — 로컬 mealLogStore(잔반 사진 업로드 기록)
  // 대신 이 경로를 쓰는 이유: mealLogStore의 leftoverRatePercent/compartments는 아직 Vision
  // 분석이 안 붙어 백엔드가 항상 0/[]로 고정 응답한다(meal-log-store.ts 주석 참고) — 그걸로
  // "완식"을 세면 사진만 올리면 항상 완식으로 잡혀 의미가 없다. diet-history는 quick_check_status
  // (원탭 자가 보고)까지 반영해 더 신뢰할 수 있다. 실패하면(백엔드 접근 불가 등) 조용히
  // 문구를 안 보여준다 — 다른 조회들과 같은 관례.
  const STREAK_DAYS = 7;
  const [recentTones, setRecentTones] = useState<MealTone[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchElderDietHistory({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }, STREAK_DAYS).then(
      (items) => {
        if (cancelled || !items) return;
        setRecentTones(deriveMealTones(items, STREAK_DAYS));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);
  const completeStreakCount = recentTones?.filter((t) => t === "완식").length ?? null;

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
        .map((item) => (isDisliked(item) ? `${item.name}, 기피 표시됨` : item.name))
        .join(", ")}입니다.`;
  const deliverySpeech = `오늘 점심 배송이 ${detail.deliveryEta}에 예정되어 있어요.`;
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

  // "식사하셨으면 알려주세요"(완식/남김 버튼, 목업 상태 기반)는 뺐다 — 어차피 식전/식후
  // 사진으로 실제 잔반을 확인할 수 있는데 자가 신고 버튼까지 같이 두면 중복이다(2026-08-14
  // 피드백). 그 자리에 diet-view.tsx에 있던 진짜 사진 기반 잔반 분석을 그대로 옮겨왔다 —
  // 어르신이 식단을 확인하는 홈 화면에서 바로 사진을 찍게 하는 게, 식단 상세 화면까지
  // 들어가야 하는 것보다 동선이 짧다.
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const beforePreview = useObjectUrl(beforePhoto);
  const afterPreview = useObjectUrl(afterPhoto);
  const mealLogs = wardMealLogs(useLocalStore(mealLogStore), ward.id);
  const latestLog = mealLogs[mealLogs.length - 1];

  // 백엔드가 사진 업로드 응답으로는 항상 leftoverRatePercent=0/compartments=[]만 돌려주고
  // (meal-log-store.ts submitMealLogPhotos 주석 참고 — 실제 GPU 분석은 background_tasks로
  // 뒤로 미뤄짐), 반찬별 결과는 분석이 끝난 뒤 diet-history에만 반영된다. "잔반 분석하기"를
  // 누른 이 화면에서 바로 결과를 보여주려고, 방금 올린 mealId를 diet-history에서 짧게
  // 폴링해 찾는다 — 찾으면 로컬 기록을 실제 값으로 갱신하고, POLL_MAX_ATTEMPTS 안에 못
  // 찾으면(분석이 유난히 오래 걸리거나 실패) 포기하고 "기록" 탭 안내로 넘긴다.
  const [pendingAnalysisMealId, setPendingAnalysisMealId] = useState<string | null>(null);
  const [analysisTimedOut, setAnalysisTimedOut] = useState(false);
  const POLL_INTERVAL_MS = 4000;
  const POLL_MAX_ATTEMPTS = 8; // 최대 약 32초

  useEffect(() => {
    if (!pendingAnalysisMealId) return;
    const mealId = pendingAnalysisMealId;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      attempts += 1;
      const items = await fetchElderDietHistory(
        { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
        1
      );
      if (cancelled) return;
      const match = items?.find((item) => item.mealId === mealId);
      if (match && match.dishes.length > 0) {
        applyLeftoverAnalysisResult(
          ward.id,
          mealId,
          match.dishes.map((d) => ({
            dishId: d.banchanId,
            name: d.banchanName ?? "반찬",
            leftoverPercent: Math.round(d.leftoverPct),
          }))
        );
        setPendingAnalysisMealId(null);
        return;
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setAnalysisTimedOut(true);
        setPendingAnalysisMealId(null);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingAnalysisMealId, ward.id, ward.name, ward.age, ward.address]);

  const mealCheckinSpeech = pendingAnalysisMealId
    ? "식사 전에 한 장, 식사 후에 한 장, 잊지 말고 찍어주세요. 지금 반찬별 잔반을 분석하고 있어요."
    : latestLog
      ? `식사 전에 한 장, 식사 후에 한 장, 잊지 말고 찍어주세요. 최근 분석 결과, 전체 잔반율은 ${latestLog.leftoverRatePercent}%입니다.`
      : "식사 전에 한 장, 식사 후에 한 장, 잊지 말고 찍어주세요.";

  async function analyzeLeftovers() {
    if (!beforePhoto || !afterPhoto) return;
    setSubmitting(true);
    setUploadError(null);
    setAnalysisTimedOut(false);
    try {
      const entry = await submitMealLogPhotos({
        wardId: ward.id,
        wardName: ward.name,
        wardAge: ward.age,
        wardAddress: ward.address,
        mealSlot: getCurrentMealSlot(),
        comboId: detail.recommendedCombo.comboId,
        beforePhoto,
        afterPhoto,
      });
      setBeforePhoto(null);
      setAfterPhoto(null);
      setPendingAnalysisMealId(entry.id);
    } catch (err) {
      // fetch() 자체가 실패하면(서버 연결 불가 등) 브라우저가 TypeError("Failed to fetch")를 던지는데,
      // 그 영어 메시지를 그대로 보여주는 대신 사용자에게 이해되는 한글 메시지로 바꾼다.
      setUploadError(
        err instanceof TypeError
          ? "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요."
          : err instanceof Error
            ? err.message
            : "잔반 분석 요청에 실패했어요."
      );
    } finally {
      setSubmitting(false);
    }
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

        {/* 완식 스트릭 격려 배너 — 0일이면(아직 기록이 없거나 최근에 잘 못 드신 경우) 굳이
            "0일 완식하셨어요"처럼 무의미하거나 오히려 낙담시키는 문구를 보여줄 이유가 없어,
            1일 이상일 때만 보여준다(다른 조건부 카드들과 같은 관례 — notifications 등). */}
        {completeStreakCount != null && completeStreakCount > 0 && (
          <SpeakableCard
            id="home-complete-streak"
            text={`최근 ${STREAK_DAYS}일 중 ${completeStreakCount}일 완식하셨어요. 잘하고 계세요!`}
            className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm text-foreground"
          >
            <PartyPopper className="h-4 w-4 shrink-0 text-accent" />
            최근 {STREAK_DAYS}일 중 <span className="font-semibold">{completeStreakCount}일</span> 완식하셨어요!
          </SpeakableCard>
        )}

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
          text={`${recommendedComboSpeech} ${mealCheckinSpeech}`}
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
                const disliked = isDisliked(item);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-2 rounded-lg bg-muted/60 px-2 py-2"
                  >
                    <div className="flex items-center gap-1.5">
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
                      {/* 취소선만으로는 "예전에 기피 표시한 반찬이 오늘 또 나왔다"가 잘
                          안 보인다는 피드백(2026-08-19) — 글자 배지로 한 번 더 확실히
                          알려준다. 건강 관련 판정(SUITABILITY_CLASS)이 아니라 개인 취향
                          표시라 그 색과는 구분되게 outline 배지를 쓴다. */}
                      {disliked && (
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">
                          기피 표시됨
                        </Badge>
                      )}
                    </div>
                    <DislikeToggleButton
                      disliked={disliked}
                      onClick={async () => {
                        toggleDislike(ward.id, item.id);
                        // 다음 AI 반찬 추천부터 이 반찬을 caution 이하로 낮춰 판단하도록
                        // 백엔드에도 반영한다(dislikes-store.ts 상단 주석 참고). PUT은
                        // "요청값이 곧 전체 목록"이라, 지금까지 알고 있는 전체 기피
                        // 이름 집합(backendDislikedNames)에 이번 토글만 반영해서
                        // 통째로 보낸다 — 오늘 메뉴에 없는(다른 날 기피 표시한) 항목도
                        // 같이 보존된다.
                        //
                        // backendDislikedNames가 아직 null이면(화면 진입 직후 GET이
                        // 아직 안 끝났는데 사용자가 빠르게 토글을 누른 경우) prev ?? []로
                        // 빈 Set을 기준으로 삼으면 안 된다 — "아직 못 받아옴"과 "받아왔는데
                        // 원래 비어있었음"을 못 구분해서, 이전에 저장해둔 다른 기피 항목이
                        // 이번 PUT(전체 교체)으로 통째로 지워지는 유실이 생긴다. 그 경우
                        // 보내기 전에 한 번 더 직접 받아와 기준으로 삼는다. 또한 setState
                        // updater 안에서 네트워크 요청을 하면 안 되므로(React가 updater를
                        // 여러 번 호출할 수 있음 — 순수해야 함) 별도로 계산한다.
                        const identity = {
                          mockWardId: ward.id,
                          name: ward.name,
                          age: ward.age,
                          address: ward.address,
                        };
                        const baseNames =
                          backendDislikedNames ?? new Set((await fetchDislikedFoodNames(identity)) ?? []);
                        const next = new Set(baseNames);
                        if (disliked) next.delete(item.name);
                        else next.add(item.name);
                        setBackendDislikedNames(next);
                        syncDislikedFoodsToBackend(identity, [...next]);
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <p className="text-lg font-extrabold leading-snug text-foreground">
              식사 전에 한 장, 식사 후에 한 장,
              <br />
              잊지 말고 찍어주세요!
            </p>
            {/* 이 카드 전체가 SpeakableCard의 탭 영역이라, 사진 업로드 라벨을 누른 클릭이
                그대로 버블링되면 파일 선택과 동시에 음성 읽기가 토글된다 — stopPropagation으로
                막는다(analyzeLeftovers 버튼도 동일, diet-view.tsx에 있던 것과 동일한 이유). */}
            <div className="flex gap-2">
              <label
                className="flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 p-5 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                {beforePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob URL 미리보기라 next/image 최적화 대상이 아님
                  <img src={beforePreview} alt="식전 사진 미리보기" className="h-24 w-24 rounded-lg object-cover" />
                ) : (
                  <Camera className="h-9 w-9 text-muted-foreground" />
                )}
                <span className="text-base font-semibold text-foreground">식전 사진</span>
                <input
                  type="file"
                  // iOS Safari는 accept="image/*"면 HEIC 원본을 그대로 넘긴다 — HEIC/HEIF만
                  // 빼고 나머지 흔한 포맷은 다 허용해야, 카메라 캡처 시점엔 iOS가 자동으로
                  // JPEG로 변환하면서도 Android/데스크톱의 갤러리 선택창에서 예전에 찍어둔
                  // PNG/WEBP 사진까지 걸러지는 걸 막는다.
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <label
                className="flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 p-5 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                {afterPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob URL 미리보기라 next/image 최적화 대상이 아님
                  <img src={afterPreview} alt="식후 사진 미리보기" className="h-24 w-24 rounded-lg object-cover" />
                ) : (
                  <Camera className="h-9 w-9 text-muted-foreground" />
                )}
                <span className="text-base font-semibold text-foreground">식후 사진</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={!beforePhoto || !afterPhoto || submitting}
              onClick={(e) => {
                e.stopPropagation();
                analyzeLeftovers();
              }}
            >
              {submitting ? "분석 요청 중..." : "잔반 분석하기"}
            </Button>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            {latestLog && (
              <div className="flex flex-col gap-2 pt-1">
                {pendingAnalysisMealId === latestLog.id ? (
                  <span className="text-sm text-muted-foreground">반찬별 잔반을 분석하고 있어요...</span>
                ) : latestLog.compartments.length > 0 ? (
                  <>
                    <span className="text-xs font-semibold text-muted-foreground">최근 분석 결과</span>
                    <LeftoverOverallTile percent={latestLog.leftoverRatePercent} />
                    <LeftoverDishList
                      dishes={latestLog.compartments.map((c, i) => ({
                        key: `${c.dishId}-${i}`,
                        name: c.name,
                        leftoverPercent: c.leftoverPercent,
                      }))}
                    />
                  </>
                ) : analysisTimedOut ? (
                  <span className="text-sm text-muted-foreground">
                    분석에 시간이 걸리고 있어요. 잠시 후 기록 탭에서 확인해 주세요.
                  </span>
                ) : null}
              </div>
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
