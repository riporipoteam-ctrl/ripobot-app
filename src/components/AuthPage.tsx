// Safari-compatible auth page. Uses traditional form POST as fallback.
// Works even if JavaScript fetch fails on iOS Safari.
import { useState } from "react";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [error, setError] = useState<string | null>(null);

  // Try JS fetch first, fall back to traditional form submission
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Don't prevent default immediately - let the form work traditionally
    // We'll try fetch, and if it fails, allow traditional submission
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      e.preventDefault(); // Prevent traditional submission, try fetch first
      
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body: Record<string, string> = {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      };
      if (mode === "signup") {
        body.name = String(formData.get("name") ?? "");
      }
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed. Please try again.");
        return;
      }
      
      // Success - reload to get the authenticated app
      window.location.href = "/";
    } catch (err) {
      // Fetch failed (e.g., Safari issue) - fall back to traditional form submission
      console.warn("Fetch failed, falling back to traditional form submission", err);
      form.submit(); // Submit traditionally
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
          
          {/* Traditional form with POST action as fallback */}
          <form
            method="POST"
            action={mode === "signup" ? "/api/auth/signup" : "/api/auth/login"}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {mode === "signup" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
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
                name="email"
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
                name="password"
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
              className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-ink hover:opacity-90"
            >
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-ink-secondary">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(null); }}
                  className="font-medium text-accent hover:underline"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); }}
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
