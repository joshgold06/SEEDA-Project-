// Server side only. One place that talks to Google's Gemini API and asks for a JSON answer, used
// by both "Research this lead" and "Write with AI". The free Gemini models answer "high demand"
// (503) in bursts, so a busy model is skipped for the next one and the call is retried.

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: "not_configured" | "busy" | "failed"
  ) {
    super(message);
  }
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
const TOTAL_MS = 42_000;
const ONE_CALL_MS = 45_000;
const BUSY_STATUSES = new Set([429, 500, 503, 504, 404]);

export interface GeminiRequest {
  system: string;
  prompt: string;
  /** Gemini's response schema (upper-case type names). */
  schema: unknown;
  apiKey: string;
  model?: string;
}

export async function callGeminiJson({ system, prompt, schema, apiKey, model }: GeminiRequest): Promise<unknown> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: "application/json", response_schema: schema },
  });
  const models = [...new Set([model || DEFAULT_GEMINI_MODEL, ...FALLBACK_MODELS])];
  const deadline = Date.now() + TOTAL_MS;

  let res: Response | null = null;
  let timedOut = false;
  outer: for (let pass = 0; pass < 2; pass++) {
    for (const name of models) {
      const left = deadline - Date.now();
      if (left < 3000) break outer;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(Math.min(ONE_CALL_MS, left)),
          cache: "no-store",
        });
      } catch {
        timedOut = true;
        res = null;
        continue;
      }
      if (BUSY_STATUSES.has(res.status)) continue;
      break outer;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!res || BUSY_STATUSES.has(res.status)) {
    throw new GeminiError(timedOut && !res ? "The AI model didn't answer in time. Try again." : "The AI model is busy right now. Try again in a minute.", 503, "busy");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError("The AI service rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL.", 502, "not_configured");
  if (!res.ok) throw new GeminiError(`The AI model failed (${res.status}).`, 502, "failed");

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    promptFeedback?: { blockReason?: string };
  } | null;
  if (data?.promptFeedback?.blockReason) throw new GeminiError("The AI model declined this request.", 502, "failed");
  // Newer models may send their reasoning as separate parts flagged "thought"; only the answer is wanted.
  const text = data?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("The AI model returned nothing.", 502, "failed");
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new GeminiError("The AI model's answer couldn't be read.", 502, "failed");
  }
}
