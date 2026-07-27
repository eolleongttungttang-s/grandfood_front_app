"use client";

// Tiny localStorage-backed store, readable via useSyncExternalStore.
// This app has no backend, so "이용자 화면에서 한 일이 보호자 화면에 보인다"
// is simulated by writing/reading the same browser's localStorage — it only
// works within one browser (both roles logged in from the same device),
// which is enough for this demo.

type Listener = () => void;

export function createLocalStore<T>(key: string, initial: T) {
  const listeners = new Set<Listener>();
  let cachedRaw: string | null = null;
  let cachedValue: T = initial;

  function read(): T {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(key);
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    try {
      cachedValue = raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      cachedValue = initial;
    }
    return cachedValue;
  }

  function write(value: T) {
    const raw = JSON.stringify(value);
    window.localStorage.setItem(key, raw);
    cachedRaw = raw;
    cachedValue = value;
    listeners.forEach((listener) => listener());
  }

  function update(updater: (prev: T) => T) {
    write(updater(read()));
  }

  function subscribe(callback: Listener) {
    listeners.add(callback);
    window.addEventListener("storage", callback);
    return () => {
      listeners.delete(callback);
      window.removeEventListener("storage", callback);
    };
  }

  function getServerSnapshot(): T {
    return initial;
  }

  return { read, write, update, subscribe, getServerSnapshot };
}
