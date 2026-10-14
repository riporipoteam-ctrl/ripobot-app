// Gate for public user accounts on the public site. Auth is MANDATORY —
// visitors must sign up or log in to use the site. No guest mode.
import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { setPublicUser, usePublicUser } from "@/lib/use-public-user";

export function PublicAuthGate() {
  const { user, loading, refresh } = usePublicUser();
  const [modalMode, setModalMode] = useState<"login" | "signup">("signup");
  const [publicChatOn, setPublicChatOn] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check if public auth is available (PUBLIC_CHAT=1)
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        setPublicChatOn(res.status !== 404);
      })
      .catch(() => setPublicChatOn(false))
      .finally(() => setChecked(true));
  }, []);

  // Don't show anything while loading, or if public chat is off,
  // or if user is logged in
  if (!checked || loading || !publicChatOn || user) {
    return null;
  }

  // BLOCKING: must sign up or log in. No guest option.
  return (
    <AuthModal
      mode={modalMode}
      onClose={() => {}} // No close — auth is mandatory
      onSuccess={(newUser) => {
        setPublicUser(newUser);
        void refresh();
      }}
      onSwitchMode={setModalMode}
      mandatory={true}
    />
  );
}
