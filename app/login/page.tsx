"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EpcmstLogo } from "@/components/EpcmstLogo";
import { useAuth } from "@/lib/AuthContext";

const field = "mt-1 h-9 w-full rounded border border-line bg-white px-3 text-[13px] outline-none focus:border-neutral-500";

export default function LoginPage() {
  const { user, loading, redirectError, signIn, signUp, resendConfirmation, signInWithMagicLink, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/scan");
  }, [loading, user, router]);

  useEffect(() => {
    if (redirectError) setError(redirectError);
  }, [redirectError]);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError(null);
    setErrorCode(undefined);
    setNotice(null);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorCode(undefined);
    setNotice(null);
    setBusy(true);
    if (mode === "signin") {
      const { error, code } = await signIn(email.trim(), password);
      if (error) {
        setError(error);
        setErrorCode(code);
      }
    } else {
      const result = await signUp(email.trim(), password, { firstName: firstName.trim(), lastName: lastName.trim() });
      if (result.error) {
        setError(result.error);
        setErrorCode(result.code);
      } else if (result.alreadyRegistered) {
        setMode("signin");
        setError("An account with this email already exists. Sign in below, or use a magic link if you never set a password.");
      } else if (result.needsConfirmation) {
        setNotice(`Account created. We emailed a confirmation link to ${email.trim()}. Open it, then come back and sign in. It can take a minute, so check spam too.`);
        setErrorCode("email_not_confirmed");
      }
      // With a session the guard above redirects into the app.
    }
    setBusy(false);
  }

  async function handleResend() {
    setResending(true);
    const { error } = await resendConfirmation(email.trim());
    setResending(false);
    if (error) {
      setError(error);
      setNotice(null);
    } else {
      setError(null);
      setNotice(`Confirmation email sent again to ${email.trim()}.`);
    }
  }

  async function handleMagicLink() {
    if (!magicEmail.trim()) return;
    setError(null);
    setMagicBusy(true);
    const { error, code } = await signInWithMagicLink(magicEmail.trim());
    setMagicBusy(false);
    if (!error) setMagicSent(true);
    else {
      setError(error);
      setErrorCode(code);
    }
  }

  if (loading || user) return null;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <h1>
            <EpcmstLogo className="h-16 w-auto" />
          </h1>
          <p className="mt-3 text-[13px] text-muted">Sign in to continue to your pipeline.</p>
        </div>

        <div className="mt-8 rounded-lg border border-line bg-white p-6 shadow-sm">
          <div className="flex rounded-md border border-line p-0.5 text-[12.5px] font-medium">
            <button onClick={() => switchMode("signin")} className={`flex-1 rounded py-1.5 transition-colors ${mode === "signin" ? "bg-ink text-white" : "text-neutral-600 hover:text-ink"}`}>
              Sign In
            </button>
            <button onClick={() => switchMode("signup")} className={`flex-1 rounded py-1.5 transition-colors ${mode === "signup" ? "bg-ink text-white" : "text-neutral-600 hover:text-ink"}`}>
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
            {error && <p role="alert" className="text-[12px] leading-relaxed text-red-600">{error}</p>}
            {notice && <p role="status" className="rounded border border-brand-line bg-brand-soft px-3 py-2 text-[12px] font-normal leading-relaxed text-brand-dark">{notice}</p>}
            {errorCode === "email_not_confirmed" && email.trim() && (
              <button type="button" onClick={handleResend} disabled={resending} className="text-[12px] font-medium text-brand-dark underline disabled:opacity-50">
                {resending ? "Sending…" : "Resend confirmation email"}
              </button>
            )}
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
              Check your email for the login link! It can take a minute, so check spam too. Open it in this same browser.
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
