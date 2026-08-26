"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddressSearchField } from "@/components/app/address-search-field";
import { BrandHeader } from "@/components/app/brand-header";
import { Button } from "@/components/ui/button";
import { ButtonSelectGroup } from "@/components/app/button-select-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirthDateSelect } from "@/components/app/birth-date-select";
import { ExpandToggle } from "@/components/app/expand-toggle";
import { PhoneInput } from "@/components/app/phone-input";
import { UserRole, registerAccount } from "@/lib/auth";
import { registerGuardianBackend, registerUserBackend } from "@/lib/backend-auth";
import { speakOnDemand } from "@/lib/accessibility";
import { useSession } from "@/lib/session";
import { addWard, createSelfWard } from "@/lib/wards";
import { healthInfoConsentReadAloudText, ttsCallConsentReadAloudText } from "@/components/invite/consent-view";

const RELATIONSHIP_OPTIONS = ["딸", "아들", "며느리", "사위", "배우자", "형제자매", "손자녀"] as const;
type RelationshipMode = (typeof RELATIONSHIP_OPTIONS)[number] | "기타" | "";

// 컴포넌트 바깥의 모듈 스코프 상수로 둔다 — SignupPage 안에 있으면 이름/전화번호 같은 다른
// 필드를 한 글자 고칠 때마다 리렌더될 때도 매번 새 배열을 만들어, ButtonSelectGroup에 매번
// 참조가 다른 options를 내려보내게 된다.
const RELATIONSHIP_SELECT_OPTIONS = [
  ...RELATIONSHIP_OPTIONS.map((option) => ({ value: option, label: option })),
  { value: "기타", label: "기타" },
] as const;
const GENDER_SELECT_OPTIONS = [
  { value: "여", label: "여성" },
  { value: "남", label: "남성" },
] as const;

export default function SignupPage() {
  const router = useRouter();
  const { login } = useSession();
  const [role, setRole] = useState<UserRole>("user");
  // 이용자 본인 가입 화면이 건강정보 동의 카드까지 더해지며 한 화면에 너무 많은 걸 물어봐
  // 스크롤이 길어졌다(2026-08-21 피드백) — 아이디/이름/연락처/생년월일(신원 확인용)까지만
  // 1단계로 먼저 받고, 나머지(성별/주소/동의/비밀번호)는 2단계로 넘긴다. 보호자 가입은
  // 원래도 짧아서(이메일/관계 정도만 추가) 단계를 안 나눈다.
  const [step, setStep] = useState<1 | 2>(1);
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // relationshipMode가 유일한 진실 소스다 — RELATIONSHIP_OPTIONS 중 하나, "기타", 또는
  // 아직 아무것도 안 고른 "" 셋 중 하나만 될 수 있다. 예전엔 relationship(string)과
  // customRelationship(boolean)을 따로 두고 클릭할 때마다 둘 다 손으로 맞춰야 해서, "기타"로
  // 직접 입력한 값이 프리셋 문구와 우연히 같아지면 어떤 버튼도 선택된 것처럼 안 보이는 등
  // 두 state가 어긋나는 경우가 있었다.
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode>("");
  const [customRelationshipText, setCustomRelationshipText] = useState("");
  const relationship = relationshipMode === "기타" ? customRelationshipText.trim() : relationshipMode;
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"여" | "남">("여");
  const [address, setAddress] = useState("");
  // 2026-08-21: 이 화면(이용자 본인 직접가입)엔 지금까지 개인정보 동의 자체가 아예 없었다
  // — 안부확인콜(선택) 하나뿐이었는데, 가입 직후 /user/survey?first=1에서 질환·알레르기·
  // 복약(구체적 약물명 포함, PR#74) 정보를 그대로 수집한다. 보호자 초대 경로
  // (consent-view.tsx)는 이미 일반 개인정보 동의가 있었지만 여기는 없었던 갭 — 그거랑
  // 같은 패턴으로 일반 동의 + 건강정보(민감정보) 동의를 각각 필수로 추가한다. 건강정보
  // 동의는 안부확인콜과 달리 선택이 아니다(지금 복약이 없어도 나중에 생길 수 있는데,
  // 그때 다시 동의받는 게 더 번거롭다는 판단).
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [healthInfoConsent, setHealthInfoConsent] = useState(false);
  // 두 동의 카드의 수집정보/목적/보관기간 표는 글이 길어서(2026-08-21 피드백) 기본은 접어두고
  // "자세히 보기"로 펼쳐야 보이게 한다 — 동의 체크박스 자체(무엇에 동의하는지 한 문장 요약)는
  // 항상 보이니, 필수 고지 내용에 접근은 여전히 이 화면 안에서 한 번의 탭으로 가능하다.
  const [privacyDetailsExpanded, setPrivacyDetailsExpanded] = useState(false);
  const [healthDetailsExpanded, setHealthDetailsExpanded] = useState(false);
  const [ttsCallConsent, setTtsCallConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectRole(next: UserRole) {
    setRole(next);
    setError(null);
    setStep(1);
  }

  // "기타"를 이미 고른 상태에서 "기타"를 또 눌러도(재확인 탭) 입력 중이던 텍스트는
  // 지우면 안 되지만(예전 버그), 프리셋으로 갔다가 다시 "기타"로 돌아오면 예전에 입력하다
  // 만 텍스트가 아무 안내 없이 그대로 되살아나는 것도 문제라 — "기타"를 벗어날 때만
  // customRelationshipText를 비운다.
  function handleRelationshipModeChange(next: RelationshipMode) {
    setRelationshipMode(next);
    if (next !== "기타") {
      setCustomRelationshipText("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // 1단계 화면의 제출 버튼은 실제 가입이 아니라 2단계로 넘어가는 것 — 브라우저가 폼 안에서
    // Enter를 눌러도(암묵적 submit) 같은 onSubmit이 불리므로, 버튼 onClick을 따로 안 만들고
    // 여기서 단계만 보고 분기한다. 1단계 입력값(아이디/이름/전화번호/생년월일)은 이미
    // HTML required로 비어있으면 여기까지 못 오므로 따로 검증하지 않는다.
    if (role === "user" && step === 1) {
      setStep(2);
      return;
    }

    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }

    if (role === "guardian" && !relationship) {
      // src/lib/auth.ts registerAccount()의 동일 조건 가드와 문구를 맞춘다 — relationship은
      // 위에서 이미 trim된 값이라 여기서 다시 trim할 필요가 없다.
      setError("대상자와의 관계를 입력해 주세요.");
      return;
    }

    if (role === "user" && (!privacyConsent || !healthInfoConsent)) {
      setError("개인정보 및 건강정보 수집·이용에 동의해 주세요.");
      return;
    }

    setSubmitting(true);

    // 이용자 본인이 (보호자 초대 없이) 직접 가입하는 경우, 자신을 돌봄 대상자(Ward)로도
    // 함께 등록해야 한다 — 안 그러면 /user/home이 selfWardId를 못 찾아 식단/섭취기록 없이
    // "가입이 완료되었어요" 안내만 계속 보여주는 막다른 화면에 갇힌다. 보호자가 있는
    // consent-view.tsx의 초대 가입 흐름과 동일하게 Ward를 만들되, 담당 매장은 실제로
    // 고를 사람(보호자)이 없으니 첫 번째 파트너 매장으로 기본 지정한다.
    //
    // 알려진 한계: 이렇게 만든 Ward는 어떤 보호자의 wardIds에도 속하지 않는다(coGuardians
    // 없음). meal-log-store.ts의 submitMealLogPhotos()는 wardId로 "이 대상자를 관리하는
    // 보호자"를 찾아 그 보호자의 백엔드 로그인 토큰으로 사진을 업로드하는 구조라(보호자
    // 없이는 업로드 API를 호출할 방법이 없음), 이 경로로 가입한 이용자는 홈 화면은 정상
    // 이지만 식사 사진(잔반 분석) 업로드는 항상 실패한다. 의도적으로 아직 손대지 않음 —
    // 고치려면 보호자 계정과 연결하는 방법(가입 시 지정 등)을 먼저 설계해야 한다.
    let selfWardId: string | undefined;
    if (role === "user") {
      const newWard = createSelfWard({ id: crypto.randomUUID(), name, birthDate, gender, address });
      addWard(newWard);
      selfWardId = newWard.id;
    }

    const result = registerAccount({
      loginId: role === "guardian" ? email : loginId,
      password,
      role,
      name,
      phone,
      ...(role === "guardian"
        ? { email, relationship }
        : { birthDate, address, selfWardId, ttsCallConsent }),
      // planType은 여기서 안 받는다 — /user/subscription에서 실제로 구독을 시작해야만
      // 백엔드에 진짜 Subscription이 생기고, 가입 시 고른 값은 그때까지 아무 의미가 없어
      // 오히려 "이미 구독 중"이라는 착각을 준다(lib/subscription.ts 주석 참고). registerAccount는
      // planType 없이 부르면 알아서 "basic"으로 기본 처리한다.
    });

    if ("error" in result) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    login(result.account.loginId, password);

    // 보호자/이용자 둘 다 실제 백엔드에도 같이 가입시켜서, 로그인 토큰을 받아둔다 — 이게
    // 있어야 나중에 어르신 사진 업로드(잔반 분석)나 알림 조회 같은 기능을 실제로 호출할 수
    // 있다. 백엔드 가입이 실패해도(서버 일시 장애 등) 로컬 가입 자체는 막지 않는다 — 앱은
    // 계속 쓸 수 있어야 하고, 해당 기능만 나중에 다시 로그인하면 활성화된다.
    if (role === "guardian") {
      const backendResult = await registerGuardianBackend({ name, phone, email, password, relationship });
      if ("error" in backendResult) {
        toast.info("사진 업로드 같은 일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      }
    } else {
      const backendResult = await registerUserBackend({
        loginId: result.account.loginId,
        password,
        name,
        birthDate,
        phone,
        address,
        // registerUserBackend가 요구하는 필드라 값을 채우긴 하지만, 이게 실제 구독을
        // 만들지는 않는다 — /user/subscription에서 플랜을 실제로 고를 때 syncSubscriptionToBackend가
        // 진짜 Subscription을 만든다(lib/subscription.ts 주석 참고).
        planType: "basic",
      });
      if ("error" in backendResult) {
        toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      }
    }

    setSubmitting(false);
    toast.success("회원가입이 완료됐어요.");
    // 이용자 본인 직접가입도 QR 초대 경로(consent-view.tsx → /invite/survey)와 마찬가지로
    // 첫 화면부터 생활 정보를 물어보게 한다 — 예전엔 곧장 /user/home으로 가서 생활 정보를
    // 입력할 계기가 아예 없었다.
    router.push(
      result.account.role === "guardian" ? "/guardian/wards/new" : "/user/survey?first=1"
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader onBack={() => router.push("/")} />
      <main className="flex flex-1 flex-col items-center px-5 py-10">
        <Card className="w-full max-w-[420px] border-none shadow-none">
          <CardHeader className="gap-2 text-center">
            <CardTitle className="text-xl">회원가입</CardTitle>
            <CardDescription className="font-semibold text-foreground">
              {role === "guardian"
                ? "가입 후 어르신에게 QR 초대코드를 보내드려요."
                : step === 1
                  ? "먼저 기본 정보만 입력해 주세요 (1/2)"
                  : "이제 나머지 정보를 입력해 주세요 (2/2)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => selectRole("user")}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                  role === "user" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                이용자 본인
              </button>
              <button
                type="button"
                onClick={() => selectRole("guardian")}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                  role === "guardian" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                가족 보호자
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {role === "user" && step === 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signup-id">아이디</Label>
                  {/* src/lib/auth.ts registerAccount()의 실제 검증 정규식(/^[a-zA-Z0-9가-힣-]{2,30}$/)
                      과 문구를 맞춘다 — 예전 문구("영문, 숫자, 하이픈 4~20자")는 한글이 실제로
                      허용되는데도 빠져 있었고 길이도 2~30자인데 4~20자로 틀려 있었다
                      (2026-08-21 피드백, "아이디에 한글도 되던데"). */}
                  <Input id="signup-id" value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" placeholder="한글, 영어, 숫자, 하이픈 2~30자" required />
                </div>
              )}
              {/* 이름/전화번호는 보호자는 항상, 이용자 본인은 1단계에서만 보여준다 —
                  2단계(성별/주소/동의/비밀번호)엔 다시 안 물어본다. */}
              {!(role === "user" && step === 2) && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-name">이름</Label>
                    <Input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-phone">전화번호</Label>
                    <PhoneInput id="signup-phone" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" placeholder="010-0000-0000" required />
                  </div>
                </>
              )}
              {role === "guardian" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-email">이메일</Label>
                    <Input id="signup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required />
                    <p className="text-xs text-muted-foreground">
                      나중에 로그인할 때 이 이메일이 아이디가 돼요.
                    </p>
                  </div>
                  <ButtonSelectGroup
                    label="대상자와의 관계"
                    columns={3}
                    options={RELATIONSHIP_SELECT_OPTIONS}
                    value={relationshipMode}
                    onChange={handleRelationshipModeChange}
                  />
                  {relationshipMode === "기타" ? (
                    <div className="flex flex-col gap-1.5">
                      {/* 위 버튼 그룹에 이미 "대상자와의 관계" 라벨이 있으니, 여기는 시각적으로
                          숨기고 스크린리더에만 이 입력창이 뭔지 알려준다. */}
                      <Label htmlFor="signup-relationship" className="sr-only">
                        관계 직접 입력
                      </Label>
                      {/* required는 "기타"를 골라 이 입력창이 떠 있을 때만 의미가 있다 —
                          프리셋 버튼 경로는 이 Input 자체가 렌더링되지 않으니 required로
                          커버되지 않는다. 실제 필수값 검증은 handleSubmit의 relationship
                          체크가 두 경로 모두에 대해 담당한다. */}
                      <Input
                        id="signup-relationship"
                        value={customRelationshipText}
                        onChange={(event) => setCustomRelationshipText(event.target.value)}
                        placeholder="관계를 입력해주세요"
                        autoFocus
                        required
                      />
                    </div>
                  ) : null}
                </>
              ) : step === 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signup-birth-date-year">생년월일</Label>
                  <BirthDateSelect idPrefix="signup-birth-date" value={birthDate} onChange={setBirthDate} />
                </div>
              ) : (
                <>
                  <ButtonSelectGroup
                    label="성별"
                    options={GENDER_SELECT_OPTIONS}
                    value={gender}
                    onChange={setGender}
                  />
                  <AddressSearchField id="signup-address" label="주소" value={address} onChange={setAddress} required />
                  {/* 이용 플랜 select는 여기 없다 — 가입 시점엔 아직 무슨 플랜이 실제로 뭘
                      포함하는지(배달 횟수, 리포트 주기 등) 제대로 안내받지 못한 채 고르게 돼서,
                      실제로 구독을 만드는 것도 아닌데(위 handleSubmit 주석 참고) "이미 골랐다"는
                      착각만 준다. 가입 완료 후 /user/subscription에서 플랜별 상세 안내를 보고
                      제대로 고르게 한다. */}
                  {/* 수집정보/목적/보관기간 표는 접어둔다(2026-08-21 피드백 — 글이 너무
                      길다). 법적으로 문제되지 않는다 — 개인정보보호법이 요구하는 건 "동의 전
                      확인할 수 있게 고지"이지 "기본으로 펼쳐서 보여주기"가 아니라, 같은 화면
                      안에서 탭 한 번으로 바로 보이면 충분하다(실제로 토스·카카오 등 국내
                      서비스도 이 항목을 접어두는 방식을 흔히 씀). 별도 화면/전문은 여전히
                      "개인정보처리방침 전문 보기" 링크로 항상 열려있다. */}
                  <ExpandToggle
                    expanded={privacyDetailsExpanded}
                    onToggle={() => setPrivacyDetailsExpanded((v) => !v)}
                    label="어떤 정보를, 왜, 얼마나 쓰는지"
                  />
                  {privacyDetailsExpanded && (
                    <div className="flex flex-col gap-2 text-sm rounded-2xl border border-border bg-card p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-muted-foreground">수집 정보</span>
                        <span className="text-right text-foreground">성함, 생년월일, 전화번호, 주소</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-muted-foreground">이용 목적</span>
                        <span className="text-right text-foreground">도시락 배송 및 식사기록 확인</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-muted-foreground">보관 기간</span>
                        <span className="text-right text-foreground">서비스 탈퇴 시까지</span>
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    nativeButton={false}
                    render={<Link href="/invite/policy" />}
                  >
                    개인정보처리방침 전문 보기
                  </Button>
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
                    <Checkbox checked={privacyConsent} onCheckedChange={setPrivacyConsent} />
                    <span className="text-sm text-foreground">개인정보 수집·이용에 동의해요</span>
                  </label>

                  {/* 건강정보(질환·알레르기·복약, 구체적 약물명 포함)는 개인정보보호법상
                      민감정보라 위 일반 개인정보 동의와 별도로 받는다 — 가입 직후
                      /user/survey?first=1에서 실제로 이 정보를 수집한다. 필수 동의다
                      (2026-08-21 논의 — 지금 복약이 없어도 나중에 생길 수 있는데, 그때
                      다시 동의받으러 오는 게 더 번거롭다는 판단). */}
                  <ExpandToggle
                    expanded={healthDetailsExpanded}
                    onToggle={() => setHealthDetailsExpanded((v) => !v)}
                    label="건강정보는 이렇게 쓰여요"
                  />
                  {healthDetailsExpanded && (
                    <div className="flex flex-col gap-2 text-sm rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                        <span className="shrink-0 text-muted-foreground">보관 기간</span>
                        <span className="text-right text-foreground">서비스 탈퇴 시까지</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        법률상 민감정보로 분류되어 별도 동의가 필요해요. 가입 직후 화면에서 실제로
                        입력받아요.
                      </p>
                    </div>
                  )}
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
                    <Checkbox checked={healthInfoConsent} onCheckedChange={setHealthInfoConsent} />
                    <span className="text-sm text-foreground">
                      건강정보(질환·알레르기·복약, 구체적 약물명 포함) 수집·이용에 동의해요
                    </span>
                  </label>
                  <Button
                    type="button"
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
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => speakOnDemand(ttsCallConsentReadAloudText())}
                  >
                    <Volume2 />
                    안부확인알람이 뭔지 들려주기
                  </Button>
                </>
              )}
              {!(role === "user" && step === 1) && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-password">비밀번호</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder={role === "guardian" ? "8자 이상" : "4자 이상"}
                      minLength={role === "guardian" ? 8 : 4}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-password-confirm">비밀번호 확인</Label>
                    <Input id="signup-password-confirm" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" required />
                  </div>
                </>
              )}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              {role === "user" && step === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                >
                  이전
                </Button>
              )}
              <Button type="submit" size="lg" disabled={submitting} className="mt-1">
                {submitting && <Loader2 className="animate-spin" />}
                {role === "user" && step === 1
                  ? "다음"
                  : submitting
                    ? "가입하는 중..."
                    : "회원가입"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              이미 계정이 있으신가요? <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">로그인</Link>
            </p>

          </CardContent>
        </Card>
      </main>
    </div>
  );
}
