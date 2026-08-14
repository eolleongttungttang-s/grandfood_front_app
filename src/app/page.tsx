"use client";

import Link from "next/link";
import { HeartHandshake, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GrandFoodMark } from "@/components/brand/grandfood-logo";
import { BrandHeader } from "@/components/app/brand-header";
import { useSession } from "@/lib/session";
import { backendUserSessionStore, hasBackendGuardianSession } from "@/lib/backend-auth";

export default function Home() {
  const { account, isLoading } = useSession();
  const homeHref = account?.role === "guardian" ? "/guardian/home" : "/user/home";

  // "OOO님으로 계속하기"는 로컬에 저장된 계정 정보만 보고 화면을 열어주는 지름길이라, 실제
  // 백엔드 로그인 토큰(RAG/구독/반찬추천 등 서버 기능에 필요)이 없는 상태로도 눌러진다 —
  // 그러면 홈 화면은 뜨지만 서버가 필요한 기능은 전부 "요청 자체가 안 나가는" 방식으로
  // 조용히 실패한다. 진짜 토큰이 있을 때만 홈으로 곧장 보내고, 없으면 실제 로그인 폼
  // (/login, loginUserBackend/loginGuardianBackend가 토큰을 발급·저장함)으로 보낸다.
  const hasBackendSession = account
    ? account.role === "guardian"
      ? hasBackendGuardianSession(account.loginId)
      : account.loginId in backendUserSessionStore.read()
    : false;
  const continueHref = hasBackendSession ? homeHref : "/login";

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <GrandFoodMark className="h-16 w-16 rounded-2xl" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            GrandFood
          </h1>
          <p className="text-sm text-muted-foreground">
            어르신의 식사와 건강을 이용자와 가족이 함께 챙겨요
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2 text-left text-xs text-muted-foreground">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
            <User className="h-4 w-4 shrink-0 text-accent" />
            <span>이용자 본인 — 내 식단과 건강 정보를 확인해요</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
            <HeartHandshake className="h-4 w-4 shrink-0 text-accent" />
            <span>가족 보호자 — 돌보는 어르신 정보를 확인해요</span>
          </div>
        </div>

        {!isLoading && account ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button size="lg" nativeButton={false} render={<Link href={continueHref} />}>
            {account.name}님으로 계속하기
            </Button>
            <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/login" />}>
              다른 계정으로 로그인
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              회원가입
            </Button>
            <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/login" />}>
              로그인
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
