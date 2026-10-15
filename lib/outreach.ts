import { Opportunity } from "./data";
export type Tone = "Direct" | "Warm" | "Technical";
export const TONES: Tone[] = ["Direct", "Warm", "Technical"];
export type Draft = { subject: string; body: string; tone: Tone; updatedAt: number };
export function generateDraft(o: Opportunity, senderName: string, tone: Tone = "Warm"): Draft {
  // News leads: the pitch is short-term specialist expertise for a team's remaining
  // knowledge gap (the EPCMst model), aimed at people on the project, not a bid.
  if (o.type === "News") {
    const project = o.fullTitle ?? o.title;
    const ownerKnown = o.owner !== "Not identified in headline";
    const opening = tone === "Direct" ? "I am reaching out about" : tone === "Technical" ? "I wanted to connect about the technical side of" : "I hope you are well. I am reaching out about";
    const subject = ownerKnown ? `Specialist support for ${o.owner}'s work` : "Specialist support for your project";
    const body = `Hello${o.contactRole ? ` ${o.contactRole}` : ""},\n\n${opening} a recent news report: "${project}".\n\nSEEDA's EPCMst network connects project teams with pre-vetted specialists for short-term, targeted input. It is meant for teams that already cover most of what they need and want the remaining expertise without a long engagement. We have experience in ${o.serviceLine ?? "engineering, procurement and construction"}.\n\nWould you be open to a short conversation about where outside specialist input could help?\n\nBest,\n${senderName}`;
    return { tone, subject, body, updatedAt: Date.now() };
  }
  const greeting = tone === "Direct" ? "I am reaching out regarding" : tone === "Technical" ? "I wanted to connect about the technical scope for" : "I hope you are well. I am reaching out regarding";
  return { tone, subject: `Interest in ${o.title}`, body: `Hello ${o.contactRole ?? o.owner},\n\n${greeting} the ${o.title} opportunity (${o.ref}). Our team has relevant experience in ${o.serviceLine ?? "municipal water and wastewater infrastructure"}, and we would welcome a short conversation about how we could support the next phase.\n\nWould you be open to a 20-minute technical brief next week?\n\nBest,\n${senderName}`, updatedAt: Date.now() };
}
export function insertReference(body: string, sentence: string) { const marker = "\n\nWould you be open"; return body.includes(sentence) ? body : body.replace(marker, `\n\n${sentence}${marker}`); }
export function timeAgo(timestamp: number) { const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }
