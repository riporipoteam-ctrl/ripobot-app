// Public user auth: signup/login modal. Free, no external dependencies.
import { useState } from "react";

interface AuthModalProps {
  mode: "login" | "signup";
  onClose: () => void;
  onSuccess: (user: { id: string; email: string; name: string }) => void;
  onSwitchMode: (mode: "login" | "signup") => void;
  mandatory?: boolean;
}

export function AuthModal({ mode, onClose, onSuccess, onSwitchMode, mandatory = false }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body = mode === "signup" ? { email, password, name } : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onSuccess(data.user);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={mandatory ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-hairline/50 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-ink">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {mode === "signup"
            ? "Sign up to save your chats and create your own bots."
            : "Log in to pick up where you left off."}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-ink">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline/50 bg-control/60 px-3 py-2 text-ink placeholder:text-ink-tertiary"
                placeholder="Your name"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline/50 bg-control/60 px-3 py-2 text-ink placeholder:text-ink-tertiary"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline/50 bg-control/60 px-3 py-2 text-ink placeholder:text-ink-tertiary"
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              required
              minLength={mode === "signup" ? 8 : 1}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-ink px-4 py-2 font-medium text-card hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-ink-secondary">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                onClick={() => onSwitchMode("login")}
                className="font-medium text-ink hover:underline"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                onClick={() => onSwitchMode("signup")}
                className="font-medium text-ink hover:underline"
              >
                Create an account
              </button>
            </>
          )}
        </div>

        {!mandatory && (
          <button
            onClick={onClose}
            className="mt-4 w-full text-center text-sm text-ink-tertiary hover:text-ink-secondary"
          >
            Continue as guest
          </button>
        )}
      </div>
    </div>
  );
}
