"use client";

import { useEffect } from "react";

import { useSession } from "@/lib/session";
import { backendGuardianSessionStore, syncGuardianWardsFromBackend } from "@/lib/backend-auth";

// login/page.tsx의 재동기화는 "로그인하는 그 순간"에만 돈다 — 그래서 QR로 초대받은 대상자가
// 다른 기기(어르신 본인 휴대폰)에서 가입을 마쳐도, 보호자가 이미 로그인해서 앱을 계속 쓰고
// 있으면 로그아웃 후 재로그인하기 전까진 "돌보고 있는 대상자" 목록에 새 대상자가 안 보였다
// (2026-08-18 피드백 — 실제로 재현됨). guardian/layout.tsx에 이 컴포넌트를 심어서, 보호자가
// 이 앱의 화면을 보고 있는 동안 캐시된 백엔드 세션으로 주기적으로 같은 동기화를 background로
// 돌린다 — 재로그인 없이도 새 대상자가 뜬다. 세션이 아직 없으면(백엔드 연동 전 데모 계정 등)
// 조용히 아무것도 안 한다.
const RESYNC_INTERVAL_MS = 30_000;

export function GuardianWardSync() {
  const { account } = useSession();
  const loginId = account?.role === "guardian" ? account.loginId : null;

  useEffect(() => {
    if (!loginId) return;

    let cancelled = false;
    function runSync() {
      const session = backendGuardianSessionStore.read()[loginId!];
      if (!session) return;
      syncGuardianWardsFromBackend(session.accessToken, loginId!).catch(() => {
        // best-effort — 실패해도 다음 주기에 다시 시도한다
      });
    }

    runSync();
    const timer = window.setInterval(() => {
      if (!cancelled) runSync();
    }, RESYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginId]);

  return null;
}
