"use client";

import { CalendarCheck, CircleHelp, History, TrendingUp } from "lucide-react";
import { Breadcrumbs, Button, TopBar } from "@/components/ui";
import { RECENT_ACTIVITY, USER } from "@/lib/data";
import { useStore } from "@/lib/store";

function formatMoney(n: number) { return n >= 1_000_000 ? `$${Math.round(n / 1_000_000)}M` : `$${Math.round(n / 1000)}k`; }

export default function ScanHome() {
  const { opportunities } = useStore();
  const signals = opportunities.filter((o) => o.inScan && !o.dismissed);
  const top = [...signals].sort((a, b) => b.score - a.score)[0];
  const withDeadline = signals.filter((o) => o.daysLeft !== null);
  const earliest = withDeadline.length ? Math.min(...withDeadline.map((o) => o.daysLeft!)) : null;
  const urgent = withDeadline.filter((o) => (o.daysLeft ?? 99) <= 14).length;
  const value = signals.reduce((sum, o) => sum + (o.value ?? 0), 0);
  const stats = [
    { icon: <CalendarCheck className="size-5 text-brand" />, value: top ? `${top.score}%` : "-", label: "Top Match", note: top ? `${top.title.replace("Water Treatment Plant ", "")} is today's strongest fit.` : "No signals yet." },
    { icon: <History className="size-5 text-blue-500" />, value: earliest !== null ? `${earliest}d` : "-", label: "Earliest Deadline", note: `${urgent} project${urgent === 1 ? "" : "s"} require immediate attention.` },
    { icon: <TrendingUp className="size-5 text-warn" />, value: `+${formatMoney(value)}`, label: "New Pipeline Value", note: "Estimated value of new signals today." },
  ];
  return <>
    <TopBar left={<Breadcrumbs items={[{ label: "Alberta" }, { label: "Water & Wastewater" }]} />} right={<><Button variant="ghost">Documentation</Button><Button variant="primary">Filter Alberta Region</Button></>} />
    <section className="mx-auto max-w-[760px] px-8 pt-16 pb-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-neutral-100"><CircleHelp className="size-7 text-neutral-300" strokeWidth={1.5} /></div>
      <h1 className="mt-6 font-mono text-[22px] font-bold">Good morning, {USER.firstName}</h1>
      <p className="mx-auto mt-3 max-w-[400px] text-[14px] leading-relaxed text-neutral-500">We&apos;ve identified {signals.length} new project signals in the Alberta Water sector today. Select an opportunity from the list to begin triaging.</p>
      <div className="mt-10 grid gap-5 text-left sm:grid-cols-3">{stats.map((s) => <div key={s.label} className="rounded-lg border border-line bg-white p-5 shadow-sm">{s.icon}<div className="mt-3 font-mono text-[19px] font-bold">{s.value}</div><div className="font-mono text-[11px] uppercase tracking-wider text-neutral-600">{s.label}</div><p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{s.note}</p></div>)}</div>
      <div className="mt-12 text-left"><h2 className="label !text-neutral-600">Recent Activity</h2><ul className="mt-4 space-y-4">{RECENT_ACTIVITY.map((a) => <li key={a.text} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.active ? "bg-brand" : "bg-neutral-300"}`} /><div><p className="text-[12.5px] text-ink">{a.text}</p><p className="text-[11.5px] text-neutral-500">{a.when}</p></div></li>)}</ul></div>
    </section>
  </>;
}
