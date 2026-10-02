"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const field = "mt-1 h-9 w-full rounded border border-line bg-white px-3 text-[13px] outline-none focus:border-neutral-500";

export default function LoginPage() {
  const { user, loading, signIn, signUp, signInWithMagicLink, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/scan");
  }, [loading, user, router]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, { firstName: firstName.trim(), lastName: lastName.trim() });
    setBusy(false);
    if (error) setError(error);
  }

  async function handleMagicLink() {
    if (!magicEmail.trim()) return;
    setMagicBusy(true);
    const { error } = await signInWithMagicLink(magicEmail.trim());
    setMagicBusy(false);
    if (!error) setMagicSent(true);
    else setError(error);
  }

  if (loading || user) return null;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-10 place-items-center rounded-md bg-brand text-white">
            <CircleHelp className="size-5" strokeWidth={1.75} />
          </span>
          <h1 className="mt-4 font-mono text-[18px] font-bold">Signal Scout</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue to your pipeline.</p>
        </div>

        <div className="mt-8 rounded-lg border border-line bg-white p-6 shadow-sm">
          <div className="flex rounded-md border border-line p-0.5 text-[12.5px] font-medium">
            <button onClick={() => setMode("signin")} className={`flex-1 rounded py-1.5 transition-colors ${mode === "signin" ? "bg-ink text-white" : "text-neutral-600 hover:text-ink"}`}>
              Sign In
            </button>
            <button onClick={() => setMode("signup")} className={`flex-1 rounded py-1.5 transition-colors ${mode === "signup" ? "bg-ink text-white" : "text-neutral-600 hover:text-ink"}`}>
              Sign Up
            </button>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-3 text-[12.5px] font-medium text-neutral-700">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  First name
                  <input required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={field} />
                </label>
                <label className="block">
                  Last name
                  <input required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={field} />
                </label>
              </div>
            )}
            <label className="block">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>
            <label className="block">
              Password
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="h-9 w-full rounded bg-ink text-[12.5px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50">
              {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] text-neutral-400">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          {magicSent ? (
            <p className="rounded border border-brand-line bg-brand-soft px-3 py-2.5 text-[12.5px] text-brand-dark">
              Check your email for the login link!
            </p>
          ) : (
            <div className="space-y-2">
              <input
                type="email"
                placeholder="you@company.com"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                className={field + " !mt-0"}
              />
              <button
                onClick={handleMagicLink}
                disabled={magicBusy}
                className="h-9 w-full rounded border border-line bg-white text-[12.5px] font-medium text-ink transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                {magicBusy ? "Sending…" : "Send Magic Link"}
              </button>
            </div>
          )}

          <button
            onClick={() => signInWithGoogle()}
            className="mt-3 h-9 w-full rounded border border-line bg-white text-[12.5px] font-medium text-ink transition-colors hover:bg-neutral-50"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
