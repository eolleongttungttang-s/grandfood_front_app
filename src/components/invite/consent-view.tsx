"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { linkWardToGuardian, registerAccount } from "@/lib/auth";
import { InviteFormState, submitInviteConsent, submitInviteDecline } from "@/lib/invite";
import { consumeWardInvite } from "@/lib/ward-invite";
import { addWard, createSelfWard } from "@/lib/wards";
import { hasBackendGuardianSession } from "@/lib/backend-auth";
import { speakOnDemand } from "@/lib/accessibility";
import { useSession } from "@/lib/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TopBar } from "@/components/app/top-bar";
import { BirthDateSelect } from "@/components/app/birth-date-select";

function readAloudText(guardianName: string) {
  return (
    `${guardianName}님이 어르신을 위해 신청했어요. ` +
    "수집 정보는 성함, 연락처, 배송지 주소이고, 이용 목적은 도시락 배송 및 식사기록 확인이에요. " +
    `${guardianName}님에게 공유되며, 서비스 탈퇴 시까지 보관돼요. ` +
    "개인정보 수집·이용 및 보호자와의 정보 공유에 동의하시겠어요?"
  );
}

export function ttsCallConsentReadAloudText() {
  return (
    "정해진 시각에 전화로 안부를 여쭤보는 안부확인콜 서비스예요. " +
    "동의하지 않으셔도 도시락 배송이나 식사 기록 같은 다른 서비스는 그대로 이용하실 수 있어요. " +
    "선택 사항이니 편하게 결정하시면 돼요. 안부확인콜에도 동의하시겠어요?"
  );
}

export function ConsentView({
  guardianName,
  guardianLoginId,
  code,
  defaultValues,
}: {
  guardianName: string;
  guardianLoginId: string;
  code: string;
  defaultValues: InviteFormState;
}) {
  const router = useRouter();
  const { login } = useSession();
  const [form, setForm] = useState(defaultValues);
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"여" | "남" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [ttsCallConsent, setTtsCallConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof InviteFormState>(key: K, value: InviteFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const generatedLoginId = form.elderName.trim();
  const generatedPassword = form.elderPhone.replace(/\D/g, "").slice(-4);

  async function handleAccept() {
    if (!agreed || submitting) return;
    setError(null);
    if (generatedPassword.length !== 4) {
      setError("연락처를 정확히 입력해 주세요.");
      return;
    }
    if (!gender) {
      setError("성별을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await submitInviteConsent(form);

      const address = `${form.address} ${form.addressDetail}`.trim();

      // 예전엔 여기서 바로 POST /users(createBackendWard)를 호출해 진짜 백엔드 ward를 만들었다.
      // 문제는 이 시점엔 아직 다음 화면(/invite/survey)의 질환 설문 전이라 condition_flags가
      // 항상 비어서 나갈 수밖에 없고, 백엔드엔 나중에 조건을 업데이트하는 API가 없어서 한번
      // 이렇게 만들어지면 그 어르신은 영영 RAG 개인화 대상에서 빠진다. 그래서 실제 백엔드 유저
      // 생성은 여기서 안 하고, ensureBackendWardId()(rag-chat.ts/meal-log-store.ts가 이미 쓰고
      // 있음)가 처음 필요해질 때(설문을 끝낸 뒤 첫 RAG 질문/사진 업로드) 딱 한 번만 만들도록
      // 미룬다 — 그때는 설문이 끝나있어서 조건이 같이 실린다. "보호자 연동이 안 되어 있으면
      // 여기서 바로 막는다"는 원래 목적은, 실제로 유저를 만들지 않고 세션 존재 여부만 로컬에서
      // 확인하는 것으로 그대로 유지한다.
      if (!hasBackendGuardianSession(guardianLoginId)) {
        setError("보호자가 아직 실제 계정 연동을 완료하지 않았어요. 보호자에게 문의해 주세요.");
        return;
      }

      const newWard = createSelfWard({ id: crypto.randomUUID(), name: form.elderName, birthDate, gender, address });
      addWard(newWard);

      const result = registerAccount({
        loginId: generatedLoginId,
        password: generatedPassword,
        role: "user",
        name: form.elderName,
        phone: form.elderPhone,
        birthDate,
        address,
        planType: "basic",
        selfWardId: newWard.id,
        ttsCallConsent,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }

      // 새 대상자를 초대한 보호자의 wardIds에도 반영해야, 그 보호자의 홈/마이 화면에
      // 이번에 등록된 대상자가 보인다 — registerAccount()는 새 이용자 계정만 만들 뿐
      // 초대한 보호자 쪽 계정은 건드리지 않는다.
      linkWardToGuardian(guardianLoginId, newWard.id);

      // 가입이 완전히 끝난 뒤에 지운다 — 같은 링크로 다시 들어와도 더는 유효한 초대를
      // 못 찾게 해서, 재방문 시 같은 어르신 앞으로 로컬 계정/ward가 중복 생성되는 걸 막는다.
      consumeWardInvite(code);

      login(result.account.loginId, generatedPassword);
      toast.success("회원가입이 완료됐어요.");
      router.push("/invite/survey");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitInviteDecline();
      // "입력됐던 정보를 지금 바로 삭제했어요"라고 안내하는 화면(declined-view.tsx)이
      // 실제로 그 말대로 동작하려면, 폼 초안뿐 아니라 이 초대 자체도 없애야 한다 —
      // 안 그러면 같은 링크로 다시 들어와서 여전히 가입할 수 있는 상태가 남는다.
      consumeWardInvite(code);
      router.push(`/invite/declined?guardianName=${encodeURIComponent(guardianName)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="가입 정보 확인" subtitle="GrandFood" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-lg leading-relaxed text-foreground">
            <b className="text-accent">{guardianName}</b>님이 가입을 도와드리고 있어요
          </p>
          <p className="text-sm text-muted-foreground">
            정보를 확인하고 서비스를 시작해볼까요?
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
          <span className="text-xs font-bold text-foreground">로그인 정보 만들기</span>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">아이디</span>
            <span className="text-base font-semibold text-foreground">{generatedLoginId}</span>
            <p className="text-xs text-muted-foreground">
              아이디는 본인 성함으로 저장돼요.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consent-birth-date-year">생년월일</Label>
            <BirthDateSelect idPrefix="consent-birth-date" value={birthDate} onChange={setBirthDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">성별</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={gender === "여" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setGender("여")}
              >
                여성
              </Button>
              <Button
                type="button"
                variant={gender === "남" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setGender("남")}
              >
                남성
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">비밀번호</span>
            <span className="text-base font-semibold text-foreground">{generatedPassword}</span>
            <p className="text-xs text-muted-foreground">
              비밀번호는 본인 연락처 뒷자리로 설정돼요.
            </p>
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

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <Checkbox checked={ttsCallConsent} onCheckedChange={setTtsCallConsent} />
          <span className="text-sm text-foreground">
            안부확인콜(전화로 안부를 여쭤보는 서비스)에 동의해요{" "}
            <span className="text-muted-foreground">· 선택</span>
          </span>
        </label>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => speakOnDemand(ttsCallConsentReadAloudText())}
        >
          <Volume2 />
          안부확인콜이 뭔지 들려주기
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            disabled={!agreed || submitting || !birthDate || !gender || generatedPassword.length !== 4}
            onClick={handleAccept}
          >
            동의하고 가입하기
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
