// How many times one person may use each AI-backed feature in a rolling 24 hours. The API routes enforce these and
// the Settings page shows them, so the number a person sees is the number that is applied.
export const DAILY_LIMITS = { research: 25, explain: 30, email: 20 } as const;
