"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

type AuthResult = { error: string | null };

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
  signUp: (email: string, password: string, name?: PersonName) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const signUp = useCallback(
    async (email: string, password: string, name?: PersonName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: name
          ? { data: { first_name: name.firstName, last_name: name.lastName, full_name: `${name.firstName} ${name.lastName}`.trim() } }
          : undefined,
      });
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
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
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/scan` },
    });
    return { error: error?.message ?? null };
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
      signUp,
      signIn,
      signInWithMagicLink,
      signInWithGoogle,
      updateName,
      signOut,
    }),
    [session, loading, signUp, signIn, signInWithMagicLink, signInWithGoogle, updateName, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
