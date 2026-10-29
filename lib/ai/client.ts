import type { AngleId, Tone } from "../outreach";

export interface AiEmail {
  subjectA: string;
  subjectB: string;
  body: string;
  linkedinNote: string;
}

export type AiEmailOutcome = { ok: true; email: AiEmail } | { ok: false; error: string; code?: string };

export async function requestAiEmail(
  token: string,
  payload: { opportunityId: string; angle: AngleId; tone: Tone; senderName: string; recipientContactId?: string; instruction?: string; currentBody?: string }
): Promise<AiEmailOutcome> {
  try {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "The AI draft failed.", code: data.code };
    return { ok: true, email: data as AiEmail };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
