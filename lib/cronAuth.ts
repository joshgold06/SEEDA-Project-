import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/service";

// Shared by the scheduled routes. Vercel Cron calls them with GET and sends the CRON_SECRET as a bearer token.

/** Returns the service client when the call is allowed, or the response to send when it is not. */
export function authoriseCron(request: Request): { admin: SupabaseClient } | { response: Response } {
  // A stray space, line break or pair of quote marks pasted into the hosting settings is easy to miss, so they are ignored.
  const secret = process.env.CRON_SECRET?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!secret || secret.length < 16) {
    return { response: Response.json({ error: "CRON_SECRET is not set (or is shorter than 16 characters)." }, { status: 503 }) };
  }
  const given = Buffer.from((request.headers.get("authorization") ?? "").trim());
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { response: Response.json({ error: "Not allowed." }, { status: 401 }) };
  }
  const admin = createServiceClient();
  if (!admin) return { response: Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 }) };
  return { admin };
}
