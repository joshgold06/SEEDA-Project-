"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers } from "lucide-react";
import { TopBar, Breadcrumbs } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function ShortlistIndex() {
  const { opportunities } = useStore();
  const router = useRouter();
  const first = opportunities.find((o) => o.stage === "outreach") ?? opportunities.find((o) => o.stage);
  useEffect(() => { if (first) router.replace(`/shortlist/${first.id}`); }, [first, router]);
  return <><TopBar left={<Breadcrumbs items={[{ label: "Shortlist" }]} />} />{!first && <div className="mx-auto mt-32 max-w-sm text-center"><Layers className="mx-auto size-8 text-neutral-300" /><p className="mt-4 text-sm text-neutral-600">Your shortlist is empty. Shortlist an opportunity from the <Link href="/scan" className="font-medium text-brand-dark underline">Morning Scan</Link>.</p></div>}</>;
}
