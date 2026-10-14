// Public user auth state: checks /api/auth/me on load, provides login/logout.
import { useCallback, useEffect, useState } from "react";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

let cached: { user: PublicUser | null; checked: boolean } = { user: null, checked: false };
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((fn) => fn());
}

export function usePublicUser(): { user: PublicUser | null; loading: boolean; refresh: () => void; logout: () => Promise<void> } {
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!cached.checked);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        cached = { user: data.user, checked: true };
      } else {
        cached = { user: null, checked: true };
      }
    } catch {
      cached = { user: null, checked: true };
    }
    setLoading(false);
    notify();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    cached = { user: null, checked: true };
    notify();
  }, []);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.push(fn);
    if (!cached.checked) {
      void refresh();
    } else {
      setLoading(false);
    }
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, [refresh]);

  return { user: cached.user, loading, refresh, logout };
}

export function setPublicUser(user: PublicUser | null) {
  cached = { user, checked: true };
  notify();
}
