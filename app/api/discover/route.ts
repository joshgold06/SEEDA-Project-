import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ingest, IngestError } from "@/lib/leads/ingest";
import { findPreset, resolveQuery } from "@/lib/leads/presets";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  presetId: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
  assignee: z.string().max(3).optional(),
});

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  // Only signed-in users may trigger searches, so the endpoint can't be used anonymously.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to run a search." }, { status: 401 });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That search request wasn't understood." }, { status: 400 });
  const official = findPreset(body.data.presetId)?.official;
  const query = official ? null : resolveQuery(body.data.presetId, body.data.query);
  if (!official && !query) return Response.json({ error: "Choose a search or type one." }, { status: 400 });

  try {
    // The person's own client does the saving, so row-level security still decides what they may change. The service
    // client only records the triggers the scan notices; without it the scan works exactly as before.
    const result = await ingest(official ? { official } : { query: query! }, {
      db: supabase,
      admin: createServiceClient(),
      discoveredBy: userData.user.id,
      assignee: body.data.assignee?.trim() || "U",
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof IngestError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
