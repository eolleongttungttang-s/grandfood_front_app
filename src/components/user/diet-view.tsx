"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera, Stethoscope } from "lucide-react";

import { Ward, WardDetail } from "@/lib/wards";
import { getRepresentativeDish } from "@/lib/dishes";
import { getCurrentMealSlot, mealLogStore, submitMealLogPhotos, wardMealLogs } from "@/lib/meal-log-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { SpeakableCard } from "@/components/app/speakable-card";
import { BanchanRecommendationSection } from "@/components/app/banchan-recommendation-section";
import { dislikesStore, toggleDislike, wardDislikes } from "@/lib/dislikes-store";
import { useLocalStore } from "@/lib/use-store";

// 선택한 File을 <img>로 미리보기할 수 있는 blob URL로 바꿔준다. URL 자체는 렌더 중에 useMemo로
// 바로 계산하고(state에 미러링하지 않음), effect는 오직 "파일이 바뀌거나 컴포넌트가 사라질 때
// 이전 object URL을 revoke하는" 정리 작업만 한다 — object URL은 브라우저 메모리에 남는 리소스라
// revoke를 안 하면 누수가 생긴다.
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

export function DietView({
  ward,
  detail,
}: {
  ward: Ward;
  detail: WardDetail;
}) {
  const dislikes = wardDislikes(useLocalStore(dislikesStore), ward.id);
  const representativeDish = getRepresentativeDish(detail.recommendedCombo);

  // 카드별 TTS(SpeakableCard)가 읽어줄 문장 — 화면에 보이는 값 그대로를 문장으로 풀어 쓴다.
  const recommendedComboSpeech =
    `오늘의 추천 반찬 조합이에요. 나트륨 ${detail.recommendedCombo.totalSodiumMg}mg, ` +
    `단백질 ${detail.recommendedCombo.totalProteinG}g, 열량 ${detail.recommendedCombo.totalKcal}kcal입니다.`;
  const menuCompositionSpeech = `오늘 메뉴 구성은, ${detail.recommendedCombo.items
    .map((item) => (dislikes.includes(item.dishId) ? `${item.name}, 기피 표시됨` : item.name))
    .join(", ")}입니다.`;
  const reasonsSpeech = detail.recommendedCombo.reasons.join(" ");
  const conditionsSpeech =
    `진단 질환은 ${detail.conditions.join(", ") || "없음"}입니다. ` +
    `알레르기는 ${detail.allergies[0] === "없음" ? "없음" : detail.allergies.join(", ")}입니다. ` +
    `복약은 ${detail.medications.map((m) => m.name).join(", ")}입니다.`;

  // 식사 체크인 · 잔반 분석 — 실제 카메라/파일로 찍은 사진을 진짜 fetch()로 백엔드에 올린다
  // (meal-log-store.ts 참고). 이 브라우저에서 보호자로 실제 로그인한 적이 없으면(backend-auth.ts)
  // 업로드가 막힌다 — 그땐 우선 보호자 계정으로 로그인해서 실제 토큰을 받아둬야 한다.
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const beforePreview = useObjectUrl(beforePhoto);
  const afterPreview = useObjectUrl(afterPhoto);
  const mealLogs = wardMealLogs(useLocalStore(mealLogStore), ward.id);
  const latestLog = mealLogs[mealLogs.length - 1];

  async function analyzeLeftovers() {
    if (!beforePhoto || !afterPhoto) return;
    setSubmitting(true);
    setUploadError(null);
    try {
      await submitMealLogPhotos({
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
    } catch (err) {
      // fetch() 자체가 실패하면(서버 연결 불가 등) 브라우저가 TypeError("Failed to fetch")를 던지는데,
      // 그 영어 메시지를 그대로 보여주는 대신 사용자에게 이해되는 한글 메시지로 바꾼다.
      // (응답은 왔지만 실패한 경우엔 meal-log-store.ts가 이미 한글 메시지로 throw하므로 그대로 보여줌.)
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

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="내 식단" subtitle="오늘의 배정 식단과 근거" />

      <div className="flex flex-col gap-4 px-5">
        <SpeakableCard
          id="diet-recommended-combo"
          text={recommendedComboSpeech}
          tone="sidebar"
          className="flex flex-col gap-2 rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm"
        >
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
        </SpeakableCard>

        <BanchanRecommendationSection
          wardId={ward.id}
          wardName={ward.name}
          wardAge={ward.age}
          wardAddress={ward.address}
        />

        <SpeakableCard
          id="diet-menu-composition"
          text={menuCompositionSpeech}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <span className="text-xs font-bold text-foreground">
            {representativeDish?.imageEmoji ?? "🍽️"} 오늘 메뉴 구성
          </span>
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
          {dislikes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              기피 표시한 반찬은 보호자와 담당 영양사에게 함께 보여요.
            </p>
          )}
        </SpeakableCard>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-base font-bold text-foreground">식사 체크인 · 잔반 분석</span>
          <p className="text-sm text-muted-foreground">
            식사 전/후 사진을 찍어 올리면 반찬별 잔반율을 분석해드려요.
          </p>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-center">
              {beforePreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob URL 미리보기라 next/image 최적화 대상이 아님
                <img src={beforePreview} alt="식전 사진 미리보기" className="h-16 w-16 rounded object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">식전 사진</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-center">
              {afterPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob URL 미리보기라 next/image 최적화 대상이 아님
                <img src={afterPreview} alt="식후 사진 미리보기" className="h-16 w-16 rounded object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">식후 사진</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <Button size="sm" disabled={!beforePhoto || !afterPhoto || submitting} onClick={analyzeLeftovers}>
            {submitting ? "분석 요청 중..." : "잔반 분석하기"}
          </Button>
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          {latestLog && (
            <div className="flex flex-col gap-1 pt-2">
              <span className="text-xs font-semibold text-muted-foreground">
                최근 분석 결과 · 전체 잔반율 {latestLog.leftoverRatePercent}%
              </span>
              {latestLog.compartments.map((c) => (
                <div key={c.dishId} className="flex justify-between text-sm">
                  <span className="text-foreground">{c.name}</span>
                  <span className="text-muted-foreground">{c.leftoverPercent}% 남음</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <SpeakableCard
          id="diet-reasons"
          text={reasonsSpeech}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
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
        </SpeakableCard>

        <SpeakableCard
          id="diet-conditions"
          text={conditionsSpeech}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
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
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              저작 · 연하 상태
            </span>
            <p className="text-sm text-foreground">{detail.chewingNote}</p>
          </div>
        </SpeakableCard>

        <Button
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href="/user/assistant" />}
        >
          <Stethoscope />
          AI 도우미와 채팅 상담하기
        </Button>
      </div>
    </div>
  );
}
