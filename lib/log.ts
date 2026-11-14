// Server-side log lines for failures of an outside service. The person sees a short, friendly message; the log keeps the
// full detail (which service, the status it answered with, and the first part of what it said) so a failure can be traced.
// Never pass a key or a person's text in here.

export function logServiceFailure(service: string, detail: { status?: number; model?: string; reason: string; body?: string }) {
  console.error(
    `EPCMst: ${service} failed.`,
    JSON.stringify({ ...detail, body: detail.body?.replace(/\s+/g, " ").slice(0, 300) })
  );
}
