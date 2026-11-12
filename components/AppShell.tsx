"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, passwordRecovery } = useAuth();
  // Sign-in and password reset are outside the app: they have no sidebar and need no account.
  const isLoginPage = pathname === "/login" || pathname === "/reset-password";

  useEffect(() => {
    if (!loading && !user && !isLoginPage) router.replace("/login");
  }, [loading, user, isLoginPage, router]);

  // A reset link that lands anywhere else (for example the home page, when the address isn't on Supabase's list)
  // still arrives signed in. Send the person to choose a password instead of into the app.
  useEffect(() => {
    if (passwordRecovery && pathname !== "/reset-password") router.replace("/reset-password");
  }, [passwordRecovery, pathname, router]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-[13px] text-muted">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1">{children}</div>
      <CommandPalette />
    </div>
  );
}
