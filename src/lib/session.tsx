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
