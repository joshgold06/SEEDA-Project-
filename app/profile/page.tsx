"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, Breadcrumbs, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";

const PROVIDER_LABEL: Record<string, string> = { email: "Email / magic link", google: "Google" };
const field = "mt-1 h-9 w-full rounded border border-line bg-white px-3 text-[13px] outline-none focus:border-neutral-500";

export default function ProfilePage() {
  const { user, profile, signOut, updateName } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
    }
  }, [profile]);

  if (!profile || !user) return null;

  const dirty = firstName.trim() !== profile.firstName || lastName.trim() !== profile.lastName;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await updateName({ firstName: firstName.trim(), lastName: lastName.trim() });
    setSaving(false);
    if (error) setError(error);
    else setSaved(true);
  }

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

          <form onSubmit={handleSave} className="mt-7 border-t border-line pt-6">
            <div className="grid grid-cols-2 gap-3 text-[12.5px] font-medium text-neutral-700">
              <label className="block">
                First name
                <input value={firstName} onChange={(e) => { setFirstName(e.target.value); setSaved(false); }} className={field} />
              </label>
              <label className="block">
                Last name
                <input value={lastName} onChange={(e) => { setLastName(e.target.value); setSaved(false); }} className={field} />
              </label>
            </div>
            {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={!dirty || saving}
                className="h-8 rounded bg-ink px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save name"}
              </button>
              {saved && <span className="text-[12px] text-brand-dark">Saved</span>}
            </div>
          </form>

          <dl className="mt-7 space-y-4 border-t border-line pt-6 text-[13px]">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Sign-in methods</dt>
              <dd className="font-medium">
                {profile.providers.length ? profile.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ") : "Unknown"}
              </dd>
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
