"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createWardInvite } from "@/lib/ward-invite";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TopBar } from "@/components/app/top-bar";

export function WardInviteView() {
  const router = useRouter();
  const { account } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0 && confirmed && !!account;

  async function handleSubmit() {
    if (!canSubmit || submitting || !account) return;
    setSubmitting(true);
    try {
      await createWardInvite({ name: name.trim(), phone: phone.trim() }, account.loginId);
      router.push("/guardian/wards/new/result");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="부모님 등록" subtitle="초대코드 발급" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">어르신 정보 입력</span>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">성함</Label>
            <Input
              id="invite-name"
              placeholder="예: 박순자"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-phone">전화번호</Label>
            <Input
              id="invite-phone"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          입력하신 정보는 초대 및 본인 확인을 위해 임시 저장되며, 대상자가 동의하지
          않을 경우 즉시 삭제돼요.
        </p>

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <Checkbox
            checked={confirmed}
            onCheckedChange={setConfirmed}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            본인은 위 대상자의 정보를 입력할 권한이 있으며, 정확한 정보를 제공했음을
            확인합니다
          </span>
        </label>

        <Button
          size="lg"
          className="w-full"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          초대코드 발급하기
        </Button>

      </div>
    </div>
  );
}
