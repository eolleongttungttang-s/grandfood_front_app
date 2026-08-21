"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, ClipboardEdit, LogOut, Phone, Volume2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Account, updateAccountTtsCallConsent } from "@/lib/auth";
import { BackendUserProfile, fetchBackendWardProfile, updateBackendWardTtsConsent } from "@/lib/backend-auth";
import { calculateAge, Ward, WardDetail } from "@/lib/wards";
import { getPartnerStore } from "@/lib/partner-stores";
import { ACTIVITY_LEVEL_LABEL } from "@/lib/health-profile";
import {
  CARE_SURVEY_STEP,
  careProfileStore,
  getCareProfile,
  isCareProfileStepAnswered,
  LIVING_ARRANGEMENT_LABEL,
} from "@/lib/care-profile";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/app/top-bar";
import { useSession } from "@/lib/session";
import { accessibilityStore, speak, updateAccessibility } from "@/lib/accessibility";
import { useLocalStore } from "@/lib/use-store";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function ProfileView({
  account,
  ward,
  detail,
}: {
  account: Account;
  ward: Ward;
  detail: WardDetail;
}) {
  const router = useRouter();
  const { logout } = useSession();
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [ttsCallConsent, setTtsCallConsent] = useState(account.ttsCallConsent ?? false);
  const [backendProfile, setBackendProfile] = useState<BackendUserProfile | null>(null);
  const a11y = useLocalStore(accessibilityStore);
  const partnerStore = getPartnerStore(ward.partnerStoreId);
  useLocalStore(careProfileStore);
  const careProfile = getCareProfile(ward.id);
  // "건강 프로필 다시 입력하기" 버튼 문구 — 생활 정보 쪽(careProfile 존재 여부)과 같은
  // 패턴이다. 건강 프로필은 completed 같은 별도 추적이 없어서(값 전부가 선택 항목이라
  // care-survey-view.tsx도 이 카드 진입 시 answeredHealth 여부를 존재 유무로만 판단한다),
  // 여기도 6개 필드 중 하나라도 값이 있으면 "이미 입력한 적 있음"으로 본다.
  const hasHealthProfileData =
    detail.healthProfile.systolicBP != null ||
    detail.healthProfile.diastolicBP != null ||
    detail.healthProfile.fastingGlucose != null ||
    detail.healthProfile.heightCm != null ||
    detail.healthProfile.weightKg != null ||
    detail.healthProfile.activityLevel != null;

  // 서버에 실제로 조회할 수 있는 프로필이 있으면(보호자가 관리하는 대상자를 이 브라우저에서
  // 보호자로도 로그인해본 적 있는 경우 — backend-auth.ts의 fetchBackendWardProfile 주석
  // 참고) 나이/거주지/안부확인콜 동의를 로컬 mock 대신 그 값으로 덮어써서 보여준다. 실패하면
  // (자가등록 본인 등) 조용히 기존 로컬 값을 그대로 쓴다.
  useEffect(() => {
    let cancelled = false;
    fetchBackendWardProfile({ mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address }).then(
      (result) => {
        if (cancelled || !result) return;
        setBackendProfile(result);
        setTtsCallConsent(result.ttsCallConsent);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ward.id, ward.name, ward.age, ward.address]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="마이" subtitle="내 정보와 앱 설정" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-muted text-base font-bold text-muted-foreground">
              {account.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-foreground">
              {account.name}
            </span>
            <span className="text-xs text-muted-foreground">{account.org}</span>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="pb-1 text-xs font-bold text-foreground">기본 정보</span>
          <InfoRow
            label="나이"
            value={`${backendProfile ? calculateAge(backendProfile.birthDate) : ward.age}세 · ${ward.gender}`}
          />
          <Separator />
          <InfoRow label="거주지" value={backendProfile?.address ?? ward.address} />
          <Separator />
          <InfoRow label="담당 반찬가게" value={partnerStore?.name ?? "-"} />
          <Separator />
          <InfoRow label="매장 연락처" value={partnerStore?.supportPhone ?? "-"} />
          <Button
            variant="outline"
            className="mt-3 w-full justify-center"
            nativeButton={false}
            render={<Link href="/user/profile/edit" />}
          >
            <ClipboardEdit />
            기본 정보 수정하기
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-foreground">생활 정보</span>
            {careProfile && !careProfile.completed && (
              <Badge className="bg-risk-caution text-risk-caution-foreground">입력 중단됨</Badge>
            )}
          </div>
          {careProfile ? (
            <div className="flex flex-col gap-0.5">
              <InfoRow
                label="하루 식사 횟수"
                value={
                  isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.mealsPerDay)
                    ? `${careProfile.mealsPerDay}회`
                    : "미입력"
                }
              />
              <Separator />
              <InfoRow
                label="동거 형태"
                value={
                  isCareProfileStepAnswered(careProfile, CARE_SURVEY_STEP.livingArrangement)
                    ? LIVING_ARRANGEMENT_LABEL[careProfile.livingArrangement]
                    : "미입력"
                }
              />
              <Separator />
              <InfoRow
                label="비상연락처"
                value={
                  careProfile.emergencyContactPhone
                    ? `${careProfile.emergencyContactName}(${careProfile.emergencyContactRelation}) ${careProfile.emergencyContactPhone}`
                    : "미입력"
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 생활 정보를 입력하지 않으셨어요.
            </p>
          )}
          <Button
            variant="outline"
            className="w-full justify-center"
            nativeButton={false}
            render={<Link href="/user/survey?section=care" />}
          >
            <ClipboardEdit />
            {careProfile ? "생활 정보 다시 입력하기" : "생활 정보 입력하기"}
          </Button>
        </div>

        {/* care-survey-view.tsx의 같은 설문이 생활 정보와 이 건강 프로필을 문항으로 이어
            받는다 — 입력 화면(여기, 마이페이지)과 결과 확인 화면이 갈라져 있으면 헷갈린다고
            판단해 예전엔 섭취기록 탭에 있던 이 카드를 여기로 옮겼다(2026-08-13 피드백).
            다만 위 "생활 정보" 버튼만 있고 이 카드엔 수정 버튼이 없어 건강 프로필만 따로
            고칠 방법이 없었다(2026-08-21 피드백) — section="health"로 이 카드만 다루는
            흐름을 따로 두고, 아래에 그 진입 버튼을 추가한다. */}
        <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-baseline justify-between pb-1">
            <span className="text-xs font-bold text-foreground">건강 프로필</span>
            <span className="text-xs text-muted-foreground">
              {detail.healthProfile.source === "mydata_linked" ? "마이데이터 연동" : "자가 입력"}
            </span>
          </div>
          <InfoRow
            label="혈압 위쪽 숫자 (수축기)"
            value={
              detail.healthProfile.systolicBP != null
                ? `${detail.healthProfile.systolicBP} mmHg`
                : "미입력"
            }
          />
          <Separator />
          <InfoRow
            label="혈압 아래쪽 숫자 (이완기)"
            value={
              detail.healthProfile.diastolicBP != null
                ? `${detail.healthProfile.diastolicBP} mmHg`
                : "미입력"
            }
          />
          <Separator />
          <InfoRow
            label="공복혈당"
            value={
              detail.healthProfile.fastingGlucose != null
                ? `${detail.healthProfile.fastingGlucose} mg/dL`
                : "미입력"
            }
          />
          <Separator />
          <InfoRow
            label="키"
            value={detail.healthProfile.heightCm != null ? `${detail.healthProfile.heightCm} cm` : "미입력"}
          />
          <Separator />
          <InfoRow
            label="체중"
            value={detail.healthProfile.weightKg != null ? `${detail.healthProfile.weightKg} kg` : "미입력"}
          />
          <Separator />
          <InfoRow
            label="활동 수준"
            value={
              detail.healthProfile.activityLevel
                ? ACTIVITY_LEVEL_LABEL[detail.healthProfile.activityLevel]
                : "미입력"
            }
          />
          <Button
            variant="outline"
            className="mt-3 w-full justify-center"
            nativeButton={false}
            render={<Link href="/user/survey?section=health" />}
          >
            <ClipboardEdit />
            {hasHealthProfileData ? "건강 프로필 다시 입력하기" : "건강 프로필 입력하기"}
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full justify-center"
          onClick={() => toast.success(`${partnerStore?.name ?? "담당 반찬가게"}에 연락 요청을 보냈어요.`)}
        >
          <Phone />
          매장에 전화 연결 요청하기
        </Button>

        <Link
          href="/user/subscription"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Wallet className="h-4 w-4 text-accent" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">구독 관리</span>
              <span className="text-xs text-muted-foreground">플랜과 결제수단 확인하기</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">화면 · 음성 설정</span>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">큰 글씨 모드</span>
              <span className="text-xs text-muted-foreground">글씨를 더 크게 보여드려요</span>
            </div>
            <Switch
              checked={a11y.largeText}
              onCheckedChange={(checked) => updateAccessibility({ largeText: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">고대비 모드</span>
              <span className="text-xs text-muted-foreground">
                글자와 배경 대비를 또렷하게 해요
              </span>
            </div>
            <Switch
              checked={a11y.highContrast}
              onCheckedChange={(checked) => updateAccessibility({ highContrast: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">음성 안내</span>
              <span className="text-xs text-muted-foreground">
                주요 안내를 소리로도 읽어드려요
              </span>
            </div>
            <Switch
              checked={a11y.voiceGuidance}
              onCheckedChange={(checked) => {
                updateAccessibility({ voiceGuidance: checked });
                if (checked) {
                  setTimeout(() => speak("음성 안내를 켰어요."), 100);
                }
              }}
            />
          </div>
          {a11y.voiceGuidance && (
            <Button
              variant="outline"
              className="w-fit"
              onClick={() =>
                speak(`${ward.name}님의 오늘 식사 상태는 ${ward.lastMeal.label} 입니다.`)
              }
            >
              <Volume2 />
              오늘 상태 읽어주기
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">알림 받기</span>
            <span className="text-xs text-muted-foreground">
              배송 · 레시피 추천 · 공지 알림을 받아요
            </span>
          </div>
          <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">안부확인콜</span>
            <span className="text-xs text-muted-foreground">
              정해진 시각에 전화로 안부를 여쭤봐요 · 선택
            </span>
          </div>
          <Switch
            checked={ttsCallConsent}
            onCheckedChange={(checked) => {
              setTtsCallConsent(checked);
              updateAccountTtsCallConsent(account.loginId, checked);
              updateBackendWardTtsConsent(
                { mockWardId: ward.id, name: ward.name, age: ward.age, address: ward.address },
                checked
              );
            }}
          />
        </div>

        <Button
          variant="ghost"
          className="w-full justify-center text-destructive hover:text-destructive"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
    </div>
  );
}
