"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Bot, Check, CircleAlert, Loader2, Mail, Wand2 } from "lucide-react";
import { Button } from "@/components/ui";
import { fillSender } from "@/lib/agent/judge";
import { requestPrepare, usePrepFeed } from "@/lib/agent/client";
import type { PrepRow } from "@/lib/agent/types";
import { useAuth } from "@/lib/AuthContext";
import type { Opportunity } from "@/lib/data";
import { timeAgo } from "@/lib/outreach";
import { NO_ACCEPTED } from "@/lib/research/types";
import { useSettings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const dismissedKey = (userId: string) => `epcmst-prep-dismissed:${userId}`;
function readDismissed(userId: string): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(dismissedKey(userId)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Leads the prep agent has already researched and drafted an email for. It checked each was not a duplicate, read the web
 * and wrote a draft; it sent nothing. The person reads it and decides: "Review in Outreach Studio" copies the research
 * and the draft into their own account and opens it.
 */
export function ReadyForReview() {
  const router = useRouter();
  const { session, user, profile } = useAuth();
  const { settings } = useSettings();
  const { opportunities, update, saveDraft, setResearch, researchFor } = useStore();
  const feed = usePrepFeed();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const userId = user?.id;
  const hidden = dismissed ?? (userId && typeof window !== "undefined" ? readDismissed(userId) : []);
  const senderName = settings.outreach.signature.trim() || profile?.name || "the SEEDA team";
  const byId = useMemo(() => new Map(opportunities.map((o) => [o.id, o])), [opportunities]);

  // Only leads this person can see, has not dismissed here, and is not already contacting.
  const items = feed.ready
    .map((prep) => ({ prep, lead: byId.get(prep.opportunityId) }))
    .filter((x): x is { prep: PrepRow; lead: Opportunity } => Boolean(x.lead) && !hidden.includes(x.prep.opportunityId) && x.lead!.stage !== "outreach" && x.lead!.stage !== "pipeline" && !x.lead!.dismissed);

  async function prepareNext() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    const outcome = await requestPrepare(session.access_token);
    setBusy(false);
    setMessage(outcome.ok ? { text: outcome.message, error: false } : { text: outcome.error, error: true });
    if (outcome.ok && outcome.prepared) feed.reload();
  }

  function dismiss(id: string) {
    if (!userId) return;
    const next = [...new Set([...hidden, id])];
    setDismissed(next);
    try {
      window.localStorage.setItem(dismissedKey(userId), JSON.stringify(next));
    } catch {
      // not remembered; it comes back next visit
    }
  }

  async function open(prep: PrepRow, lead: Opportunity) {
    if (!userId) return;
    setOpening(prep.opportunityId);
    // The research is copied into this person's own account, nothing accepted yet, so they confirm each finding themselves.
    if (prep.findings && !researchFor(lead.id) && supabase) {
      const now = new Date();
      const { error } = await supabase
        .from("lead_research")
        .upsert({ user_id: userId, opportunity_id: lead.id, findings: prep.findings, accepted: NO_ACCEPTED, dismissed: [], researched_at: now.toISOString() }, { onConflict: "user_id,opportunity_id" });
      if (!error) setResearch({ opportunityId: lead.id, doc: prep.findings, accepted: NO_ACCEPTED, dismissed: [], researchedAt: now.getTime() });
    }
    if (prep.draft) saveDraft(lead.id, { subject: fillSender(prep.draft.subjectA, senderName), body: fillSender(prep.draft.body, senderName), tone: prep.draft.tone, updatedAt: Date.now() });
    if (lead.stage !== "pipeline") update(lead.id, { stage: "outreach" });
    router.push(`/shortlist/${lead.id}`);
  }

  if (!feed.available) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[560px]">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Bot className="size-4 text-brand-dark" aria-hidden />
            Prepared for you
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
            The prep agent picks the best new leads, checks each one is not a duplicate of a project already being worked, reads the web about it and drafts an email. <strong>It never sends anything.</strong> You read it and decide.
          </p>
        </div>
        <Button onClick={prepareNext} disabled={busy || !session}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          {busy ? "Working… up to a minute" : "Prepare the next lead now"}
        </Button>
      </div>

      {message && (
        <p role="status" className={`rounded-lg border p-3 text-[12.5px] ${message.error ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-neutral-50 text-neutral-700"}`}>
          {message.text}
        </p>
      )}

      {feed.loading ? (
        <p className="text-[12.5px] text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-line bg-neutral-50 p-4 text-[12.5px] text-neutral-600">
          Nothing is waiting for review. The agent prepares a few leads a day, and you can ask for the next one with the button.
          {feed.skipped > 0 && ` It has skipped ${feed.skipped} lead${feed.skipped === 1 ? "" : "s"} so far (duplicates, or nothing found on the web).`}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(({ prep, lead }) => {
            const owner = prep.findings?.findings.find((f) => f.kind === "owner");
            const contractors = prep.findings?.findings.filter((f) => f.kind === "contractor") ?? [];
            return (
              <li key={prep.opportunityId} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 font-mono text-[15px] font-bold text-brand-dark">{lead.score}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/scan/${lead.id}`} className="text-[13.5px] font-medium underline-offset-2 hover:underline">
                      {lead.fullTitle ?? lead.title}
                    </Link>
                    <p className="mt-0.5 text-[11.5px] text-neutral-500">
                      {lead.location} · prepared {timeAgo(new Date(prep.finishedAt ?? prep.createdAt).getTime())}
                    </p>

                    <p className="mt-3 text-[12.5px] leading-relaxed">
                      <strong>Owner:</strong> {owner?.name ?? "not found"} · <strong>Contractors:</strong> {contractors.length ? contractors.slice(0, 3).map((c) => c.name).join(", ") : "none found"}
                      {prep.draft?.recipient && (
                        <>
                          {" "}
                          · <strong>Write to:</strong> {prep.draft.recipient.name}
                          {prep.draft.recipient.role ? `, ${prep.draft.recipient.role}` : ""}
                        </>
                      )}
                    </p>

                    <details className="mt-3 rounded border border-line bg-neutral-50 p-3 text-[12px]">
                      <summary className="cursor-pointer font-medium">What the agent did ({prep.steps.length} steps)</summary>
                      <ul className="mt-2 space-y-1.5">
                        {prep.steps.map((s) => (
                          <li key={s.step} className="flex items-start gap-2">
                            {s.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />}
                            <span>
                              <strong>{s.step}.</strong> {s.note}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>

                    {prep.draft ? (
                      <details className="mt-2 rounded border border-line bg-neutral-50 p-3 text-[12px]">
                        <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                          <Mail className="size-3.5" aria-hidden /> Drafted email
                        </summary>
                        <p className="mt-2 font-medium">Subject: {prep.draft.subjectA}</p>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{fillSender(prep.draft.body, senderName)}</p>
                      </details>
                    ) : (
                      <p className="mt-2 text-[12px] text-neutral-500">No email was drafted. Use “Write with AI” in the Outreach Studio.</p>
                    )}

                    <p className="mt-3 text-[11.5px] text-warn">Drafted from web research nobody has confirmed yet. Check each source on the lead page before you send. Nothing has been sent.</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => void open(prep, lead)} disabled={opening === prep.opportunityId}>
                        {opening === prep.opportunityId ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Review in Outreach Studio
                      </Button>
                      <Button onClick={() => dismiss(prep.opportunityId)}>Not now</Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
