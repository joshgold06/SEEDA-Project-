import { Opportunity } from "./data";
export type Tone = "Direct" | "Warm" | "Technical";
export const TONES: Tone[] = ["Direct", "Warm", "Technical"];
export type Draft = { subject: string; body: string; tone: Tone; updatedAt: number };

// A pitch angle is the one idea the message leads with. All four are things EPCMst/SEEDA already
// says about itself (the specialist network, SeeRem, heavy industrial EPC work); the angle only
// changes which one comes first.
export type AngleId = "specialist" | "schedule" | "field" | "heavy";
export const ANGLES: { id: AngleId; label: string; blurb: string }[] = [
  { id: "specialist", label: "Fill the expertise gap", blurb: "Short-term specialists for what the team lacks" },
  { id: "schedule", label: "Protect the schedule", blurb: "Extra capacity fast, without a long hire" },
  { id: "field", label: "Field data (SeeRem)", blurb: "Real-time, auditable data during execution" },
  { id: "heavy", label: "Heavy industrial EPC", blurb: "Track record on large industrial projects" },
];
export const DEFAULT_ANGLE: AngleId = "specialist";

export const OWNER_UNNAMED = "Not identified in headline";
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const subjectName = (o: Opportunity) => (o.owner && o.owner !== OWNER_UNNAMED && o.owner !== "Unknown owner" ? o.owner : null);

function angleParagraph(angle: AngleId, serviceLine: string): string {
  switch (angle) {
    case "schedule":
      return `Projects at this stage often need extra hands in a short window. SEEDA's EPCMst network places pre-vetted specialists quickly, for a defined stretch of work, so your core team keeps its schedule without hiring for a role that is only needed for a few months. We have experience in ${serviceLine}.`;
    case "field":
      return `We run SeeRem, our own platform that gives project owners real-time, auditable field data during execution, backed by the pre-vetted specialists in SEEDA's EPCMst network. It is meant to sit alongside the team you already have. We have experience in ${serviceLine}.`;
    case "heavy":
      return `SEEDA has supported numerous heavy industrial EPC projects across North America and globally, and the EPCMst network lets us bring that experience to a team as short-term, targeted specialist input. We have experience in ${serviceLine}.`;
    default:
      return `SEEDA's EPCMst network connects project teams with pre-vetted specialists for short-term, targeted input. It is meant for teams that already cover most of what they need and want the remaining expertise without a long engagement. We have experience in ${serviceLine}.`;
  }
}

/** Two subject lines to choose between: one leads with the benefit, the other asks a question. */
export function subjectOptions(o: Opportunity, angle: AngleId = DEFAULT_ANGLE): { a: string; b: string } {
  if (o.type !== "News") return { a: `Interest in ${o.title}`, b: `Quick question about ${clip(o.title, 30)}` };
  const who = subjectName(o);
  const target = who ? `${who}'s work` : "your project";
  const a = {
    specialist: `Specialist support for ${target}`,
    schedule: who ? `Short-term specialist capacity for ${who}` : "Short-term specialist capacity for your project",
    field: who ? `Real-time field data for ${who}` : "Real-time field data for your project",
    heavy: who ? `Heavy industrial EPC experience for ${who}` : "Heavy industrial EPC experience for your project",
  }[angle];
  return { a, b: `Quick question about ${clip(o.fullTitle ?? o.title, 30)}` };
}

export function generateDraft(o: Opportunity, senderName: string, tone: Tone = "Warm", angle: AngleId = DEFAULT_ANGLE, recipient?: string): Draft {
  // News leads: the pitch is short-term specialist expertise for a team's remaining
  // knowledge gap (the EPCMst model), aimed at people on the project, not a bid.
  if (o.type === "News") {
    const project = o.fullTitle ?? o.title;
    const opening = tone === "Direct" ? "I am reaching out about" : tone === "Technical" ? "I wanted to connect about the technical side of" : "I hope you are well. I am reaching out about";
    const who = recipient ?? o.contactRole;
    const body = `Hello${who ? ` ${who}` : ""},\n\n${opening} a recent news report: "${project}".\n\n${angleParagraph(angle, o.serviceLine ?? "engineering, procurement and construction")}\n\nWould you be open to a short conversation about where outside specialist input could help?\n\nBest,\n${senderName}`;
    return { tone, subject: subjectOptions(o, angle).a, body, updatedAt: Date.now() };
  }
  const greeting = tone === "Direct" ? "I am reaching out regarding" : tone === "Technical" ? "I wanted to connect about the technical scope for" : "I hope you are well. I am reaching out regarding";
  return { tone, subject: subjectOptions(o, angle).a, body: `Hello ${recipient ?? o.contactRole ?? o.owner},\n\n${greeting} the ${o.title} opportunity (${o.ref}). Our team has relevant experience in ${o.serviceLine ?? "municipal water and wastewater infrastructure"}, and we would welcome a short conversation about how we could support the next phase.\n\nWould you be open to a 20-minute technical brief next week?\n\nBest,\n${senderName}`, updatedAt: Date.now() };
}

export const LINKEDIN_NOTE_LIMIT = 300;

/** A connection request is capped at 300 characters, so this stays short and never runs over. */
export function linkedInNote(o: Opportunity, senderName: string, angle: AngleId = DEFAULT_ANGLE, recipient?: string): string {
  const line = {
    specialist: "I work with EPCMst, which places pre-vetted specialists on projects for short-term gaps.",
    schedule: "EPCMst places pre-vetted specialists quickly for short stretches of project work.",
    field: "SEEDA runs SeeRem, a platform for real-time, auditable field data.",
    heavy: "SEEDA has supported heavy industrial EPC projects across North America.",
  }[angle];
  const signOff = senderName.toLowerCase().startsWith("the ") ? "" : ` ${senderName.trim().split(/\s+/)[0]}`;
  const note = `Hi${recipient ? ` ${recipient}` : ""}, I saw this news: "${clip(o.title, 70)}". ${line} Glad to connect.${signOff}`;
  return clip(note, LINKEDIN_NOTE_LIMIT);
}

export function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
export function insertReference(body: string, sentence: string) { const marker = "\n\nWould you be open"; return body.includes(sentence) ? body : body.replace(marker, `\n\n${sentence}${marker}`); }
export function timeAgo(timestamp: number) { const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }
