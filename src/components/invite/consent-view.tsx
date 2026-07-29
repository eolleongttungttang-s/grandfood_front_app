"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { ACCOUNTS } from "@/lib/auth";
import { InviteFormState, submitInviteConsent, submitInviteDecline } from "@/lib/invite";
import { speakOnDemand } from "@/lib/accessibility";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TopBar } from "@/components/app/top-bar";

function readAloudText(guardianName: string) {
  return (
    `${guardianName}님이 어르신을 위해 신청했어요. ` +
    "수집 정보는 성함, 연락처, 배송지 주소이고, 이용 목적은 도시락 배송 및 식사기록 확인이에요. " +
    `${guardianName}님에게 공유되며, 서비스 탈퇴 시까지 보관돼요. ` +
    "개인정보 수집·이용 및 보호자와의 정보 공유에 동의하시겠어요?"
  );
}

export function ConsentView({
  guardianName,
  defaultValues,
}: {
  guardianName: string;
  defaultValues: InviteFormState;
}) {
  const router = useRouter();
  const { login } = useSession();
  const [form, setForm] = useState(defaultValues);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof InviteFormState>(key: K, value: InviteFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAccept() {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await submitInviteConsent(form);
      // 데모 목적: 실제 계정 생성 API가 없어, 이미 등록된 어르신 데모 계정으로 바로 로그인 처리한다.
      const elderAccount = ACCOUNTS.find((a) => a.role === "user");
      if (elderAccount) login(elderAccount.loginId, elderAccount.password);
      toast.success("환영해요! 서비스를 시작할게요.");
      router.push("/user/home");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitInviteDecline();
      router.push("/invite/declined");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="정보 확인·동의" subtitle="GrandFood" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-lg leading-relaxed text-foreground">
            <b className="text-accent">{guardianName}</b>님이 어르신을 위해 신청했어요
          </p>
          <p className="text-sm text-muted-foreground">
            도시락 배송 알림 서비스를 시작해도 될까요?
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">
            내 정보가 맞는지 확인해주세요
          </span>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consent-name">성함</Label>
            <Input
              id="consent-name"
              value={form.elderName}
              onChange={(e) => updateField("elderName", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consent-phone">연락처</Label>
            <Input
              id="consent-phone"
              value={form.elderPhone}
              onChange={(e) => updateField("elderPhone", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consent-address">받으실 주소</Label>
            <Input
              id="consent-address"
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consent-address-detail">상세주소 (동/호수 등)</Label>
            <Input
              id="consent-address-detail"
              placeholder="예: 101동 502호"
              value={form.addressDetail}
              onChange={(e) => updateField("addressDetail", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">
            어떤 정보를, 왜, 얼마나 쓰는지
          </span>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">수집 정보</span>
              <span className="text-right text-foreground">성함, 연락처, 배송지 주소</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">이용 목적</span>
              <span className="text-right text-foreground">도시락 배송 및 식사기록 확인</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">공유 대상</span>
              <span className="text-right text-foreground">{guardianName}님(보호자)</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">보관 기간</span>
              <span className="text-right text-foreground">서비스 탈퇴 시까지</span>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href="/invite/policy" />}
        >
          개인정보처리방침 전문 보기
        </Button>

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <Checkbox checked={agreed} onCheckedChange={setAgreed} />
          <span className="text-sm text-foreground">
            개인정보 수집·이용 및 보호자와의 정보 공유에 동의해요
          </span>
        </label>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => speakOnDemand(readAloudText(guardianName))}
        >
          <Volume2 />
          내용 들려주기
        </Button>

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            disabled={!agreed || submitting}
            onClick={handleAccept}
          >
            시작할게요
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={handleDecline}
          >
            원하지 않아요
          </Button>
        </div>
      </div>
    </div>
  );
}
