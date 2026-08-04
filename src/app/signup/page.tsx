"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandHeader } from "@/components/app/brand-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserRole, registerAccount } from "@/lib/auth";
import { registerGuardianBackend } from "@/lib/backend-auth";
import { useSession } from "@/lib/session";

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
  const [address, setAddress] = useState("");
  const [planType, setPlanType] = useState("basic");
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
    const result = registerAccount({
      loginId: role === "guardian" ? email : loginId,
      password,
      role,
      name,
      phone,
      ...(role === "guardian" ? { email, relationship } : { birthDate, address, planType }),
    });

    if ("error" in result) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    login(result.account.loginId, password);

    // 보호자는 실제 백엔드에도 같이 가입시켜서, 로그인 토큰을 받아둔다 — 이게 있어야
    // 나중에 어르신 사진 업로드(잔반 분석) 기능을 실제로 호출할 수 있다. 백엔드 가입이
    // 실패해도(서버 일시 장애 등) 로컬 가입 자체는 막지 않는다 — 앱은 계속 쓸 수 있어야 하고,
    // 사진 업로드만 나중에 다시 로그인하면 활성화된다.
    if (role === "guardian") {
      const backendResult = await registerGuardianBackend({ name, phone, email, password, relationship });
      if ("error" in backendResult) {
        toast.info("사진 업로드 같은 일부 기능은 나중에 이 계정으로 다시 로그인하면 활성화돼요.");
      }
    }

    setSubmitting(false);
    toast.success("회원가입이 완료됐어요.");
    router.push(result.account.role === "guardian" ? "/guardian/wards/new" : "/user/home");
  }

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader />
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
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-relationship">대상자와의 관계</Label>
                    <Input id="signup-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="예: 딸, 아들, 며느리" required />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-birth-date">생년월일</Label>
                    <Input id="signup-birth-date" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} autoComplete="bday" required />
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
