"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EpcmstLogo } from "@/components/EpcmstLogo";
import { useAuth } from "@/lib/AuthContext";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/passwordRules";

const field = "mt-1 h-9 w-full rounded border border-line bg-surface px-3 text-[13px] outline-none focus:border-neutral-500";

// The page the emailed link opens. The link starts a temporary "recovery" session and Supabase says so with a
// PASSWORD_RECOVERY event; the form is only shown once that has happened, so anyone who opens this address
// without a valid link just sees that it has expired.
export default function ResetPasswordPage() {
  const { loading, passwordRecovery, updatePassword, signOut } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const { error: saveError } = await updatePassword(password);
    if (saveError) {
      setBusy(false);
      setError(saveError);
      return;
    }
    // End the temporary session so the person signs in fresh with the new password.
    await signOut();
    router.replace("/login?reset=done");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <h1>
            <EpcmstLogo className="h-16 w-auto" />
          </h1>
          <p className="mt-3 text-[13px] text-muted">Choose a new password for your account.</p>
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-sm">
          {loading ? (
            <p role="status" className="text-center text-[12.5px] text-neutral-500">Checking your link…</p>
          ) : !passwordRecovery ? (
            <div className="space-y-3 text-[12.5px] leading-relaxed">
              <p role="alert" className="font-semibold text-red-600">This reset link has expired or was already used.</p>
              <p className="text-neutral-600">
                Reset links work once, for a short time, and only in the browser where you asked for them. Go back to sign in, choose Forgot password, and we&apos;ll send a new one.
              </p>
              <Link href="/login" className="inline-block font-medium text-brand-dark underline">Back to Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 text-[12.5px] font-medium text-neutral-700">
              <label className="block">
                New password
                <input type="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              </label>
              <label className="block">
                Confirm password
                <input type="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
              </label>
              <p className="text-[11.5px] font-normal text-neutral-500">At least {PASSWORD_MIN_LENGTH} characters, the same as when you signed up.</p>
              {error && <p role="alert" className="text-[12px] leading-relaxed text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className="h-9 w-full rounded bg-action text-[12.5px] font-semibold text-white transition-colors hover:bg-action-hover disabled:opacity-50">
                {busy ? "Please wait…" : "Set New Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
