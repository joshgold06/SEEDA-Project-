"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, Breadcrumbs, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";

const PROVIDER_LABEL: Record<string, string> = { email: "Email & password", google: "Google" };

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  if (!profile || !user) return null;

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <>
      <TopBar left={<Breadcrumbs items={[{ label: "Profile" }]} />} />
      <div className="mx-auto max-w-[520px] px-8 py-14">
        <div className="rounded-lg border border-line bg-white p-7 shadow-sm">
          <div className="flex items-center gap-4">
            <Avatar initials={profile.initials} src={profile.avatarUrl} title={profile.name} size={56} />
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[18px] font-bold">{profile.name}</h1>
              <p className="truncate text-[13px] text-muted">{profile.email}</p>
            </div>
          </div>

          <dl className="mt-7 space-y-4 border-t border-line pt-6 text-[13px]">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Signed in with</dt>
              <dd className="font-medium">{PROVIDER_LABEL[profile.provider ?? ""] ?? profile.provider ?? "Unknown"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Email</dt>
              <dd className="font-medium">{profile.email}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Account created</dt>
              <dd className="font-medium">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</dd>
            </div>
          </dl>

          <button
            onClick={handleSignOut}
            className="mt-7 flex h-9 w-full items-center justify-center gap-2 rounded border border-line bg-white text-[12.5px] font-medium text-ink transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="size-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
