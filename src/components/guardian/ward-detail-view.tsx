"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronLeft,
  FileText,
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
import { WardMealDashboard } from "@/lib/ward-meal-dashboard";
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
  const mealHistory = mealDashboard?.status === "ready" ? mealDashboard.mealHistory : null;
  const completeCount = mealHistory?.filter((m) => m === "완식").length ?? 0;
  const smallCount = mealHistory?.filter((m) => m === "소량").length ?? 0;
  const noResponseCount = mealHistory?.filter((m) => m === "미응답").length ?? 0;
  const dislikedIds = wardDislikes(useLocalStore(dislikesStore), ward.id);
  const dislikedItems = detail.recommendedCombo.items.filter((i) => dislikedIds.includes(i.dishId));
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  const representativeDish = getRepresentativeDish(detail.recommendedCombo);
  useLocalStore(careProfileStore);
  const careProfile = getCareProfile(ward.id);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");

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

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
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

      <div className="flex flex-col gap-4 px-5">
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
            <Button
              size="sm"
              onClick={() => toast.success(`${ward.name}님 안부 확인을 요청했어요.`)}
            >
              <MessageCircle />
              안부 확인 요청
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
              {representativeDish?.imageEmoji ?? "🍽️"} 오늘의 식사
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
            {detail.recommendedCombo.items.map((item) => (
              <Badge
                key={item.dishId}
                variant={dislikedIds.includes(item.dishId) ? "default" : "secondary"}
                className={dislikedIds.includes(item.dishId) ? "bg-destructive/10 text-destructive" : ""}
              >
                {item.name}
                {dislikedIds.includes(item.dishId) ? " · 기피" : ""}
              </Badge>
            ))}
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

        <div className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm">
          <span className="text-xs font-bold tracking-wide text-sidebar-primary">
            AI 반찬 매칭
          </span>
          <span className="text-xl font-extrabold">오늘의 추천 반찬 조합</span>
          <div className="flex gap-4 pt-1 text-xs">
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">나트륨</span>
              <span className="font-semibold">{detail.recommendedCombo.totalSodiumMg}mg</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">단백질</span>
              <span className="font-semibold">{detail.recommendedCombo.totalProteinG}g</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sidebar-foreground/60">열량</span>
              <span className="font-semibold">{detail.recommendedCombo.totalKcal}kcal</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">왜 이 조합인가요</span>
          {detail.recommendedCombo.reasons.map((reason, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-foreground"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                {i + 1}
              </span>
              {reason}
            </div>
          ))}
        </div>

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
              <div key={m.name} className="flex justify-between text-sm">
                <span className="text-foreground">{m.name}</span>
                <span className="text-muted-foreground">{m.schedule}</span>
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

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-foreground">최근 14일 섭취 기록</h2>
            {mealHistory && (
              <span className="text-xs text-muted-foreground">
                완식 <span className="font-semibold text-foreground">{completeCount}</span> ·
                소량{" "}
                <span className="font-semibold text-risk-caution-foreground">
                  {smallCount}
                </span>{" "}
                · 미응답{" "}
                <span className="font-semibold text-risk-high-foreground">
                  {noResponseCount}
                </span>
              </span>
            )}
          </div>
          {mealDashboard === null ? (
            <p className="text-sm text-muted-foreground">불러오는 중이에요...</p>
          ) : mealDashboard.status === "not-linked" ? (
            <p className="text-sm text-muted-foreground">
              아직 실제 백엔드에 연동된 식사 기록이 없어요.
            </p>
          ) : mealDashboard.status === "error" ? (
            <p className="text-sm text-destructive">{mealDashboard.message}</p>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {mealHistory!.map((tone, i) => (
                <div
                  key={i}
                  className={`h-8 rounded-sm ${MEAL_TONE_CLASS[tone]}`}
                  title={tone}
                />
              ))}
            </div>
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
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="pb-1 text-sm font-bold text-foreground">배송 일정 · 이력</h2>
          {wardDeliveries(useLocalStore(deliveryStore), ward.id).map((d) => (
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
      </div>
    </div>
  );
}
