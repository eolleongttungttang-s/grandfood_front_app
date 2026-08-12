"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandHeader } from "@/components/app/brand-header";
import { useSession } from "@/lib/session";
import { UserRole, ensureLocalGuardianAccount } from "@/lib/auth";
import { fetchGuardianProfile, loginGuardianBackend, loginUserBackend } from "@/lib/backend-auth";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const DEMO_CREDENTIALS: Record<UserRole, { loginId: string; password: string }> = {
  user: { loginId: "gf-user01", password: "1234" },
  guardian: { loginId: "gf-guardian01", password: "1234" },
};

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const [tab, setTab] = useState<UserRole>("user");
  const [loginId, setLoginId] = useState(DEMO_CREDENTIALS.user.loginId);
  const [password, setPassword] = useState(DEMO_CREDENTIALS.user.password);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectTab(next: UserRole) {
    setTab(next);
    setLoginId(DEMO_CREDENTIALS[next].loginId);
    setPassword(DEMO_CREDENTIALS[next].password);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!loginId.trim() || !password) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setTimeout(async () => {
      const trimmedId = loginId.trim();
      let account = login(trimmedId, password);
      let backendSessionEstablished = false;

      // 이 브라우저엔 로컬 계정이 없어도(다른 기기에서 가입했거나 저장소가 지워짐) 실제
      // 백엔드 DB엔 있을 수 있다 — 보호자+이메일 형식 아이디에 한해 실제 백엔드 로그인을
      // 시도해서, 성공하면 그 결과로 이 기기에 로컬 계정을 새로 만든다.
      if (!account && tab === "guardian" && EMAIL_PATTERN.test(trimmedId)) {
        const backendResult = await loginGuardianBackend(trimmedId, password);
        if ("session" in backendResult) {
          backendSessionEstablished = true;
          const profileResult = await fetchGuardianProfile(backendResult.session.accessToken);
          ensureLocalGuardianAccount({
            loginId: trimmedId,
            password,
            name: backendResult.session.name,
            phone: "phone" in profileResult ? profileResult.phone : "",
            relationship: "relationship" in profileResult ? profileResult.relationship : "",
          });
          account = login(trimmedId, password);
        }
      }

      if (!account) {
        setSubmitting(false);
        setError("아이디 또는 비밀번호가 올바르지 않아요.");
        return;
      }
      if (account.role !== tab) {
        toast.info(
          `이 계정은 ${account.org} 구분이에요. 해당 화면으로 안내할게요.`
        );
      }

      // 위에서 이미 백엔드 로그인을 마쳤다면(크로스디바이스 폴백) 다시 할 필요 없다. 아니라면
      // 보호자가 이메일 형식 아이디로 로그인했을 때 best-effort로 같이 시도해서 토큰을
      // 갱신해둔다 — 사진 업로드 함수 호출에 필요하다. 실패해도(예: 데모용 gf-guardian01처럼
      // 백엔드엔 없는 계정) 로컬 로그인 자체는 막지 않는다.
      if (!backendSessionEstablished && account.role === "guardian" && EMAIL_PATTERN.test(trimmedId)) {
        await loginGuardianBackend(trimmedId, password);
      }

      // 이용자 본인도 같은 이유로 best-effort 백엔드 로그인을 시도한다 — 직접가입
      // (signup/page.tsx)으로 만든 계정만 백엔드에 대응 레코드가 있고, 보호자 초대로 만들어진
      // 계정이나 데모 계정(gf-user01)은 백엔드에 없어서 조용히 실패한다. 크로스디바이스 폴백은
      // 이용자 쪽엔 없다 — 백엔드가 로그인 응답으로 이름만 돌려주고 생년월일/주소가 없어서,
      // 로컬 계정을 새로 만들어도 대상자(Ward) 정보가 없는 반쪽짜리 홈 화면이 된다.
      if (account.role === "user") {
        await loginUserBackend(trimmedId, password);
      }

      setSubmitting(false);
      toast.success(`${account.name}님, 안녕하세요!`);
      router.push(account.role === "guardian" ? "/guardian/home" : "/user/home");
    }, 500);
  }

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader onBack={() => router.push("/")} />
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <Card className="w-full max-w-[380px] border-none shadow-none">
          <CardHeader className="flex flex-col items-center gap-2 text-center">
            <CardTitle className="text-lg">로그인</CardTitle>
            <CardDescription>
              이용자 본인이신지, 가족 보호자이신지 먼저 골라주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => selectTab("user")}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                  tab === "user"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                이용자 본인
              </button>
              <button
                type="button"
                onClick={() => selectTab("guardian")}
                className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                  tab === "guardian"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                가족 보호자
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loginId">{tab === "guardian" ? "이메일" : "아이디"}</Label>
                <Input
                  id="loginId"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  placeholder={tab === "guardian" ? "가입할 때 쓴 이메일" : undefined}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" size="lg" disabled={submitting} className="mt-1">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "확인하는 중..." : "로그인"}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              데모 계정이 미리 입력되어 있어요 · 탭을 바꾸면 계정도 함께 바뀌어요
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
