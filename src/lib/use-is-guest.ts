// Whether this browser is a public-chat guest (lib/session.ts cloudGuest).
// Guests see a limited Settings: no API keys, engines, computers, or account.
import { useEffect, useState } from "react";

import { readSessionState } from "./session";

let pending: Promise<boolean> | null = null;

function isGuest(): Promise<boolean> {
  pending ??= readSessionState().then(
    (state) => state.kind === "session" && state.cloudGuest === true,
    () => false,
  );
  return pending;
}

export function useIsGuest(): boolean | null {
  const [guest, setGuest] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void isGuest().then((value) => {
      if (alive) setGuest(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return guest;
}
