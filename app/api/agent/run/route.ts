import { createClient } from "@supabase/supabase-js";
import { runAgent } from "@/lib/agent/prep";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { createServiceClient } from "@/lib/supabase/service";

// "Prepare the next lead now", for a signed-in person. It does exactly what the scheduled run does, for one lead, and is
// held by the same daily cap, so pressing the button cannot spend more of the free search and AI plans than the schedule.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to prepare a lead." }, { status: 401 });
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const tavily = process.env.TAVILY_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const admin = createServiceClient();
  if (!tavily || !gemini || !admin) {
    return Response.json({ error: "The prep agent isn't switched on yet: the server is missing a key. Add it in the hosting settings and redeploy.", code: "not_configured" }, { status: 503 });
  }

  const result = await runAgent(admin, { tavily, gemini, model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL }, { maxLeads: 1, startBeforeMs: 0 });
  return Response.json({ outcome: result.outcomes[0], seconds: result.seconds });
}
