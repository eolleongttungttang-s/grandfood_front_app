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
import { UserRole, ensureLocalGuardianAccount, linkWardToGuardian } from "@/lib/auth";
import {
  backendWardIdMapStore,
  fetchGuardianProfile,
  findMockWardIdForBackendUserId,
  listOwnUsersBackend,
  loginGuardianBackend,
  loginUserBackend,
} from "@/lib/backend-auth";
import { addWard, calculateAge, newWardDefaults } from "@/lib/wards";
import { PARTNER_STORES } from "@/lib/partner-stores";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

// GET /users로 받아온 "실제로 관리하는 대상자 목록"을 이 기기의 로컬 Ward와 맞춘다(이슈 #11).
// 이미 로컬에 대응하는 Ward가 있으면(findMockWardIdForBackendUserId) 링크만 다시 걸어주고,
// 완전히 새 기기라 로컬에 아무것도 없으면 백엔드 데이터로 Ward를 새로 만든다.
//
// gender/담당 매장은 백엔드 UserResponse에 아예 없는 필드라 — 실제 값이 아니라 임시
// 기본값으로 채운다(성별은 임의로 "여", 매장은 첫 번째 파트너 매장). 나중에 어르신이
// 생활 정보 설문을 다시 채우거나 보호자가 상세 화면에서 고치면 실제 값으로 덮인다 —
// "정보 없음"으로 막다른 화면을 보여주는 것보다, 자연스러운 초기 상태로 보이게 하는
// 기존 newWardDefaults()와 같은 방침이다.
async function syncGuardianWardsFromBackend(accessToken: string, guardianLoginId: string) {
  const result = await listOwnUsersBackend(accessToken);
  if ("error" in result) return;

  for (const user of result.users) {
    const existingMockId = findMockWardIdForBackendUserId(user.userId);
    if (existingMockId) {
      linkWardToGuardian(guardianLoginId, existingMockId);
      continue;
    }

    const newWardId = crypto.randomUUID();
    addWard({
      id: newWardId,
      name: user.name,
      age: calculateAge(user.birthDate),
      gender: "여",
      address: user.address,
      partnerStoreId: PARTNER_STORES[0].id,
      ...newWardDefaults(),
    });
    backendWardIdMapStore.update((prev) => ({ ...prev, [newWardId]: user.userId }));
    linkWardToGuardian(guardianLoginId, newWardId);
  }
}

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
          // 이슈 #11 — 이 기기엔 이 보호자가 관리하는 대상자 정보가 로컬에 하나도 없다
          // (그래서 애초에 크로스디바이스 폴백을 탄 것). GET /users로 실제 목록을 받아와
          // 로컬 Ward/wardIds를 채운다 — 안 그러면 로그인은 되는데 보호자 홈이 계속 빈 채로 보인다.
          await syncGuardianWardsFromBackend(backendResult.session.accessToken, trimmedId);
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
      // 계정만 조용히 실패한다. 크로스디바이스 폴백은 이용자 쪽엔 없다 — 백엔드가 로그인
      // 응답으로 이름만 돌려주고 생년월일/주소가 없어서, 로컬 계정을 새로 만들어도 대상자
      // (Ward) 정보가 없는 반쪽짜리 홈 화면이 된다.
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
                {/* 보호자가 QR/문자로 초대한 이용자는 비밀번호를 직접 정한 적이 없다 —
                    consent-view.tsx가 본인 연락처 뒷자리 4자리로 자동 생성해준 값이라,
                    본인이 그걸 "비밀번호"로 기억 못 하는 경우가 많다. 빈 칸일 때만 힌트를 보여준다. */}
                {tab === "user" && !password && (
                  <p className="text-xs text-muted-foreground">
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
