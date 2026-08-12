"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandHeader } from "@/components/app/brand-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirthDateSelect } from "@/components/app/birth-date-select";
import { UserRole, registerAccount } from "@/lib/auth";
import { registerGuardianBackend, registerUserBackend } from "@/lib/backend-auth";
import { speakOnDemand } from "@/lib/accessibility";
import { useSession } from "@/lib/session";
import { addWard, createSelfWard } from "@/lib/wards";
import { ttsCallConsentReadAloudText } from "@/components/invite/consent-view";

export default function SignupPage() {
  const router = useRouter();
  const { login } = useSession();
  const [role, setRole] = useState<UserRole>("user");
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"여" | "남">("여");
  const [address, setAddress] = useState("");
  const [planType, setPlanType] = useState("basic");
  const [ttsCallConsent, setTtsCallConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectRole(next: UserRole) {
    setRole(next);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
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
        : { birthDate, address, planType, selfWardId, ttsCallConsent }),
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
        planType,
      });
      if ("error" in backendResult) {
        toast.info("일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      }
    }

    setSubmitting(false);
    toast.success("회원가입이 완료됐어요.");
    // 개인 이용자(자가등록)는 보호자 초대 가입(consent-view.tsx -> /invite/survey)과 달리
    // 건강 프로필을 채우는 단계가 구조적으로 없어서, 로그인은 되는데 AI 반찬 추천이 항상
    // 404였다(health-profile 없음). 그래서 여기서도 초대 흐름과 동일하게 설문으로 보낸다 —
    // onboarding=1은 user/survey/page.tsx가 완료 후 어디로 보낼지(최초 온보딩이면 /user/home,
    // 나중에 마이 화면에서 재방문한 수정이면 /user/profile) 구분하는 데 쓴다.
    router.push(result.account.role === "guardian" ? "/guardian/wards/new" : "/user/survey?onboarding=1");
  }

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader onBack={() => router.push("/")} />
      <main className="flex flex-1 flex-col items-center px-5 py-10">
        <Card className="w-full max-w-[420px] border-none shadow-none">
          <CardHeader className="gap-2 text-center">
            <CardTitle className="text-xl">회원가입</CardTitle>
            <CardDescription>
              {role === "guardian"
                ? "가입 후 어르신에게 QR 초대코드를 보내드려요."
                : "내 정보를 입력해 GrandFood 서비스를 시작해요."}
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
              {role === "user" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signup-id">아이디</Label>
                  <Input id="signup-id" value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" placeholder="영문, 숫자, 하이픈 4~20자" required />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-name">이름</Label>
                <Input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-phone">전화번호</Label>
                <Input id="signup-phone" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="010-0000-0000" required />
              </div>
              {role === "guardian" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-email">이메일</Label>
                    <Input id="signup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required />
                    <p className="text-xs text-muted-foreground">
                      나중에 로그인할 때 이 이메일이 아이디가 돼요.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-relationship">대상자와의 관계</Label>
                    <Input id="signup-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="예: 딸, 아들, 며느리" required />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-birth-date-year">생년월일</Label>
                    <BirthDateSelect idPrefix="signup-birth-date" value={birthDate} onChange={setBirthDate} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>성별</Label>
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
                    <Label htmlFor="signup-address">주소</Label>
                    <Input id="signup-address" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-plan">이용 플랜</Label>
                    <select id="signup-plan" value={planType} onChange={(event) => setPlanType(event.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
                      <option value="basic">기본</option>
                      <option value="premium">프리미엄</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
                    <Checkbox checked={ttsCallConsent} onCheckedChange={setTtsCallConsent} />
                    <span className="text-sm text-foreground">
                      안부확인콜(전화로 안부를 여쭤보는 서비스)에 동의해요{" "}
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
                    안부확인콜이 뭔지 들려주기
                  </Button>
                </>
              )}
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
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <Button type="submit" size="lg" disabled={submitting} className="mt-1">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "가입하는 중..." : "회원가입"}
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
