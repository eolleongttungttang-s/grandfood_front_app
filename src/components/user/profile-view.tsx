"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Phone, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Account } from "@/lib/auth";
import { Ward } from "@/lib/wards";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function ProfileView({ account, ward }: { account: Account; ward: Ward }) {
  const router = useRouter();
  const { logout } = useSession();
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const a11y = useLocalStore(accessibilityStore);

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
          <InfoRow label="나이" value={`${ward.age}세 · ${ward.gender}`} />
          <Separator />
          <InfoRow label="거주지" value={ward.address} />
          <Separator />
          <InfoRow label="소속 기관" value={ward.facility} />
          <Separator />
          <InfoRow label="담당자" value={ward.caseWorkerName} />
        </div>

        <Button
          variant="outline"
          className="w-full justify-center"
          onClick={() => toast.success(`${ward.caseWorkerName}님께 연락 요청을 보냈어요.`)}
        >
          <Phone />
          담당자에게 전화 연결 요청하기
        </Button>

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
              방문 · 검진 · 공지 알림을 받아요
            </span>
          </div>
          <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
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
