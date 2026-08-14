"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { Account, findAccount, findAccountByLoginId } from "@/lib/auth";

const STORAGE_KEY = "grandfood-app-session";

type Listener = () => void;
const listeners = new Set<Listener>();

function readLoginId(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function readLoginIdOnServer(): string | null {
  return null;
}

function writeLoginId(loginId: string | null) {
  if (loginId) window.localStorage.setItem(STORAGE_KEY, loginId);
  else window.localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

// fetch-with-timeout.ts처럼 React 밖(hook을 못 쓰는 모듈 레벨 유틸)에서도 "로그아웃"이
// 필요한 경우를 위한 내보내기 — useSession().logout()과 완전히 같은 동작(writeLoginId(null))
// 이지만, logout은 useCallback으로 감싸인 훅 값이라 컴포넌트 밖에서 부를 수 없다. 예전엔
// fetch-with-timeout.ts가 이 로직을 window.localStorage.removeItem(STORAGE_KEY)로 직접
// 다시 구현해서, STORAGE_KEY 문자열이 두 곳에 중복되고(리네임 시 한쪽을 깜빡할 위험)
// listeners.forEach 알림이 빠져(로그아웃 직후 아직 마운트된 컴포넌트가 useSyncExternalStore로
// 즉시 재렌더되지 않는 문제) 실제 logout()과 미묘하게 어긋나 있었다(코드 리뷰 지적).
export function clearSessionForExpiredToken() {
  writeLoginId(null);
}

function subscribe(callback: Listener) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

// Hydration-safe "has this component mounted on the client" flag, so we
// render the same "loading" markup on the server and on first client paint,
// then flip to the real session state right after hydration.
function noopSubscribe() {
  return () => {};
}
function getHydrated() {
  return true;
}
function getHydratedOnServer() {
  return false;
}

type SessionContextValue = {
  account: Account | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Account | null;
  logout: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const loginId = useSyncExternalStore(
    subscribe,
    readLoginId,
    readLoginIdOnServer
  );
  const hasHydrated = useSyncExternalStore(
    noopSubscribe,
    getHydrated,
    getHydratedOnServer
  );

  const account = useMemo(
    () => (loginId ? findAccountByLoginId(loginId) : null),
    [loginId]
  );

  const login = useCallback((id: string, password: string) => {
    const found = findAccount(id, password);
    if (found) writeLoginId(found.loginId);
    return found;
  }, []);

  const logout = useCallback(() => {
    writeLoginId(null);
  }, []);

  const value = useMemo(
    () => ({ account, isLoading: !hasHydrated, login, logout }),
    [account, hasHydrated, login, logout]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
