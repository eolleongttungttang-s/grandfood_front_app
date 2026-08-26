"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Camera,
  ChevronRight,
  CircleHelp,
  Images,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";
import { getRepresentativeDish } from "@/lib/dishes";
import { fetchElderDietHistory } from "@/lib/meal-dashboard";
import {
  fetchElderNotifications,
  fetchElderStreakNotification,
  getElderDeliveryNotification,
  getElderSosAcknowledgment,
  getSeenNotificationIds,
} from "@/lib/notifications";
import { sosAckStore, spokenSosAckStore } from "@/lib/sos-store";
import { speakUrgent } from "@/lib/accessibility";
import { BackendMealType, computeTodayNutritionSnapshot } from "@/lib/banchan-recommendation";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import { deriveHealthInsight } from "@/lib/health-insights";
import { adviseForWard, MedicationAdvice } from "@/lib/medication";
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

// diet-view.tsx/banchan-recommendation-calendar.tsx와 같은 시간대 기준(11시 이전=아침,
// 11~17시=점심, 그 외=저녁)을 각자 복제하는 이 저장소 관례를 그대로 따른다 — 홈 화면도
// "오늘의 추천 반찬 조합"을 하루 전체(아침+점심+저녁 합산이라 9개까지 나열돼 길어짐, 피드백)
// 대신 지금 끼니 하나만 보여주도록 좁힌다(2026-08-21).
function currentBackendMealType(): BackendMealType {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 17) return "lunch";
  return "dinner";
}

const BACKEND_MEAL_TYPE_LABEL: Record<BackendMealType, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
};

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

  // 복약 안내 — 온보딩 때 받은 복용약 정보가 홈 화면 어디에도 안 보인다는 팀장 피드백
  // (2026-08-24)으로 추가. 실패하면(세션 없음/서버 오류) 조용히 카드를 숨긴다 — 이 앱의
  // 다른 보조 fetch들(예: 위 backendDislikedNames)과 같은 관례.
  const [medicationAdvice, setMedicationAdvice] = useState<MedicationAdvice | null>(null);
  useEffect(() => {
    let cancelled = false;
    adviseForWard({ wardId: ward.id, wardName: ward.name, wardAge: ward.age, wardAddress: ward.address })
      .then((advice) => {
        if (!cancelled) setMedicationAdvice(advice);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

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

  // 안내 사항(이상신호/안부확인콜)과 완식 스트릭 격려 문구 둘 다 더 이상 이 화면에 카드로
  // 늘어놓지 않는다 — 배송 예정처럼 매일 훑어봐야 하는 정보가 아니라, "궁금할 때 들어가
  // 보는" 정보라 화면 길이만 늘렸다(2026-08-21 피드백, 배민 배송 조회 방식과 비교). 대신
  // TopBar의 종 모양 아이콘 → /user/notifications로 옮기고, 여기서는 "아직 안 본 항목이
  // 있는지"만 확인해 배지 점으로 알린다. 서버가 주는 read(이상신호 해결 여부 등)를 그대로
  // 쓰지 않는 이유 — 안 고쳐진 이상신호는 계속 read:false라 배지가 영원히 안 꺼진다. 대신
  // getSeenNotificationIds(로컬 저장, /user/notifications에서 열람 시 기록)에 없는 항목만
  // "안 본 것"으로 친다 — 한 번 목록을 열어보면 그때까지 있던 항목은 다시는 배지를 안 켠다
  // (2026-08-21 피드백, "한 번 보면 꺼져야지 계속 켜져 있으면 자꾸 확인하게 된다").
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
  // 보호자가 "확인했어요"를 누르면(같은 브라우저 데모 한정) sosAckStore가 바뀐다 — 그걸
  // 감지해서 아래 effect를 다시 돌려 배지에 반영한다(notifications-view.tsx와 같은 이유).
  const sosAck = useLocalStore(sosAckStore);

  // 보호자가 확인하면 어르신이 알림함을 직접 열어보지 않아도 바로 음성으로 들리도록,
  // 홈 화면에 있을 때 자동 재생한다(2026-08-24 피드백) — spokenSosAckStore에 없는
  // (아직 이 브라우저에서 한 번도 안 읽어준) sos-ack만 골라서 재생하고 바로 기록해
  // 재렌더/재방문마다 반복 재생되지 않게 한다. 토스트도 같이 띄운다 — 사용자 조작 없이
  // useEffect에서 바로 부르는 음성이라 일부 브라우저의 자동재생 정책에 조용히 막힐 수
  // 있는데(2026-08-24 코드 리뷰 지적), 그래도 눈으로는 반드시 확인할 수 있게 하기 위함.
  useEffect(() => {
    const ackItem = getElderSosAcknowledgment(ward.id);
    if (!ackItem) return;
    if (spokenSosAckStore.read().includes(ackItem.id)) return;
    speakUrgent(ackItem.message);
    toast.info(ackItem.message);
    spokenSosAckStore.update((prev) => [...prev, ackItem.id]);
  }, [ward.id, sosAck]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchElderNotifications({ mockWardId: ward.id }).catch(() => []),
      fetchElderStreakNotification({
        mockWardId: ward.id,
        name: ward.name,
        age: ward.age,
        address: ward.address,
      }).catch(() => null),
    ]).then(([notifications, streak]) => {
      if (cancelled) return;
      const sosAckItem = getElderSosAcknowledgment(ward.id);
      const merged = [
        getElderDeliveryNotification(ward.status),
        ...(sosAckItem ? [sosAckItem] : []),
        ...notifications,
        ...(streak ? [streak] : []),
      ];
      const seen = new Set(getSeenNotificationIds(ward.id));
      setHasUnreadNotification(merged.some((n) => !seen.has(n.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address, ward.status, sosAck]);

  // 오늘 실제 AI 추천이 있으면 그걸, 없으면 목업으로 자연스럽게 폴백한다 — diet-view.tsx와
  // 같은 이유(2026-08-13 피드백, "오늘의 추천 반찬 조합" 카드와 AI 반찬 추천 달력이 서로
  // 다른 답을 보여주던 문제). mealType을 지금 끼니로 좁혀서, 하루 전체(최대 9개)가 아니라
  // 지금 먹을 끼니 것만 보여준다(2026-08-21, "너무 길어졌다" 피드백) — 나머지 끼니는
  // "식단 상세 보기"에서 볼 수 있다.
  const currentMealType = currentBackendMealType();
  const todayMenu = resolveTodayMenu(detail.recommendedCombo, banchanRecommendation.monthly, currentMealType);
  const representativeDish = getRepresentativeDish(detail.recommendedCombo);
  // 영양 팁 카드 — records-view.tsx("오늘 영양성분 분석")와 같은 기준(오늘 배정 반찬의
  // 영양가 합 vs 실제 목표치)으로 결핍을 판단한다. 여기서는 문구 하나만 고르면 돼서
  // 잔반 재료 추천 등 deriveHealthInsight의 나머지 계산은 안 쓰므로 recentMealLogs는
  // 빈 배열로 넘긴다 — deficiencies 계산 자체는 그 인자와 무관하다.
  const todayNutrition = computeTodayNutritionSnapshot(banchanRecommendation.monthly);
  const healthInsight = deriveHealthInsight(ward, todayNutrition, []);
  // isGenerating일 때도 목업 이모지를 그대로 두면 "생성 중" 문구 옆에 무관한 목업 반찬
  // 이모지가 남는다 — diet-view.tsx와 동일하게 그때도 기본 이모지를 쓴다.
  const menuEmoji =
    todayMenu.isReal || todayMenu.isGenerating ? "🍽️" : (representativeDish?.imageEmoji ?? "🍽️");
  // isGenerating이면 items가 비어 있어 그대로 문장을 지으면 "...준비했어요. 입니다." 같은
  // 빈 목록 문장이 되므로, 화면 문구와 같은 생성 중 안내로 맞춘다.
  const currentMealLabel = BACKEND_MEAL_TYPE_LABEL[currentMealType];
  const recommendedComboSpeech = todayMenu.isGenerating
    ? TODAY_MENU_GENERATING_MESSAGE
    : `오늘의 ${currentMealLabel} 추천 반찬 조합이에요. ${partnerStore?.name ?? "담당 반찬가게"}에서 준비했어요. ${todayMenu.items
        .map((item) => (isDisliked(item) ? `${item.name}, 기피 표시됨` : item.name))
        .join(", ")}입니다.`;
  // 영양 팁 문장이 카드 폭에 거의 딱 맞게 들어가 있어서, SpeakableCard의 기본(우상단 오버레이)
  // 아이콘이 문장 끝과 겹친다. 이 카드는 원래도 맨 앞에 이모지(💬)가 있으니, 그 자리를 스피커
  // 아이콘으로 "교체"하는 variant="leading"을 쓴다 — 카드 높이/줄바꿈에 영향 없음.
  const nutritionTipSpeech = `영양 팁이에요. ${getNutritionTip(healthInsight.deficiencies)}`;

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
  // 촬영용 입력(capture="environment")과 별개로 갤러리 전용 입력을 하나 더 두고, 버튼으로
  // 그 input.click()을 직접 트리거한다 — capture 속성이 있으면 갤러리 선택창이 아예 안 뜨는
  // 경우가 많아서(2026-08-21), "촬영"과 "갤러리에서 선택"을 각자 다른 input으로 분리해야
  // 카톡처럼 둘 다 제공할 수 있다.
  const beforeGalleryInputRef = useRef<HTMLInputElement>(null);
  const afterGalleryInputRef = useRef<HTMLInputElement>(null);
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
  // GPU 잔반 분석 자체는 0.8초 안에 끝나는데(2026-08-25 확인), 예전엔 폴링 간격이
  // 4초라 아무리 빨리 끝나도 최소 4초는 기다려야 화면에 반영됐다 — 1초로 줄여서
  // 그 하한선을 낮춘다. 총 대기 한도(약 32초)는 그대로 유지하려고 시도 횟수를
  // 8 -> 32로 같이 늘렸다.
  const POLL_INTERVAL_MS = 1000;
  const POLL_MAX_ATTEMPTS = 32; // 최대 약 32초

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
    ? "식사 전후로 한 장씩 찍어주세요. 지금 반찬별 잔반을 분석하고 있어요."
    : latestLog
      ? `식사 전후로 한 장씩 찍어주세요. 최근 분석 결과, 전체 잔반율은 ${latestLog.leftoverRatePercent}%입니다.`
      : "식사 전후로 한 장씩 찍어주세요.";

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
      <TopBar
        title={`안녕하세요, ${name}님`}
        subtitle={partnerStore?.name}
        right={
          <div className="flex items-center gap-1">
            <Link
              href="/user/tutorial?replay=1"
              aria-label="사용법 다시 보기"
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <CircleHelp className="h-5 w-5" />
            </Link>
            <Link
              href="/user/notifications"
              aria-label={hasUnreadNotification ? "알림, 안 읽은 알림 있음" : "알림"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <Bell className="h-5 w-5" />
              {hasUnreadNotification && (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
                />
              )}
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-4 px-5">
        {/* 완식 스트릭 격려 배너에 이어, "오늘 점심 배송 예정 · 12:00" 배너도 뺐다 — 그
            시각 자체가 실제 배송 스케줄이 아니라 대상자 상태값으로 고른 자리표시자였다
            (estimateDeliveryEta, ward-registry.ts 참고). 정밀한 척하는 가짜 시각을 매일
            눈에 띄는 홈 배너로 상시 노출하는 대신, 완식과 같은 방식으로 /user/notifications로
            옮겼다(2026-08-24 피드백, getElderDeliveryNotification). */}
        <SpeakableCard
          id="home-nutrition-tip"
          text={nutritionTipSpeech}
          tone="sidebar"
          variant="leading"
          className="rounded-2xl bg-sidebar p-4 text-sm text-sidebar-foreground shadow-sm"
        >
          {getNutritionTip(healthInsight.deficiencies)}
        </SpeakableCard>

        <SpeakableCard
          id="home-today-meal"
          text={`${recommendedComboSpeech} ${mealCheckinSpeech}`}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{menuEmoji}</span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">
                오늘의 추천 반찬 조합
              </span>
              <span className="text-base font-extrabold text-foreground">
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
                      {/* 취소선만으로는 "예전에 기피 표시한 반찬이 오늘 또 나왔다"가 잘
                          안 보인다는 피드백(2026-08-19) — 글자 배지로 한 번 더 확실히
                          알려준다. "추천/주의" 건강 판정 배지는 큰 의미가 없다는 피드백으로
                          뺐다(2026-08-21) — 이 배지는 그거랑 무관한 개인 취향 표시라 그대로
                          남긴다. */}
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
            {/* 한 줄로 고정한다(2026-08-21 피드백 — 줄바꿈 자체를 원치 않음). 모바일
                폭에서는 text-lg 그대로 두면 줄바꿈이 생겨서, 좁은 화면(기본, sm 미만)에서만
                한 단계 작은 text-base를 쓰고 sm 이상(태블릿/PC)에서 다시 text-lg로 키운다
                — whitespace-nowrap으로 줄바꿈 자체를 막는다. */}
            <p className="text-base font-extrabold leading-snug whitespace-nowrap text-foreground sm:text-lg">
              식사 전후로 한 장씩 찍어주세요!
            </p>
            {/* 이 카드 전체가 SpeakableCard의 탭 영역이라, 사진 업로드 라벨을 누른 클릭이
                그대로 버블링되면 파일 선택과 동시에 음성 읽기가 토글된다 — stopPropagation으로
                막는다(analyzeLeftovers 버튼도 동일, diet-view.tsx에 있던 것과 동일한 이유). */}
            <div className="flex gap-2">
              <label
                className="relative flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 p-5 text-center"
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
                  // capture="environment"가 있으면 카메라 뷰파인더가 먼저 뜨고(갤럭시 실기기
                  // 확인, 주 타겟 70~80대 기준) 갤러리 선택은 아예 안 나오는 경우가 많다 —
                  // 그래서 갤러리는 아래 버튼의 별도 input(갤러리 전용)으로 분리했다.
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)}
                />
                {/* 카톡 사진 첨부처럼 "촬영" 옆에 갤러리 바로가기를 따로 둔다 — 실제 최근 사진
                    썸네일은 웹페이지가 갤러리를 미리 읽을 권한이 없어 못 그려주지만, 버튼을
                    누르면 네이티브 갤러리 선택창이 뜨는 건 동일하다. preventDefault로 위
                    label의 기본 동작(촬영용 input 열기)이 같이 발동하는 걸 막는다. */}
                <button
                  type="button"
                  aria-label="갤러리에서 식전 사진 선택"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    beforeGalleryInputRef.current?.click();
                  }}
                  className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow ring-1 ring-border"
                >
                  <Images className="h-4 w-4" />
                </button>
                <input
                  ref={beforeGalleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <label
                className="relative flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 p-5 text-center"
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
                <button
                  type="button"
                  aria-label="갤러리에서 식후 사진 선택"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    afterGalleryInputRef.current?.click();
                  }}
                  className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow ring-1 ring-border"
                >
                  <Images className="h-4 w-4" />
                </button>
                <input
                  ref={afterGalleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
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

        {/* medicationAdvice가 null이면(요청 실패 — 세션 없음 등) 아직 판단할 근거가 없으니
            아무것도 안 보여준다. 응답은 왔는데 medications가 빈 배열이면("복용 중인 약이
            있으세요?"에 아니오로 답했거나 아직 안 답함) — 가이드 문서 권장대로 카드를
            완전히 숨기지 않고 "등록하면 안내를 받을 수 있다"는 짧은 유도 문구를 준다.
            "식단 상세 보기"와 같은 얇은 진입 행 패턴을 재사용해서 홈 화면 길이는 그대로
            유지한다(2026-08-24 피드백, 모바일에서 카드가 길면 안 됨). 실제 내용(근거
            문장·상담 안내 등)은 전부 /user/medication에서만 보여준다. */}
        {medicationAdvice && medicationAdvice.medications.length > 0 ? (
          <Link
            href="/user/medication"
            className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3"
          >
            <span className="text-sm font-semibold text-foreground">복약 안내 보기</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ) : (
          medicationAdvice && (
            <Link
              href="/user/survey?section=care&step=medication&returnTo=/user/home"
              className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3"
            >
              <span className="text-sm font-semibold text-foreground">
                복용 중인 약을 등록하면 맞춤 복약 안내를 받을 수 있어요
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        )}
      </div>
    </div>
  );
}
