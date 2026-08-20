"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ClipboardEdit,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutGrid,
  MessageCircle,
  PhoneCall,
  Send,
  Stethoscope,
  Truck,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Ward, WardDetail, WardStatus } from "@/lib/wards";
import { HISTORY_DAYS, WardMealDashboard, recentKstDateKeys } from "@/lib/ward-meal-dashboard";
import { dietHistoryForDate } from "@/lib/meal-dashboard";
import { ACTIVITY_LEVEL_LABEL } from "@/lib/health-profile";
import { getPartnerStore } from "@/lib/partner-stores";
import { getRepresentativeDish } from "@/lib/dishes";
import {
  CARE_SURVEY_STEP,
  careProfileStore,
  getCareProfile,
  isCareProfileStepAnswered,
  LIVING_ARRANGEMENT_LABEL,
  MOBILITY_LABEL,
} from "@/lib/care-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { dislikesStore, wardDislikes } from "@/lib/dislikes-store";
import { requestDietChange } from "@/lib/diet-requests-store";
import { BanchanRecommendationSection } from "@/components/app/banchan-recommendation-section";
import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { ExpandToggle } from "@/components/app/expand-toggle";
import { MealToneSummary } from "@/components/app/meal-tone-summary";
import { DietDayDetail } from "@/components/app/diet-day-detail";
import { useMonthlyBanchanRecommendation } from "@/lib/use-monthly-banchan-recommendation";
import { resolveTodayMenu, TODAY_MENU_GENERATING_MESSAGE } from "@/lib/today-menu";
import {
  addDaysToDateString,
  computeAchievementPct,
  computeNutritionSnapshotForDate,
  todayDateString,
} from "@/lib/banchan-recommendation";
import { formatMonthDayLabel, weekdayLabel } from "@/lib/date-format";
import { requestWellnessCall } from "@/lib/wellness-calls";
import { deliveryStore, wardDeliveries } from "@/lib/delivery";
import {
  addMessage,
  chatStore,
  familyThreadId,
  threadMessages,
} from "@/lib/chat-store";
import { useLocalStore } from "@/lib/use-store";

const STATUS_BADGE_CLASS: Record<WardStatus, string> = {
  "확인 필요": "bg-risk-high text-risk-high-foreground",
  관찰중: "bg-risk-caution text-risk-caution-foreground",
  양호: "bg-risk-normal text-risk-normal-foreground",
};

const MEAL_TONE_CLASS: Record<string, string> = {
  완식: "bg-foreground",
  소량: "bg-risk-caution-foreground",
  미응답: "bg-risk-high-foreground",
};

// 대상자 상세 화면 하단 탭 — 11개 카드가 한 화면에 쌓여 스크롤이 너무 길다는 피드백
// (2026-08-19)으로 개요/건강/기록 3개로 나눴다. guardian/layout.tsx가 이 라우트
// (/guardian/wards/detail)에서만 전역 하단 탭(홈/마이)을 숨기고, 그 자리에 이 3개짜리
// 탭을 같은 BottomTabBar 컴포넌트로 대신 그린다 — 전역 탭은 라우트 이동(href)이고 이건
// 한 페이지 안에서 카드 그룹만 바꾸는 것(onClick)이라 종류는 다르지만, 마크업/스타일은
// BottomTabBar가 둘 다 받도록 되어 있어 그대로 재사용한다(코드 리뷰 지적 — 예전엔 여기서
// nav 마크업을 직접 복제해서, BottomTabBar를 고치면 이쪽은 안 따라오는 문제가 있었다).
const DETAIL_TABS = [
  { id: "overview", label: "개요", icon: LayoutGrid },
  { id: "health", label: "건강", icon: HeartPulse },
  { id: "records", label: "기록", icon: ClipboardList },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{children}</span>
    </div>
  );
}

export function WardDetailView({
  ward,
  detail,
  guardianName,
  mealDashboard,
}: {
  ward: Ward;
  detail: WardDetail;
  guardianName: string;
  /** null = 아직 실제 백엔드 조회 응답 전(로딩 중). "오늘 잔반율"/"최근 14일 섭취 기록" 두 카드만
   *  이 값으로 채운다 — 나머지(추천 반찬/건강 프로필 등)는 여전히 detail의 목업값을 쓴다. */
  mealDashboard: WardMealDashboard | null;
}) {
  // "오늘"을 포함한 14일 전체의 원탭 자가 보고 반영은 ward-meal-dashboard.ts의
  // fetchWardMealDashboard가 diet-history 응답의 quick_check_status로 이미 처리해서
  // mealHistory에 담아 넘겨준다 — 실제 백엔드 기록이라 여기서 로컬 스토어를 따로 볼 필요가
  // 없다(2026-08-14, grandfood_backend 9f01c26).
  const mealHistory = mealDashboard?.status === "ready" ? mealDashboard.mealHistory : null;
  const completeCount = mealHistory?.filter((m) => m === "완식").length ?? 0;
  const smallCount = mealHistory?.filter((m) => m === "소량").length ?? 0;
  const noResponseCount = mealHistory?.filter((m) => m === "미응답").length ?? 0;
  // 그리드 칸을 탭하면 그날 상세(끼니별 반찬·잔반율)를 보여준다(2026-08-19, records-view.tsx와
  // 동일) — 예전엔 이 원본(dishes/mealType 포함)을 fetchGuardianDietHistory로 같은
  // /app/guardian/{id}/diet-history를 한 번 더 불러서 얻었는데(코드 리뷰 지적: 요청이 두
  // 번 나갔다), ward-meal-dashboard.ts가 이미 같은 응답을 mealDashboard.rawItems로 같이
  // 파싱해서 주므로 그걸 그대로 쓴다.
  const rawDietHistory = mealDashboard?.status === "ready" ? mealDashboard.rawItems : null;
  // recentKstDateKeys(HISTORY_DAYS)를 렌더마다 새로 부르면 "지금"(KST) 기준으로 매번
  // 다시 계산되는데, mealHistory/rawDietHistory는 mealDashboard prop이 새로 올 때만
  // 바뀐다(마운트 시 한 번 fetch, 폴링 없음) — 자정을 넘겨 화면을 켜둔 채로 있으면 날짜
  // 배열만 하루 밀려서 mealHistory[i]/rawDietHistory가 가리키는 실제 날짜와 어긋난다
  // (코드 리뷰 지적: 그리드 칸 색상·라벨이 서로 다른 날을 가리키게 됨). mealDashboard와
  // 같은 시점에만 재계산되도록 묶어서, 데이터가 갱신될 때만 날짜 배열도 같이 갱신되게 한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mealDashboard는 계산에 쓰이는 값이 아니라, mealHistory와 같은 시점에만 재계산되도록 하는 동기화 키로 일부러 넣음
  const recordDateKeys = useMemo(() => recentKstDateKeys(HISTORY_DAYS), [mealDashboard]);
  const [selectedRecordDate, setSelectedRecordDate] = useState<string | null>(
    () => recordDateKeys[recordDateKeys.length - 1] ?? null
  );
  // recordDateKeys는 렌더마다 "오늘"(KST) 기준으로 새로 계산되지만 selectedRecordDate는
  // sticky한 state라, 자정을 넘겨 화면을 켜둔 채 리렌더가 한 번이라도 일어나면 예전에
  // 고른 날짜가 새 14일 창 밖으로 밀려날 수 있다(코드 리뷰 지적, records-view.tsx와 동일
  // 문제) — 그럴 땐 상세가 조용히 안 보이는 대신 다시 "오늘"(맨 끝 칸)을 고른 것으로
  // 취급한다.
  const effectiveSelectedRecordDate =
    selectedRecordDate && recordDateKeys.includes(selectedRecordDate)
      ? selectedRecordDate
      : (recordDateKeys[recordDateKeys.length - 1] ?? null);
  const selectedRecordEntries =
    effectiveSelectedRecordDate && rawDietHistory
      ? dietHistoryForDate(rawDietHistory, effectiveSelectedRecordDate)
      : [];
  const selectedRecordTone =
    effectiveSelectedRecordDate && mealHistory
      ? mealHistory[recordDateKeys.indexOf(effectiveSelectedRecordDate)]
      : undefined;
  const dislikedIds = wardDislikes(useLocalStore(dislikesStore), ward.id);
  // "기록" 탭 안 JSX에서만 쓰이지만, Hook은 조건부 렌더 안에서 부르면 안 되므로(Rules of
  // Hooks) 다른 탭을 볼 때도 항상 여기서 구독한다.
  const deliveries = wardDeliveries(useLocalStore(deliveryStore), ward.id);
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  const representativeDish = getRepresentativeDish(detail.recommendedCombo);
  useLocalStore(careProfileStore);
  const careProfile = getCareProfile(ward.id);
  const banchanIdentity = {
    wardId: ward.id,
    wardName: ward.name,
    wardAge: ward.age,
    wardAddress: ward.address,
  };
  const banchanRecommendation = useMonthlyBanchanRecommendation(banchanIdentity);
  // "오늘의 식사"/"왜 이 조합인가요" 카드가 바로 아래 AI 반찬 추천 달력과 서로 다른 답을
  // 보여주던 문제(home-view.tsx/diet-view.tsx와 동일, 2026-08-13 피드백)를 여기도 고친다 —
  // 오늘 실제 추천이 있으면 그걸 쓰고, 없으면 기존 목업으로 폴백한다.
  const todayMenu = resolveTodayMenu(detail.recommendedCombo, banchanRecommendation.monthly);
  const dislikedItems = todayMenu.items.filter((i) => dislikedIds.includes(i.id));
  // isGenerating일 때도 목업 이모지를 그대로 두면 "생성 중" 문구 옆에 무관한 목업 반찬
  // 이모지가 남는다 — diet-view.tsx/home-view.tsx와 동일하게 그때도 기본 이모지를 쓴다.
  const menuEmoji =
    todayMenu.isReal || todayMenu.isGenerating ? "🍽️" : (representativeDish?.imageEmoji ?? "🍽️");

  // "최근 7일 달성률" — 보호자 전용(2026-08-19 결정, 어르신 본인 화면은 그대로 둠). 이미
  // 위에서 조회한 banchanRecommendation.monthly를 그대로 재사용해서 최근 7일 각각의 "실제/
  // 목표" 평균 달성률을 구한다. "최근 14일 섭취 기록" 카드와 겹박스가 되지 않도록 같은 카드
  // 안에 이어붙인다(records-view.tsx는 두 카드로 나뉘어 있지만, 여긴 보호자가 한 화면에서
  // 완식 여부와 영양 달성률을 같이 훑어보게 하나로 합친다).
  const NUTRITION_TREND_DAYS = 7;
  // useMemo로 banchanRecommendation.monthly에만 묶어뒀었는데, 그 안에서 부르는
  // todayDateString()은 "지금"(wall clock) 기준이라 monthly가 안 바뀌는 한(주간 생성
  // 폴링이 끝난 뒤엔 안 바뀜) 자정이 지나도 다시 계산되지 않았다(코드 리뷰 지적: 그래프
  // 날짜 범위와 "오늘" 표시가 어제 기준에 멈춰 있었음). computeNutritionSnapshotForDate는
  // 이미 메모리에 있는 monthly.weeks를 훑는 순수 조회라 매 렌더마다 다시 계산해도 비용이
  // 거의 없다 — 메모이제이션을 빼서 항상 실제 "오늘"을 반영하게 한다.
  const today = todayDateString();
  const nutritionTrend: { date: string; pct: number | null }[] = [];
  for (let i = NUTRITION_TREND_DAYS - 1; i >= 0; i--) {
    const date = addDaysToDateString(today, -i);
    nutritionTrend.push({ date, pct: computeAchievementPct(computeNutritionSnapshotForDate(banchanRecommendation.monthly, date)) });
  }
  const hasNutritionTrend = nutritionTrend.some((d) => d.pct != null);

  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  // diet-view.tsx의 같은 카드와 동일하게 기본은 접어둔다(2026-08-14 방침 — 필요한 사람만 더 눌러보게).
  const [reasonsExpanded, setReasonsExpanded] = useState(false);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [requestingWellnessCall, setRequestingWellnessCall] = useState(false);

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const threadId = familyThreadId(ward.id);
  const messages = threadMessages(useLocalStore(chatStore), threadId);

  function submitDietRequest() {
    const note =
      requestNote.trim() ||
      (dislikedItems.length > 0
        ? `${dislikedItems.map((i) => i.name).join(", ")} 대신 다른 반찬으로 바꿔주세요.`
        : "다음 식단 조정을 요청해요.");
    requestDietChange(ward.id, guardianName, note);
    toast.success("영양사에게 식단 변경을 요청했어요.");
    setRequestNote("");
    setRequestOpen(false);
  }

  function sendMessage() {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    addMessage(threadId, guardianName, trimmed);
    setMessageText("");
    toast.success(`${ward.name}님께 메시지를 보냈어요.`);
  }

  async function requestWellnessCheck() {
    setRequestingWellnessCall(true);
    try {
      await requestWellnessCall({
        mockWardId: ward.id,
        name: ward.name,
        age: ward.age,
        address: ward.address,
      });
      toast.success(`${ward.name}님 안부 확인을 요청했어요.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "안부 확인 요청에 실패했어요.");
    } finally {
      setRequestingWellnessCall(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between bg-sidebar px-5 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <GrandFoodMark className="h-6 w-6 shrink-0 rounded-md" />
          <Link
            href="/guardian/home"
            className="flex items-center gap-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            대상자 목록
          </Link>
        </div>
        <Badge className={STATUS_BADGE_CLASS[ward.status]}>{ward.status}</Badge>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-4 pt-4">
      {activeTab === "overview" && (
        <>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-extrabold text-muted-foreground">
              {ward.name.slice(0, 1)}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-extrabold text-foreground">
                {ward.name}{" "}
                <span className="text-sm font-medium text-muted-foreground">
                  ({ward.relationToGuardian})
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {ward.age}세 · {ward.gender} · {ward.address}
              </span>
              <span className="text-xs text-muted-foreground">
                {partnerStore?.name ?? "담당 반찬가게"}
              </span>
            </div>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            {ward.lastMeal.label}
          </p>
          {ward.coGuardians.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              함께 보고 있는 가족: {ward.coGuardians.join(", ")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.success(`${partnerStore?.name ?? "담당 반찬가게"}에 전화 연결을 요청했어요.`)}
            >
              <PhoneCall />
              매장 연결
            </Button>
            <Button size="sm" onClick={requestWellnessCheck} disabled={requestingWellnessCall}>
              <MessageCircle />
              {requestingWellnessCall ? "요청하는 중..." : "안부 확인 요청"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.success(`${ward.name}님과 영상통화를 연결하고 있어요...`)}
            >
              <Video />
              영상통화
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMessageOpen((v) => !v)}>
              <Send />
              메시지 보내기
            </Button>
          </div>

          {messageOpen && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              {messages.slice(-3).map((m) => (
                <div key={m.id} className="text-xs">
                  <span className="font-semibold text-foreground">{m.from}</span>{" "}
                  <span className="text-muted-foreground">{m.text}</span>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                  placeholder={`${ward.name}님께 보낼 메시지`}
                  className="bg-card"
                />
                <Button size="sm" onClick={sendMessage}>
                  전송
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-foreground">
              {menuEmoji} 오늘의 식사
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              배송 {detail.deliveryEta}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm text-foreground">오늘 잔반율</span>
            {mealDashboard === null ? (
              <span className="text-sm text-muted-foreground">불러오는 중...</span>
            ) : mealDashboard.status === "not-linked" ? (
              <span className="text-sm text-muted-foreground">연동된 기록 없음</span>
            ) : mealDashboard.status === "error" ? (
              <span className="text-sm text-destructive">불러오기 실패</span>
            ) : mealDashboard.leftoverPercent === null ? (
              <span className="text-sm text-muted-foreground">분석 준비 중</span>
            ) : (
              (() => {
                // 표시값(반올림)과 경고색 기준을 반드시 같은 수치로 맞춘다 — 반올림 전
                // 원본값으로 비교하면(예: 49.6) 화면엔 "50%"로 보이는데 색은 정상(49.6<50)
                // 처리되는 불일치가 생긴다.
                const rounded = Math.round(mealDashboard.leftoverPercent);
                return (
                  <span
                    className={`text-sm font-bold ${
                      rounded >= 50 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {rounded}%
                  </span>
                );
              })()
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {todayMenu.isGenerating ? (
              <span className="text-sm text-muted-foreground">{TODAY_MENU_GENERATING_MESSAGE}</span>
            ) : todayMenu.items.length === 0 ? (
              <span className="text-sm text-muted-foreground">이 날은 배정된 반찬이 없어요.</span>
            ) : (
              todayMenu.items.map((item) => (
                <Badge
                  key={item.id}
                  variant={dislikedIds.includes(item.id) ? "default" : "secondary"}
                  className={dislikedIds.includes(item.id) ? "bg-destructive/10 text-destructive" : ""}
                >
                  {item.name}
                  {dislikedIds.includes(item.id) ? " · 기피" : ""}
                </Badge>
              ))
            )}
          </div>

          {dislikedItems.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {ward.name}님이 &ldquo;{dislikedItems.map((i) => i.name).join(", ")}&rdquo;를 기피 표시했어요.
            </p>
          )}

          {!requestOpen ? (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setRequestOpen(true)}>
              다음 식단 변경 요청
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="영양사에게 전달할 요청 내용을 적어주세요"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={submitDietRequest}>
                  요청 보내기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setRequestOpen(false)}
                >
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>

        <BanchanRecommendationSection identity={banchanIdentity} state={banchanRecommendation} subscribeHref="/guardian/subscription" />

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">왜 이 조합인가요</span>
          <ExpandToggle
            expanded={reasonsExpanded}
            onToggle={() => setReasonsExpanded((v) => !v)}
          />
          {reasonsExpanded &&
            (todayMenu.isGenerating ? (
              <p className="text-sm text-muted-foreground">{TODAY_MENU_GENERATING_MESSAGE}</p>
            ) : todayMenu.reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 근거가 없어요.</p>
            ) : (
              todayMenu.reasons.map((reason, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-foreground"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {i + 1}
                  </span>
                  {reason}
                </div>
              ))
            ))}
        </div>
        </>
      )}

      {activeTab === "health" && (
        <>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">질환 · 알레르기 · 복약</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">진단 질환</span>
            <div className="flex flex-wrap gap-1.5">
              {detail.conditions.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">알레르기 · 금기</span>
            <div className="flex flex-wrap gap-1.5">
              {detail.allergies[0] === "없음" ? (
                <span className="text-sm text-muted-foreground">없음</span>
              ) : (
                detail.allergies.map((a) => (
                  <Badge key={a} className="bg-risk-high text-risk-high-foreground">
                    {a}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">복약</span>
            {detail.medications.map((m) => (
              <div key={m.name} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{m.name}</span>
                  <span className="text-muted-foreground">{m.schedule}</span>
                </div>
                {m.products.length > 0 && (
                  <span className="text-xs text-muted-foreground">{m.products.join(", ")}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-foreground">생활 정보</span>
            {careProfile && !careProfile.completed && (
              <Badge className="bg-risk-caution text-risk-caution-foreground">설문 미완료</Badge>
            )}
          </div>
          {careProfile ? (
            <>
              <DetailRow label="하루 식사 횟수">
                {isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.mealsPerDay)
                  ? `${careProfile.mealsPerDay}회`
                  : "미입력"}
              </DetailRow>
              <DetailRow label="동거 형태">
                {isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.livingArrangement)
                  ? LIVING_ARRANGEMENT_LABEL[careProfile.livingArrangement]
                  : "미입력"}
              </DetailRow>
              <DetailRow label="거동 상태">
                {isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.mobility)
                  ? MOBILITY_LABEL[careProfile.mobilityLevel]
                  : "미입력"}
              </DetailRow>
              <DetailRow label="저작·삼킴">
                {isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.chewingDifficulty)
                  ? careProfile.chewingDifficulty
                    ? "불편함"
                    : "괜찮음"
                  : "미입력"}
              </DetailRow>
              <DetailRow label="비상연락처">
                {careProfile.emergencyContactPhone
                  ? `${careProfile.emergencyContactName}(${careProfile.emergencyContactRelation}) ${careProfile.emergencyContactPhone}`
                  : "미입력"}
              </DetailRow>
              {careProfile.dislikedIngredients.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    못 먹거나 싫어하는 재료
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {careProfile.dislikedIngredients.map((name) => (
                      <Badge key={name} variant="secondary">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {ward.name}님이 아직 생활 정보를 입력하지 않으셨어요.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between pb-1">
            <h2 className="text-sm font-bold text-foreground">건강 프로필</h2>
            <span className="text-xs text-muted-foreground">
              {detail.healthProfile.source === "mydata_linked" ? "마이데이터 연동" : "자가 입력"}
            </span>
          </div>
          <DetailRow label="혈압 위쪽 숫자 (수축기)">
            {detail.healthProfile.systolicBP != null
              ? `${detail.healthProfile.systolicBP} mmHg`
              : "미입력"}
          </DetailRow>
          <DetailRow label="혈압 아래쪽 숫자 (이완기)">
            {detail.healthProfile.diastolicBP != null
              ? `${detail.healthProfile.diastolicBP} mmHg`
              : "미입력"}
          </DetailRow>
          <DetailRow label="공복혈당">
            {detail.healthProfile.fastingGlucose != null
              ? `${detail.healthProfile.fastingGlucose} mg/dL`
              : "미입력"}
          </DetailRow>
          <DetailRow label="키">
            {detail.healthProfile.heightCm != null ? `${detail.healthProfile.heightCm} cm` : "미입력"}
          </DetailRow>
          <DetailRow label="체중">
            {detail.healthProfile.weightKg != null ? `${detail.healthProfile.weightKg} kg` : "미입력"}
          </DetailRow>
          <DetailRow label="활동 수준">
            {detail.healthProfile.activityLevel
              ? ACTIVITY_LEVEL_LABEL[detail.healthProfile.activityLevel]
              : "미입력"}
          </DetailRow>
          <Button
            variant="outline"
            className="mt-3 w-full justify-center"
            nativeButton={false}
            render={<Link href={`/guardian/wards/detail/survey?id=${ward.id}`} />}
          >
            <ClipboardEdit />
            건강 프로필 수정하기
          </Button>
        </div>
        </>
      )}

      {activeTab === "records" && (
        <>
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {/* 완식 여부(최근 14일)와 영양 목표 달성률(최근 7일)을 보호자가 한 화면에서 같이
              훑어보게 하나의 카드로 합쳤다(2026-08-19 결정, 어르신 본인 화면(records-view.tsx)
              은 두 카드로 분리된 채 그대로 둠 — 어르신 화면은 단순함을 우선한다). */}
          {hasNutritionTrend && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-foreground">최근 {NUTRITION_TREND_DAYS}일 달성률</h2>
              <div className="flex items-end gap-1.5">
                {nutritionTrend.map(({ date, pct }) => {
                  const isToday = date === todayDateString();
                  return (
                    <div key={date} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-foreground">
                        {pct != null ? `${pct}%` : "－"}
                      </span>
                      <div className="flex h-14 w-full items-end justify-center rounded bg-muted">
                        {pct != null && (
                          <div
                            className={`w-3/5 rounded-t ${isToday ? "bg-primary" : "bg-primary/60"}`}
                            style={{ height: `${Math.max(pct, 6)}%` }}
                          />
                        )}
                      </div>
                      <span className={`text-[11px] ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                        {isToday ? "오늘" : weekdayLabel(date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`flex flex-col gap-3 ${hasNutritionTrend ? "border-t border-border pt-4" : ""}`}>
            <h2 className="text-sm font-bold text-foreground">최근 14일 섭취 기록</h2>
            {mealHistory && (
              <MealToneSummary
                completeCount={completeCount}
                smallCount={smallCount}
                noResponseCount={noResponseCount}
              />
            )}
            {mealDashboard === null ? (
              <p className="text-sm text-muted-foreground">불러오는 중이에요...</p>
            ) : mealDashboard.status === "not-linked" ? (
              <p className="text-sm text-muted-foreground">
                아직 실제 백엔드에 연동된 식사 기록이 없어요.
              </p>
            ) : mealDashboard.status === "error" ? (
              <p className="text-sm text-destructive">{mealDashboard.message}</p>
            ) : (
              <>
                {/* 칸이 title 툴팁(마우스 오버)만으로 하루 상태를 알려줘서 터치 기기에선
                    사실상 정보가 안 보였다 — 칸을 탭하면 그날 상세(끼니별 반찬·잔반율)를
                    아래에 펼쳐 보여주도록 바꿨다(2026-08-19, records-view.tsx와 동일). */}
                <div className="grid grid-cols-7 gap-1.5">
                  {mealHistory!.map((tone, i) => {
                    const date = recordDateKeys[i];
                    const isSelected = date === effectiveSelectedRecordDate;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={`${formatMonthDayLabel(date)} ${tone}`}
                        onClick={() => setSelectedRecordDate(date)}
                        className={`h-8 rounded-sm ${MEAL_TONE_CLASS[tone]} ${
                          isSelected ? "ring-2 ring-inset ring-foreground" : ""
                        }`}
                      />
                    );
                  })}
                </div>

                {effectiveSelectedRecordDate && selectedRecordTone && (
                  <DietDayDetail
                    date={effectiveSelectedRecordDate}
                    tone={selectedRecordTone}
                    toneDotClass={MEAL_TONE_CLASS[selectedRecordTone]}
                    entries={rawDietHistory === null ? null : selectedRecordEntries}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="pb-1 text-sm font-bold text-foreground">배송 일정 · 이력</h2>
          {deliveries.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{d.scheduledDate}</span>
              <span className="text-foreground">{d.scheduledTime}</span>
              <Badge variant={d.status === "예정" ? "outline" : "secondary"}>{d.status}</Badge>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="h-auto flex-col gap-1.5 py-3"
            nativeButton={false}
            render={<Link href={`/guardian/wards/detail/report?id=${ward.id}`} />}
          >
            <FileText className="h-5 w-5 text-accent" />
            <span className="text-sm">월간 건강 리포트</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1.5 py-3"
            nativeButton={false}
            render={<Link href={`/guardian/wards/detail/nutritionist?id=${ward.id}`} />}
          >
            <Stethoscope className="h-5 w-5 text-accent" />
            <span className="text-sm">영양사 상담 이력</span>
          </Button>
        </div>
        </>
      )}
      </div>

      <BottomTabBar
        items={DETAIL_TABS.map((tab) => ({
          label: tab.label,
          icon: tab.icon,
          active: activeTab === tab.id,
          onClick: () => {
            setActiveTab(tab.id);
            // 실제로는 main(guardian/layout.tsx)이 아니라 window/document가 스크롤
            // 컨테이너다 — main은 flex-1 + overflow-y-auto지만 상위 AccessibilityFrame이
            // min-h-screen(고정 height가 아니라 최소값)이라 절대 clip되지 않고 콘텐츠
            // 크기만큼 그대로 자라기 때문(코드 리뷰 지적으로 재확인, main.scrollTop을
            // 직접 바꿔봐도 반응 없음을 확인함). 탭을 누르면 맨 위로 되돌려서 새 탭
            // 내용(더 짧을 수 있음)을 바로 보여준다.
            window.scrollTo({ top: 0, behavior: "instant" });
          },
        }))}
      />
    </div>
  );
}
