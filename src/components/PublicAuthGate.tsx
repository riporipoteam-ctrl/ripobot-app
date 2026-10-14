// Gate for public user accounts on the public site. If PUBLIC_CHAT is on
// and the visitor isn't logged in, shows a welcome screen with signup/login.
// Guests can still continue without an account.
import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { setPublicUser, usePublicUser } from "@/lib/use-public-user";

export function PublicAuthGate() {
  const { user, loading, refresh } = usePublicUser();
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"login" | "signup">("signup");
  const [dismissed, setDismissed] = useState(false);
  const [publicChatOn, setPublicChatOn] = useState(false);

  useEffect(() => {
    // Check if public auth is available (PUBLIC_CHAT=1)
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        // 404 = public chat not enabled, don't show auth UI
        // 401 = not logged in, show auth UI
        // 200 = logged in
        setPublicChatOn(res.status !== 404);
      })
      .catch(() => setPublicChatOn(false));
  }, []);

  // Don't show anything while loading, or if public chat is off,
  // or if user is logged in, or if they dismissed it
  if (loading || !publicChatOn || user || dismissed) {
    return null;
  }

  // Show a welcome banner with signup/login options
  // (non-blocking - user can dismiss and continue as guest)
  if (!showModal) {
    return (
      <div className="fixed bottom-4 right-4 z-40 max-w-xs rounded-2xl border border-hairline/50 bg-card p-4 shadow-2xl">
        <h3 className="font-semibold text-ink">Save your chats</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Create a free account to save conversations and create your own bots.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setModalMode("signup");
              setShowModal(true);
            }}
            className="flex-1 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-card hover:opacity-90"
          >
            Sign up
          </button>
          <button
            onClick={() => {
              setModalMode("login");
              setShowModal(true);
            }}
            className="flex-1 rounded-lg border border-hairline/50 bg-control/60 px-3 py-2 text-sm font-medium text-ink hover:bg-raised-hover"
          >
            Log in
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="mt-2 w-full text-center text-xs text-ink-tertiary hover:text-ink-secondary"
        >
          Continue as guest
        </button>
      </div>
    );
  }

  return (
    <AuthModal
      mode={modalMode}
      onClose={() => {
        setShowModal(false);
        setDismissed(true);
      }}
      onSuccess={(newUser) => {
        setPublicUser(newUser);
        setShowModal(false);
        void refresh();
      }}
      onSwitchMode={setModalMode}
    />
  );
}
