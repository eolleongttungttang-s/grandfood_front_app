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
import {
  UserRole,
  ensureLocalGuardianAccount,
  ensureLocalUserAccount,
  findAccountByLoginId,
} from "@/lib/auth";
import {
  fetchGuardianProfile,
  loginGuardianBackend,
  loginUserBackend,
  syncGuardianWardsFromBackend,
} from "@/lib/backend-auth";
import { addWard, createSelfWard, getWard } from "@/lib/wards";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const [tab, setTab] = useState<UserRole>("user");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectTab(next: UserRole) {
    setTab(next);
    setLoginId("");
    setPassword("");
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
          // 이슈 #11 — 이 기기엔 이 보호자가 관리하는 대상자 정보가 로컬에 하나도 없다
          // (그래서 애초에 크로스디바이스 폴백을 탄 것). GET /users로 실제 목록을 받아와
          // 로컬 Ward/wardIds를 채운다 — 안 그러면 로그인은 되는데 보호자 홈이 계속 빈 채로 보인다.
          await syncGuardianWardsFromBackend(backendResult.session.accessToken, trimmedId);
          account = login(trimmedId, password);
        }
      }

      // 이용자(어르신) 탭도 보호자와 같은 이유로 크로스디바이스 폴백이 필요하다 — 이 기기엔
      // 로컬 계정이 없어도(QR 초대로 다른 기기에서 등록됐거나 저장소가 지워짐) 실제 백엔드
      // DB엔 있을 수 있다. 로그인 응답이 이름만 주고 생년월일/주소/성별을 안 줘서 실제
      // 정보로 채운 Ward는 못 만들지만, home-view.tsx가 이미 쓰는 담당매장 placeholder와
      // 같은 방침으로 임시값을 채운 Ward를 만든다 — 로그인 자체가 항상 실패하는 것보다
      // 낫고, 어르신이 나중에 생활 정보 설문을 다시 채우거나 보호자가 상세 화면에서 고치면
      // 실제 값으로 덮인다.
      if (!account && tab === "user") {
        const backendResult = await loginUserBackend(trimmedId, password);
        if ("session" in backendResult) {
          backendSessionEstablished = true;
          // 이 로그인 아이디로 로컬 계정이 이미 있는데(예: 다른 기기에서 비번을 바꿔서 이
          // 기기의 로컬 캐시 비번만 안 맞는 경우) 여기서 무조건 새 Ward를 만들면, 그 계정은
          // 어차피 기존 selfWardId를 그대로 쓰므로(ensureLocalUserAccount는 password만
          // 갱신하고 selfWardId는 안 건드림) 방금 만든 Ward는 아무도 안 쓰는 채로 WARDS에
          // 남는다 — 이 경로를 탈 때마다 안 쓰이는 Ward 레코드가 계속 쌓이는 문제가 있었다
          // (코드 리뷰 지적). 기존 계정 + 기존 Ward가 있으면 그걸 그대로 재사용하고, 정말
          // 처음 보는 로그인 아이디일 때만(진짜 새 기기) 새 placeholder Ward를 만든다 —
          // 부수적으로 기존 Ward는 실제 정보(성별 포함)를 갖고 있을 수 있어 추측할 필요도
          // 없어진다.
          const existingAccount = findAccountByLoginId(trimmedId);
          const existingWard = existingAccount?.selfWardId ? getWard(existingAccount.selfWardId) : undefined;
          const selfWardId = existingWard?.id ?? crypto.randomUUID();
          if (!existingWard) {
            // 성별(gender)은 다른 임시값(생년월일/주소)과 달리 나중에 고칠 수 있는 화면이
            // 앱에 없다(마이페이지/보호자 상세 둘 다 읽기 전용 표시뿐) — 이 추측이 틀리면
            // (남성 어르신이면) 계속 "여"로 잘못 표시된 채 남는다는 걸 알고 있는 한계다
            // (코드 리뷰 지적). Ward.gender가 "여"|"남" 중 하나를 반드시 요구해서 "미정"
            // 값을 넣을 수도 없다 — 완전히 고치려면 성별을 수정할 수 있는 화면을 새로
            // 만드는 별도 작업이 필요하다.
            const placeholderBirthYear = new Date().getFullYear() - 75;
            addWard(
              createSelfWard({
                id: selfWardId,
                name: backendResult.session.name,
                birthDate: `${placeholderBirthYear}-01-01`,
                gender: "여",
                address: "",
              })
            );
          }
          ensureLocalUserAccount({
            loginId: trimmedId,
            password,
            name: backendResult.session.name,
            selfWardId,
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
      //
      // 크로스디바이스 폴백(!account 분기)과 달리 이 분기는 "이미 이 기기에 로컬 계정이
      // 있는" 보호자가 매번 타는 경로라 — 대상자 목록도 매번 다시 동기화한다. 그래야 어르신이
      // 본인 기기에서 QR 초대 동의+설문을 끝내 새 대상자가 생겨도(그 시점엔 보호자 기기의
      // localStorage가 전혀 갱신되지 않는다 — addWard/linkWardToGuardian 둘 다 어르신 기기
      // 기준으로 실행됨), 보호자가 다음에 로그인할 때는 자기 홈 화면에 그 대상자가 보인다.
      // 이 동기화가 없으면 "완전히 새 기기로 첫 로그인"할 때만(크로스디바이스 폴백 경로)
      // 대상자 목록이 채워지고, 원래 쓰던 기기에선 초대한 대상자가 영원히 안 보였다.
      if (!backendSessionEstablished && account.role === "guardian" && EMAIL_PATTERN.test(trimmedId)) {
        const backendResult = await loginGuardianBackend(trimmedId, password);
        if ("session" in backendResult) {
          await syncGuardianWardsFromBackend(backendResult.session.accessToken, trimmedId);
        }
      }

      // 이용자 본인도 같은 이유로 best-effort 백엔드 로그인을 시도한다 — 직접가입
      // (signup/page.tsx)으로 만든 계정과, 초대(QR)로 등록된 계정(invite/service.py의
      // register_elder_from_invite가 이름/전화번호 뒷자리로 로그인 수단을 함께 만들어준다)
      // 둘 다 여기서 대응 레코드를 찾는다 — 데모 계정(gf-user01)처럼 애초에 백엔드에 없는
      // 계정만 조용히 실패한다. backendSessionEstablished면 위 크로스디바이스 폴백에서
      // 이미 로그인했으니 다시 하지 않는다(가드가 guardian 분기와 동일한 이유).
      if (!backendSessionEstablished && account.role === "user") {
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
                {/* 보호자가 QR/문자로 초대한 이용자는 비밀번호를 직접 정한 적이 없다 —
                    consent-view.tsx가 본인 연락처 뒷자리 4자리로 자동 생성해준 값이라,
                    본인이 그걸 "비밀번호"로 기억 못 하는 경우가 많다. 빈 칸일 때만 힌트를 보여준다. */}
                {tab === "user" && !password && (
                  <p className="break-keep text-sm text-muted-foreground">
                    보호자를 통해 가입하셨으면 연락처 뒷자리를 입력해주세요.
                  </p>
                )}
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

              {/* 백엔드에 아이디/비밀번호 찾기 API가 아직 없다 — 실제로 동작하진 않지만,
                  로그인 화면에 이 두 버튼이 아예 없으면 "잊어버리면 방법이 없나?" 하는
                  불안을 줄 수 있어 형식적으로라도 자리를 만들어둔다(2026-08-18 피드백).
                  눌렀을 때 아무 반응이 없으면 고장난 것처럼 보이니, 최소한 "아직 준비
                  중"이라는 안내는 토스트로 준다. */}
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => toast.info("아이디 찾기는 아직 준비 중이에요.")}
                >
                  아이디 찾기
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => toast.info("비밀번호 찾기는 아직 준비 중이에요.")}
                >
                  비밀번호 찾기
                </button>
              </div>
            </form>

            <p className="mt-5 break-keep text-center text-sm text-muted-foreground">
              탭을 바꾸면 계정도 함께 바뀌어요
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
