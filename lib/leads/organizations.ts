import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnerType = "Private" | "Public" | "Unclear";

/**
 * Makes sure each company has exactly one row in organizations and returns name -> id.
 * Existing rows are left alone (ignoreDuplicates), so a company is never stored twice.
 */
export async function ensureOrganizations(
  supabase: SupabaseClient,
  orgs: { name: string; owner_type: OwnerType }[]
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (!orgs.length) return byName;

  await supabase.from("organizations").upsert(orgs, { onConflict: "name", ignoreDuplicates: true });
  const { data } = await supabase.from("organizations").select("id,name").in("name", orgs.map((o) => o.name));
  for (const row of (data ?? []) as { id: string; name: string }[]) byName.set(row.name, row.id);
  return byName;
}
