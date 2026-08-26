"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { linkWardToGuardian, registerAccount } from "@/lib/auth";
import { deriveElderBackendPassword } from "@/lib/backend-auth";
import { InviteFormState, submitInviteConsent, submitInviteDecline } from "@/lib/invite";
import { consumeWardInvite } from "@/lib/ward-invite";
import { addWard, createSelfWard } from "@/lib/wards";
import { speakOnDemand } from "@/lib/accessibility";
import { AddressSearchField } from "@/components/app/address-search-field";
import { PhoneInput } from "@/components/app/phone-input";
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
    "보호자가 알람으로 안부를 확인할 수 있는 안부확인알람 서비스예요. " +
    "동의하지 않으셔도 도시락 배송이나 식사 기록 같은 다른 서비스는 그대로 이용하실 수 있어요. " +
    "선택 사항이니 편하게 결정하시면 돼요. 안부확인알람에도 동의하시겠어요?"
  );
}

// 2026-08-21: 구체적 약물명(PR#74)까지 포함해 질환·알레르기·복약 정보를 다음 화면
// (invite/survey)에서 수집하는데, 위 readAloudText()/동의 체크박스는 성명·연락처·주소
// 얘기만 하고 이 부분을 전혀 언급하지 않았다. 개인정보보호법상 건강정보는 민감정보로
// 분류되어 일반 개인정보와 별도 동의가 필요해서, 안부확인콜처럼 독립된 체크박스로 뺐다 —
// 다만 안부확인콜과 달리 이건 필수다(지금 당장 복약이 없어도 몇 달/몇 년 뒤 생길 수 있는데
// 그때 다시 동의를 받으러 오는 게 더 번거롭다는 판단, 2026-08-21 논의).
export function healthInfoConsentReadAloudText() {
  return (
    "다음 화면에서 질환, 알레르기, 복약 여부와 복용 중인 구체적 약물명, 키·체중 같은 " +
    "건강정보를 여쭤볼 거예요. 이 정보는 AI가 몸에 맞는 반찬을 추천하고 위험한 음식을 " +
    "미리 알려드리는 데만 쓰이고, 등록된 보호자에게도 공유돼요. " +
    "법률상 민감정보라 이 서비스를 이용하시려면 반드시 동의가 필요해요. 동의하시겠어요?"
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
  const [healthInfoConsent, setHealthInfoConsent] = useState(false);
  const [ttsCallConsent, setTtsCallConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof InviteFormState>(key: K, value: InviteFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const generatedLoginId = form.elderName.trim();
  // invite/service.py의 register_elder_from_invite가 정확히 같은 공식(전화번호 뒷자리
  // 4자리)으로 백엔드 로그인 계정을 만든다 — 여기서 어긋나면 어르신이 안내받은 비밀번호로
  // 실제 로그인이 안 되므로 반드시 같은 함수를 공유해서 계산한다.
  const generatedPassword = deriveElderBackendPassword(form.elderPhone);

  async function handleAccept() {
    if (!agreed || !healthInfoConsent || submitting) return;
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

      // form.address는 AddressSearchField(juso.go.kr 도로명주소 검색)가 채우는데, 공동주택
      // 등은 동/호수(addrDetail)까지 이미 합쳐서 넣어준다(juso-address.ts의 formatJusoAddress) —
      // 그래서 별도 "상세주소" 입력칸을 두면 여기서 다시 이어붙이다 동/호수가 중복된다.
      const address = form.address.trim();

      // 실제 백엔드 User는 여기서 만들지 않는다 — 이 시점엔 아직 다음 화면(/invite/survey)의
      // 질환 설문 전이라 condition_flags가 항상 비어서 나갈 수밖에 없다. 대신 코드를
      // "accepted"로 소비만 해두고(consumeWardInvite), 실제 생성은 설문까지 끝낸 뒤
      // invite/survey/page.tsx가 POST /wards/invites/{code}/register로 한다 — 이 엔드포인트는
      // 코드 자체에 저장된 guardian_id만으로 만들어져서 보호자 로그인 세션이 필요 없다
      // (예전엔 hasBackendGuardianSession()으로 "이 기기에 보호자 세션이 있는지" 확인했는데,
      // 초대받은 기기엔 애초에 그게 없어서 다른 기기로 넘어오면 항상 여기서 막혔다).
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
      await consumeWardInvite(code, true);

      login(result.account.loginId, generatedPassword);
      toast.success("회원가입이 완료됐어요.");
      // code를 그대로 들고 넘어간다 — invite/survey/page.tsx가 설문 완료 시점에
      // POST /wards/invites/{code}/register로 실제 백엔드 User를 만드는 데 필요하다.
      router.push(`/invite/survey?code=${encodeURIComponent(code)}`);
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
      await consumeWardInvite(code, false);
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
            <PhoneInput
              id="consent-phone"
              value={form.elderPhone}
              onChange={(value) => updateField("elderPhone", value)}
            />
          </div>
          <AddressSearchField
            id="consent-address"
            label="받으실 주소"
            value={form.address}
            onChange={(value) => updateField("address", value)}
          />
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

        {/* 건강정보(질환·알레르기·복약, 구체적 약물명 포함)는 개인정보보호법상 민감정보라
            위 일반 개인정보 동의와 별도로 동의를 받는다 — 바로 다음 화면(invite/survey)에서
            실제로 이 정보를 수집한다. 필수 동의다(2026-08-21 논의: 지금 복약이 없어도
            나중에 생길 수 있는데, 그때 다시 동의받으러 오는 게 더 번거롭다는 판단). */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-xs font-bold text-foreground">건강정보는 이렇게 쓰여요</span>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">수집 정보</span>
              <span className="text-right text-foreground">
                질환·알레르기·복약 정보(복용 중인 구체적 약물명 포함), 키·체중 등 신체 정보
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">이용 목적</span>
              <span className="text-right text-foreground">AI 반찬 추천, 위험 식품 안내</span>
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
          <p className="text-xs text-muted-foreground">
            법률상 민감정보로 분류되어 별도 동의가 필요해요. 다음 화면에서 실제로 입력받아요.
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <Checkbox checked={healthInfoConsent} onCheckedChange={setHealthInfoConsent} />
          <span className="text-sm text-foreground">
            건강정보(질환·알레르기·복약, 구체적 약물명 포함) 수집·이용에 동의해요
          </span>
        </label>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => speakOnDemand(healthInfoConsentReadAloudText())}
        >
          <Volume2 />
          건강정보 동의가 뭔지 들려주기
        </Button>

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <Checkbox checked={ttsCallConsent} onCheckedChange={setTtsCallConsent} />
          <span className="text-sm text-foreground">
            안부확인알람(보호자가 알람으로 안부를 확인하는 서비스)에 동의해요{" "}
            <span className="text-muted-foreground">· 선택</span>
          </span>
        </label>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => speakOnDemand(ttsCallConsentReadAloudText())}
        >
          <Volume2 />
          안부확인알람이 뭔지 들려주기
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
            disabled={
              !agreed ||
              !healthInfoConsent ||
              submitting ||
              !birthDate ||
              !gender ||
              generatedPassword.length !== 4
            }
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
