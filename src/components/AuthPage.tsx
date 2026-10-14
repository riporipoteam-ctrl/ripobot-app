// Simple, reliable auth page. Full page, no modal, no race conditions.
import { useState } from "react";

interface AuthPageProps {
  onSuccess: (user: { id: string; email: string; name: string; isAdmin?: boolean }) => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body: Record<string, string> = { email, password };
      if (mode === "signup") body.name = name;
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      
      if (data.token) {
        localStorage.setItem("ripo_user_token", data.token);
      }
      onSuccess(data.user);
    } catch (err) {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-ink">RipoBot</h1>
          <p className="mt-3 text-ink-secondary">
            Your AI assistant. Create bots, automate tasks, and more.
          </p>
        </div>
        
        <div className="rounded-2xl border border-hairline bg-card p-6 shadow-lg">
          <h2 className="mb-6 text-xl font-semibold text-ink">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h2>
          
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full rounded-lg border border-hairline bg-inset px-3 py-2.5 text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
                />
              </div>
            )}
            
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-hairline bg-inset px-3 py-2.5 text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Choose a password (min 6 chars)" : "Your password"}
                required
                minLength={6}
                className="w-full rounded-lg border border-hairline bg-inset px-3 py-2.5 text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
              />
            </div>
            
            {error && (
              <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-ink-secondary">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setMode("login")}
                  className="font-medium text-accent hover:underline"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="font-medium text-accent hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
