"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Plus, RefreshCw, WandSparkles } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Breadcrumbs, Button, TopBar } from "@/components/ui";
import { firstNameOf } from "@/lib/contacts";
import { PROJECT_REFERENCES, STAGES, Stage } from "@/lib/data";
import { useAuth } from "@/lib/AuthContext";
import { useStore } from "@/lib/store";
import { AngleId, ANGLES, DEFAULT_ANGLE, generateDraft, insertReference, LINKEDIN_NOTE_LIMIT, linkedInNote, subjectOptions, timeAgo, TONES, wordCount } from "@/lib/outreach";

const SUBJECT_SOFT_LIMIT = 55;

export default function OutreachDraft() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const senderName = profile?.name ?? "the SEEDA team";
  const { get, update, getDraft, saveDraft, contactsFor, loaded } = useStore();
  const opp = get(id);

  const [copied, setCopied] = useState<"email" | "linkedin" | null>(null);
  const [refMenu, setRefMenu] = useState(false);
  const [angle, setAngle] = useState<AngleId>(DEFAULT_ANGLE);
  const [previewTab, setPreviewTab] = useState<"email" | "linkedin">("email");
  const [recipientId, setRecipientId] = useState("");
  const [, tick] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const draftBody = opp ? getDraft(opp.id).body : "";
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 4}px`;
    }
  }, [draftBody]);

  const contacts = opp ? contactsFor(opp.id) : [];
  const recipient = contacts.find((c) => c.id === recipientId);
  const recipientFirst = recipient ? firstNameOf(recipient.name) : undefined;
  const subjects = useMemo(() => (opp ? subjectOptions(opp, angle) : { a: "", b: "" }), [opp, angle]);
  const note = opp ? linkedInNote(opp, senderName, angle, recipientFirst) : "";

  if (!opp && !loaded) return null;
  if (!opp) return <div className="p-10 text-sm text-neutral-600">Opportunity not found. <Link href="/shortlist" className="underline">Back to Shortlist</Link></div>;

  const draft = getDraft(opp.id);
  const set = (patch: Partial<typeof draft>) => saveDraft(opp.id, { ...draft, ...patch, updatedAt: Date.now() });
  const fullText = `Subject: ${draft.subject}\n\n${draft.body}`;
  const variant = draft.subject === subjects.a ? "a" : draft.subject === subjects.b ? "b" : "custom";
  const isNews = opp.type === "News";

  const copy = async (what: "email" | "linkedin") => {
    try {
      await navigator.clipboard.writeText(what === "email" ? fullText : note);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  // Rebuilds the message, keeping the chosen subject version (A or B). The old draft can be brought back.
  const rebuild = (next: { angle?: AngleId; tone?: typeof draft.tone; recipient?: string }, message: string) => {
    const previous = draft;
    const useAngle = next.angle ?? angle;
    const fresh = generateDraft(opp, senderName, next.tone ?? draft.tone, useAngle, next.recipient !== undefined ? next.recipient || undefined : recipientFirst);
    const wantsB = variant === "b";
    saveDraft(opp.id, wantsB ? { ...fresh, subject: subjectOptions(opp, useAngle).b } : fresh);
    toast.push({ message, onAction: () => saveDraft(opp.id, { ...previous, updatedAt: Date.now() }) });
  };

  const chooseAngle = (next: AngleId) => {
    if (next === angle) return;
    setAngle(next);
    rebuild({ angle: next }, `Switched the pitch to "${ANGLES.find((a) => a.id === next)?.label}"`);
  };

  const chooseRecipient = (nextId: string) => {
    setRecipientId(nextId);
    const person = contacts.find((c) => c.id === nextId);
    const greeting = person ? `Hello ${firstNameOf(person.name)},` : `Hello${opp.contactRole ? ` ${opp.contactRole}` : ""},`;
    // Only the greeting changes, so anything already edited in the message is kept.
    if (/^Hello[^\n]*,/.test(draft.body)) set({ body: draft.body.replace(/^Hello[^\n]*,/, greeting) });
  };

  const nextTone = () => rebuild({ tone: TONES[(TONES.indexOf(draft.tone) + 1) % TONES.length] }, "Changed the tone");
  const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const words = wordCount(draft.body);
  const toLabel = recipient ? `${recipient.name}${recipient.role ? `, ${recipient.role}` : ""}` : (opp.contactRole ?? opp.owner);

  return (
    <>
      <TopBar
        left={<Breadcrumbs back="/shortlist" items={[{ label: "Shortlist", href: "/shortlist" }, { label: "Outreach Studio" }]} />}
        right={
          <>
            <label className="mr-2 flex items-center gap-2">
              <span className="label !text-[10px] !text-neutral-600">Status:</span>
              <select value={opp.stage ?? "spotted"} onChange={(e) => update(opp.id, { stage: e.target.value as Stage })} className="h-[26px] rounded border border-line bg-surface px-2 text-[12px]">
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <Button variant="primary" onClick={() => copy("email")}>
              {copied === "email" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied === "email" ? "Copied" : "Copy to Clipboard"}
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1040px] px-8 py-10">
        <h1 className="font-mono text-[22px] font-bold">Outreach Studio</h1>
        <p className="mt-2 text-[13px] text-neutral-500">
          Built from the <strong className="font-semibold text-neutral-700">{opp.title}</strong> signal and your <strong className="font-semibold text-neutral-700">{opp.serviceLine ?? "core"}</strong> service line. Pick the angle, choose a subject line, and check how it will look before you send.
        </p>

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <div className="print-area overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-line bg-neutral-50 px-4 py-3.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span><span className="label !text-[9.5px] mr-2">From:</span><span className="font-medium">{senderName} ({profile?.email})</span></span>
                  <span><span className="label !text-[9.5px] mr-2">To:</span><span className="font-medium">{toLabel}</span></span>
                </div>
                <button onClick={() => rebuild({}, "Rebuilt the draft")} title="Regenerate draft" aria-label="Regenerate draft" className="no-print text-neutral-500 hover:text-ink"><RefreshCw className="size-3.5" /></button>
              </div>
              <div className="px-5 pt-5 pb-3">
                <label className="block">
                  <span className="label !text-[9.5px] !text-neutral-600">Subject</span>
                  <input value={draft.subject} onChange={(e) => set({ subject: e.target.value })} className="mt-1.5 w-full border-b border-line bg-transparent pb-2 text-[13px] font-medium outline-none focus:border-neutral-400" />
                </label>
                <textarea value={draft.body} onChange={(e) => set({ body: e.target.value })} ref={bodyRef} rows={12} aria-label="Message body" className="mt-4 w-full resize-y bg-transparent text-[13px] leading-[1.6] outline-none" />
              </div>
              <div className="no-print flex items-center justify-between border-t border-line bg-neutral-50 px-4 py-3 text-[12px]">
                <div className="flex items-center gap-5">
                  <button onClick={nextTone} className="flex items-center gap-1.5 text-neutral-700 hover:text-ink"><WandSparkles className="size-3.5" />Adjust Tone <span className="text-neutral-400">({draft.tone})</span></button>
                  <div className="relative">
                    <button onClick={() => setRefMenu((v) => !v)} className="flex items-center gap-1.5 text-neutral-700 hover:text-ink" aria-expanded={refMenu}><Plus className="size-3.5" />Add Experience Reference</button>
                    {refMenu && (
                      <ul className="absolute bottom-7 left-0 z-20 w-72 rounded-md border border-line bg-surface py-1 shadow-lg">
                        {PROJECT_REFERENCES.map((r) => (
                          <li key={r.id}><button onClick={() => { set({ body: insertReference(draft.body, r.sentence) }); setRefMenu(false); }} className="w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50">{r.label}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[10.5px] text-neutral-500 italic">Draft updated {timeAgo(draft.updatedAt)}</span>
              </div>
            </div>

            <section className="no-print rounded-lg border border-line bg-surface" aria-label="Live preview">
              <div className="flex items-center justify-between border-b border-line px-4 pt-3">
                <h2 className="pb-2 text-[13px] font-semibold">Live preview</h2>
                <div role="tablist" className="flex gap-1">
                  {([["email", "Email"], ["linkedin", "LinkedIn note"]] as const).map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={previewTab === key} onClick={() => setPreviewTab(key)} className={`-mb-px border-b-2 px-3 pb-2 text-[12px] font-medium transition-colors ${previewTab === key ? "border-brand text-brand-dark" : "border-transparent text-neutral-500 hover:text-ink"}`}>{label}</button>
                  ))}
                </div>
              </div>
              {previewTab === "email" ? (
                <div className="p-4">
                  <p className="label !text-[9.5px]">In their inbox</p>
                  <div className="mt-2 flex items-baseline gap-3 rounded-md border border-line bg-neutral-50 px-3 py-2 text-[12px]">
                    <span className="w-28 shrink-0 truncate font-semibold">{senderName}</span>
                    <span className="min-w-0 flex-1 truncate"><strong className="font-semibold">{draft.subject || "(no subject)"}</strong><span className="text-neutral-500"> – {draft.body.replace(/\s+/g, " ").slice(0, 90)}</span></span>
                  </div>
                  <p className="label mt-4 !text-[9.5px]">When they open it</p>
                  <div className="mt-2 rounded-md border border-line p-4">
                    <p className="text-[13px] font-semibold">{draft.subject || "(no subject)"}</p>
                    <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-neutral-700">
                      {draft.body.split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">{words} words · about {Math.max(5, Math.round((words / 220) * 60))} seconds to read</p>
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-[11.5px] leading-relaxed text-neutral-500">A shorter version for a LinkedIn connection request, which is capped at {LINKEDIN_NOTE_LIMIT} characters. It follows the pitch angle and the person you pick.</p>
                  <div className="mt-3 rounded-md border border-line bg-neutral-50 p-3.5 text-[13px] leading-relaxed">{note}</div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className={`font-mono text-[11px] ${note.length > LINKEDIN_NOTE_LIMIT - 20 ? "text-warn" : "text-neutral-500"}`}>{note.length} / {LINKEDIN_NOTE_LIMIT}</span>
                    <Button onClick={() => copy("linkedin")}>{copied === "linkedin" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied === "linkedin" ? "Copied" : "Copy note"}</Button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="no-print space-y-5">
            {isNews && (
              <section className="rounded-lg border border-line bg-surface p-4">
                <h2 className="label !text-neutral-600">Pitch angle</h2>
                <div role="radiogroup" aria-label="Pitch angle" className="mt-3 space-y-2">
                  {ANGLES.map((a) => (
                    <button key={a.id} role="radio" aria-checked={angle === a.id} onClick={() => chooseAngle(a.id)} className={`block w-full rounded-md border px-3 py-2 text-left transition-colors ${angle === a.id ? "border-brand bg-brand-soft" : "border-line hover:bg-neutral-50"}`}>
                      <span className={`block text-[12.5px] font-semibold ${angle === a.id ? "text-brand-dark" : ""}`}>{a.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{a.blurb}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label !text-neutral-600">Subject line A/B</h2>
              <div role="radiogroup" aria-label="Subject line" className="mt-3 space-y-2">
                {([["a", "A", subjects.a, "Leads with the benefit"], ["b", "B", subjects.b, "Asks a question"]] as const).map(([key, letter, text, hint]) => (
                  <button key={key} role="radio" aria-checked={variant === key} onClick={() => set({ subject: text })} className={`block w-full rounded-md border px-3 py-2 text-left transition-colors ${variant === key ? "border-brand bg-brand-soft" : "border-line hover:bg-neutral-50"}`}>
                    <span className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase"><span className={`grid size-4 place-items-center rounded-full text-[9px] ${variant === key ? "bg-brand text-white" : "bg-neutral-200 text-neutral-700"}`}>{letter}</span>{hint}</span>
                    <span className="mt-1 block text-[12.5px] leading-snug font-medium">{text}</span>
                    <span className={`mt-1 block font-mono text-[10px] ${text.length > SUBJECT_SOFT_LIMIT ? "text-warn" : "text-neutral-400"}`}>{text.length} characters{text.length > SUBJECT_SOFT_LIMIT ? ", may be cut off on a phone" : ""}</span>
                  </button>
                ))}
              </div>
              {variant === "custom" && <p className="mt-2 text-[11px] text-neutral-500">You edited the subject. Pick A or B to go back to a suggestion.</p>}
            </section>

            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="label !text-neutral-600">Writing to</h2>
              {contacts.length > 0 ? (
                <select value={recipientId} onChange={(e) => chooseRecipient(e.target.value)} aria-label="Who this is for" className="mt-3 h-9 w-full rounded border border-line bg-surface px-2 text-[12.5px]">
                  <option value="">No one in particular</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? `, ${c.role}` : ""}</option>)}
                </select>
              ) : (
                <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">Save people on this lead&rsquo;s page and you can address the message to one of them here.</p>
              )}
              <Link href={`/scan/${opp.id}`} className="mt-3 inline-block text-[11.5px] font-medium text-brand hover:underline">Open the project chain</Link>
            </section>

            <section className="rounded-lg bg-rail p-4 text-white">
              <p className="text-[12px] leading-relaxed text-white/75">Ready to send? Export this draft or copy the text directly to your email client.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="brand" className="h-[34px] text-[11.5px] uppercase" onClick={() => window.print()}>Export PDF</Button>
                <a href={mailto} onClick={() => opp.stage === "outreach" && update(opp.id, { stage: "pipeline", pipelineNote: "Outreach Sent", pipelineTime: "Sent just now" })} className="inline-flex h-[34px] items-center justify-center rounded bg-white/15 text-[11.5px] font-medium uppercase hover:bg-white/25">Send as Email</a>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
