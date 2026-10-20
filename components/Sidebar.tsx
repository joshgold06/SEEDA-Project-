"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Map, Settings, TrendingUp, Zap } from "lucide-react";
import { EpcmstMark } from "./EpcmstLogo";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "./ui";

const NAV = [
  { href: "/scan", label: "Morning Scan", icon: Zap },
  { href: "/map", label: "Map", icon: Map },
  { href: "/shortlist", label: "Shortlist", icon: Layers },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp },
];

const railLink = (active: boolean) =>
  `grid size-9 place-items-center rounded-md transition-colors ${active ? "bg-white/10 text-white" : "text-white/45 hover:text-white/85"}`;

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const onProfile = pathname.startsWith("/profile");

  return (
    <aside className="no-print sticky top-0 flex h-screen w-[54px] shrink-0 flex-col items-center bg-rail py-5">
      <Link href="/scan" aria-label="Home" className="grid size-9 place-items-center rounded-md bg-surface">
        <EpcmstMark className="size-6" />
      </Link>

      <nav className="mt-7 flex flex-col items-center gap-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={railLink(active)}>
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3">
        <Link href="/settings" title="Settings" aria-label="Settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined} className={railLink(pathname.startsWith("/settings"))}>
          <Settings className="size-[18px]" />
        </Link>
        <Link
          href="/profile"
          title={profile ? `${profile.name}, view profile` : "Profile"}
          aria-label="Profile"
          aria-current={onProfile ? "page" : undefined}
          className={`rounded-full ring-offset-2 ring-offset-rail transition-shadow ${onProfile ? "ring-2 ring-brand" : ""}`}
        >
          {profile && <Avatar initials={profile.initials} src={profile.avatarUrl} title={profile.name} size={28} />}
        </Link>
      </div>
    </aside>
  );
}
