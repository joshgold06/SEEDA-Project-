import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. A client that uses the project's service-role key, which bypasses the row-level security rules.
// It is for the scheduled run and for writing triggers and prepared summaries, which no signed-in person may write
// themselves. The key lives in an environment variable without the NEXT_PUBLIC_ prefix, so the browser never gets it.
// Never import this file from a component or a page.
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
