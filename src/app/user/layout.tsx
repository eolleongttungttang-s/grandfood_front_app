"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, Home, Salad, UserRound } from "lucide-react";

import { BottomTabBar } from "@/components/app/bottom-tab-bar";
import { RequireRole } from "@/components/app/require-role";
import { SosButton } from "@/components/user/sos-button";
import { TabTourOverlay } from "@/components/user/tab-tour-overlay";
import { useSession } from "@/lib/session";
import { endUserTour, setUserTourStep, useUserTourStep, USER_TOUR_STEPS } from "@/lib/user-tour";
import { markUserTutorialSeen } from "@/lib/user-tutorial";

const TABS = [
  { label: "홈", href: "/user/home", icon: Home },
  { label: "식단", href: "/user/diet", icon: Salad },
  { label: "섭취기록", href: "/user/records", icon: CalendarCheck },
  { label: "마이", href: "/user/profile", icon: UserRound },
];

// 최초 가입 튜토리얼(/user/tutorial)은 전체화면 온보딩이라 하단 탭바·SOS 버튼이 함께
// 뜨면 안 된다 — guardian/layout.tsx의 ROUTES_WITH_OWN_BOTTOM_NAV와 같은 이유·같은 패턴.
const ROUTES_WITHOUT_SHELL_CHROME = ["/user/tutorial"];

function UserShell({ children }: { children: React.ReactNode }) {
  const { account } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const hideShellChrome = ROUTES_WITHOUT_SHELL_CHROME.includes(pathname);
  const containerRef = useRef<HTMLDivElement>(null);

  // 탭 4개(홈/식단/섭취기록/마이) 튜토리얼은 이 레이아웃(=이 컴포넌트) 위에 스포트라이트로
  // 뜬다 — /user/* 안에서 페이지를 옮겨도 UserShell 자신은 다시 마운트되지 않으므로
  // (Next App Router 레이아웃 특성), 실제로 탭을 이동시켜가며 진행해도 오버레이가 끊기지
  // 않는다(2026-08-26, user-tour.ts 주석 참고).
  const tourStep = useUserTourStep();

  // tourStep은 handleTourNext/Back이 router.push와 함께 수동으로 올리는 값이라, 안드로이드
  // 뒤로가기 등 그 두 함수를 거치지 않는 경로 이동(popstate)이 일어나면 실제 보이는 화면과
  // 어긋난다 — 화면이 바뀔 때마다 pathname 기준으로 다시 맞춰준다(2026-08-26 리뷰).
  useEffect(() => {
    if (tourStep === null) return;
    const matchedStep = USER_TOUR_STEPS.findIndex((step) => step.href === pathname);
    if (matchedStep !== -1 && matchedStep !== tourStep) {
      setUserTourStep(matchedStep);
    }
  }, [pathname, tourStep]);

  function finishTour() {
    if (account) markUserTutorialSeen(account.loginId);
    endUserTour();
  }

  function handleTourNext() {
    if (tourStep === null) return;
    if (tourStep >= USER_TOUR_STEPS.length - 1) {
      finishTour();
      router.push("/user/home");
      return;
    }
    const next = tourStep + 1;
    setUserTourStep(next);
    router.push(USER_TOUR_STEPS[next].href);
  }

  function handleTourBack() {
    if (tourStep === null || tourStep === 0) return;
    const prev = tourStep - 1;
    setUserTourStep(prev);
    router.push(USER_TOUR_STEPS[prev].href);
  }

  function handleTourSkip() {
    finishTour();
    router.push("/user/home");
  }

  // hideShellChrome 화면도 main과 똑같이 min-h-0 + overflow-y-auto로 스크롤 영역을 잡아야
  // 한다 — 예전엔 여기만 별도로 overflow-hidden 뿐인 div였는데, 그러면 이 안의 화면(튜토리얼
  // 등)이 뷰포트보다 길어질 때 스크롤되는 대신 그냥 잘려나간다(2026-08-26 실사용 확인).
  return (
    <div ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden">
      {/* SosButton이 이 컨테이너 기준 absolute(right-4 bottom-20)라 화면 높이와 무관하게 늘
          같은 자리에 떠 있다 — 콘텐츠가 짧은 화면(홈 등)에서는 그 자리를 실제 콘텐츠가 차지해
          버튼과 겹칠 수 있어서, 탭바가 있는 화면엔 공통으로 하단 여유 공간을 준다. */}
      <main className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${hideShellChrome ? "" : "pb-28"}`}>
        {children}
      </main>
      {!hideShellChrome && account?.selfWardId && (
        <SosButton wardId={account.selfWardId} wardName={account.name} />
      )}
      {!hideShellChrome && <BottomTabBar items={TABS} />}
      {tourStep !== null && !hideShellChrome && (
        <TabTourOverlay
          containerRef={containerRef}
          step={tourStep}
          onNext={handleTourNext}
          onBack={tourStep > 0 ? handleTourBack : undefined}
          onSkip={handleTourSkip}
        />
      )}
    </div>
  );
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="user">
      <UserShell>{children}</UserShell>
    </RequireRole>
  );
}
