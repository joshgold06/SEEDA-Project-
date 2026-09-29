"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Layers, TrendingUp, Zap } from "lucide-react";
import { USER } from "@/lib/data";
import { Avatar } from "./ui";
const NAV = [{ href: "/scan", label: "Morning Scan", icon: Zap, match: ["/scan"] }, { href: "/shortlist", label: "Shortlist", icon: Layers, match: ["/shortlist"] }, { href: "/pipeline", label: "Pipeline", icon: TrendingUp, match: ["/pipeline"] }];
export function Sidebar() { const pathname = usePathname(); return <aside className="no-print sticky top-0 flex h-screen w-[54px] shrink-0 flex-col items-center bg-rail py-5"><Link href="/scan" aria-label="Home" className="grid size-9 place-items-center rounded-md bg-brand text-white"><CircleHelp className="size-5" strokeWidth={1.75} /></Link><nav className="mt-7 flex flex-col items-center gap-5">{NAV.map(({ href, label, icon: Icon, match }) => { const active = match.some((m) => pathname.startsWith(m)); return <Link key={href} href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={`grid size-9 place-items-center rounded-md transition-colors ${active ? "text-brand" : "text-neutral-500 hover:text-neutral-300"}`}><Icon className="size-5" fill={active && Icon !== TrendingUp ? "currentColor" : "none"} /></Link>; })}</nav><div className="mt-auto"><Avatar initials={USER.initials} size={28} /></div></aside>; }
