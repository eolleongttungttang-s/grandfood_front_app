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
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { useSession } from "@/lib/session";
import { UserRole } from "@/lib/auth";

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
    setTimeout(() => {
      const account = login(loginId.trim(), password);
      setSubmitting(false);
      if (!account) {
        setError("아이디 또는 비밀번호가 올바르지 않아요.");
        return;
      }
      if (account.role !== tab) {
        toast.info(
          `이 계정은 ${account.org} 구분이에요. 해당 화면으로 안내할게요.`
        );
      }
      toast.success(`${account.name}님, 안녕하세요!`);
      router.push(account.role === "guardian" ? "/guardian/home" : "/user/home");
    }, 500);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
      <Card className="w-full max-w-[380px] border-none shadow-none">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <GrandFoodMark className="h-11 w-11 rounded-2xl" />
          <CardTitle className="text-lg">GrandFood 로그인</CardTitle>
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
              <Label htmlFor="loginId">아이디</Label>
              <Input
                id="loginId"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
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
    </div>
  );
}
