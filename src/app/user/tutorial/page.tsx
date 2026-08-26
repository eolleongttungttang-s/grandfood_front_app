"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useSession } from "@/lib/session";
import { hasSeenUserTutorial, markUserTutorialSeen } from "@/lib/user-tutorial";
import { startUserTour } from "@/lib/user-tour";
import { PhotoGuideView } from "@/components/user/tutorial-view";

// 이용자(어르신 본인) 최초 회원가입 직후에만 들어오는 화면 — signup/page.tsx(직접가입,
// /user/survey?first=1 완료 후)와 invite/survey/page.tsx(QR 초대, 설문 완료 후) 둘 다
// 여기로 보낸다. 여기선 사진 촬영 가이드(탭바에 대응하는 실제 요소가 없어 스포트라이트로
// 못 보여주는 부분)만 화면 하나로 보여주고, "다음"을 누르면 실제 홈 화면으로 이동하면서
// 거기서부터 탭 4개(홈/식단/섭취기록/마이) 튜토리얼이 스포트라이트로 이어진다(2026-08-26,
// user-tour.ts 참고 — user/layout.tsx의 UserShell이 그 부분을 그린다).
// 완료/건너뛰기 시 markUserTutorialSeen을 남겨서, 브라우저 뒤로가기 등으로 이 화면에 다시
// 들어와도 곧장 홈으로 돌려보낸다(이미 본 사람에게 또 보여주지 않음).
// 홈 화면의 "사용법 다시 보기"(?replay=1)로 들어올 땐 이미 본 사람이어도 그 리다이렉트를
// 건너뛴다 — markUserTutorialSeen은 이미 true라 다시 호출해도 상태엔 변화 없다.
function UserTutorialPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReplay = searchParams.get("replay") === "1";
  const { account } = useSession();
  const alreadySeen = account ? hasSeenUserTutorial(account.loginId) : false;
  const shouldRedirectHome = alreadySeen && !isReplay;

  useEffect(() => {
    if (shouldRedirectHome) router.replace("/user/home");
  }, [shouldRedirectHome, router]);

  if (!account || shouldRedirectHome) return null;

  function handleNext() {
    startUserTour();
    router.push("/user/home");
  }

  function handleSkip() {
    markUserTutorialSeen(account!.loginId);
    router.push("/user/home");
  }

  return <PhotoGuideView onNext={handleNext} onSkip={handleSkip} />;
}

export default function UserTutorialPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col" />}>
      <UserTutorialPageContent />
    </Suspense>
  );
}
