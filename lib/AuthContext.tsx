"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

type AuthResult = { error: string | null; code?: string };
type SignUpResult = AuthResult & { needsConfirmation: boolean; alreadyRegistered: boolean };

// Supabase's raw messages ("Invalid login credentials", "email rate limit exceeded")
// are terse and don't say what to do next, so translate the ones people actually hit.
function describeAuthError(err: AuthError | null): AuthResult {
  if (!err) return { error: null };
  const code = err.code ?? "";
  const text = err.message.toLowerCase();
  if (code === "over_email_send_rate_limit" || text.includes("rate limit")) {
    return { code: "rate_limit", error: "Too many emails have been sent recently and the limit has been reached. Wait a while and try again, or use Sign in with Google, which sends no email." };
  }
  if (code === "email_not_confirmed" || text.includes("not confirmed")) {
    return { code: "email_not_confirmed", error: "This email hasn't been confirmed yet. Open the confirmation link we emailed you, then sign in." };
  }
  if (code === "invalid_credentials" || text.includes("invalid login")) {
    return { code: "invalid_credentials", error: "Email or password is incorrect. If you first signed in with Google or a magic link, use that again; those accounts have no password." };
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return { code: "already_registered", error: "An account with this email already exists. Use Sign In instead." };
  }
  if (code === "weak_password") return { code, error: "That password is too weak. Use at least 6 characters, ideally a mix of letters and numbers." };
  if (code === "signup_disabled") return { code, error: "New sign-ups are turned off for this app." };
  return { code: code || undefined, error: err.message };
}

export interface Profile {
  /** Full display name; falls back to the email's local part when no name is known. */
  name: string;
  /** Empty string when the user has never provided a name. */
  firstName: string;
  lastName: string;
  email: string;
  initials: string;
  avatarUrl?: string;
  providers: string[];
}

export interface PersonName {
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Set when a sign-in link or Google redirect landed here but failed to log the user in. */
  redirectError: string | null;
  signUp: (email: string, password: string, name?: PersonName) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  signInWithMagicLink: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  updateName: (name: PersonName) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

function pickString(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

// A name the user typed in (user_metadata.first_name/last_name) wins over what
// Google reports, which in turn wins over nothing. Google's details can sit on
// user.identities rather than user_metadata when it was linked to an account
// that was first created by email/magic link.
function deriveProfile(user: User | null): Profile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const identityData = (user.identities ?? []).map((i) => (i.identity_data ?? {}) as Record<string, unknown>);
  const fromIdentity = (key: string) => pickString(...identityData.map((d) => d[key]));

  let firstName = pickString(meta.first_name, meta.given_name, fromIdentity("given_name"));
  let lastName = pickString(meta.last_name, meta.family_name, fromIdentity("family_name"));
  const fullName = pickString(meta.full_name, meta.name, fromIdentity("full_name"), fromIdentity("name"));
  if (!firstName && fullName) {
    const [first, ...rest] = fullName.split(/\s+/);
    firstName = first;
    lastName = lastName || rest.join(" ");
  }

  const email = user.email ?? "";
  const name = [firstName, lastName].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "User");
  const initials = (firstName ? firstName[0] + (lastName[0] ?? "") : name[0] ?? "U").toUpperCase();
  const avatarUrl = pickString(meta.avatar_url, meta.picture, fromIdentity("avatar_url"), fromIdentity("picture")) || undefined;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? (user.app_metadata?.provider ? [user.app_metadata.provider as string] : []);
  return { name, firstName, lastName, email, initials, avatarUrl, providers };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useRef(createClient()).current;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    // A sign-in link only works in the browser that requested it (PKCE), and links
    // expire. When one fails Supabase leaves no session, and the route guard then
    // moves the user to /login with no explanation, so capture why before that happens.
    const params = new URLSearchParams(`${window.location.search}&${window.location.hash.replace(/^#/, "")}`);
    const urlError = params.get("error_description");
    const arrivedWithCode = params.has("code");
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (!data.session && (urlError || arrivedWithCode)) {
        setRedirectError(
          urlError && /expired|invalid/i.test(urlError)
            ? "That sign-in link has expired or was already used. Request a new one."
            : urlError ?? "That sign-in link couldn't be completed. Open it in the same browser where you requested it, or request a new one."
        );
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const signUp = useCallback(
    async (email: string, password: string, name?: PersonName): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/scan`,
          ...(name ? { data: { first_name: name.firstName, last_name: name.lastName, full_name: `${name.firstName} ${name.lastName}`.trim() } } : {}),
        },
      });
      // No session back means the project requires email confirmation first.
      // For an address that is already registered, Supabase hides that and returns a
      // user with no identities, so detect it here instead of showing false success.
      const noSession = !error && !data.session;
      return {
        ...describeAuthError(error),
        needsConfirmation: noSession,
        alreadyRegistered: noSession && (data.user?.identities?.length ?? 1) === 0,
      };
    },
    [supabase]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return describeAuthError(error);
    },
    [supabase]
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/scan` } });
      return describeAuthError(error);
    },
    [supabase]
  );

  // Redirect straight to /scan, not the site root: "/" server-redirects to /scan
  // and that redirect strips the ?code= that Supabase's PKCE login arrives with,
  // so the session would never be established.
  const signInWithMagicLink = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/scan` },
      });
      return describeAuthError(error);
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Always show Google's account picker, so a browser already signed in to one Google account
      // doesn't silently sign the person in as that account.
      options: { redirectTo: `${window.location.origin}/scan`, queryParams: { prompt: "select_account" } },
    });
    return describeAuthError(error);
  }, [supabase]);

  const updateName = useCallback(
    async ({ firstName, lastName }: PersonName) => {
      const { data, error } = await supabase.auth.updateUser({
        data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`.trim() },
      });
      if (!error && data.user) setSession((s) => (s ? { ...s, user: data.user } : s));
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile: deriveProfile(session?.user ?? null),
      loading,
      redirectError,
      signUp,
      signIn,
      resendConfirmation,
      signInWithMagicLink,
      signInWithGoogle,
      updateName,
      signOut,
    }),
    [session, loading, redirectError, signUp, signIn, resendConfirmation, signInWithMagicLink, signInWithGoogle, updateName, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
