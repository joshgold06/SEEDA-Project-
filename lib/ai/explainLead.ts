import { formatMoney } from "../leads/extract";
import { OWNER_NOT_NAMED, type OpportunityRow } from "../supabase/mappers";
import { explainRecord, type Explained } from "./explain";

/** Reads one saved lead and has the AI summarise its own record text. Shared by the Explain button and the daily run. */
export function explainSavedLead(lead: OpportunityRow, opts: { apiKey: string; model?: string }): Promise<Explained> {
  const org = Array.isArray(lead.organizations) ? lead.organizations[0] : lead.organizations;
  const owner = org?.name && org.name !== OWNER_NOT_NAMED ? org.name : lead.involved?.primary && lead.involved.primary !== OWNER_NOT_NAMED ? lead.involved.primary : undefined;
  return explainRecord(
    {
      title: lead.full_title ?? lead.title,
      kind: lead.type,
      location: lead.location,
      owner,
      // The saved overview holds the record's own description; a news lead has only its headline.
      text: [lead.overview, lead.value ? `Stated value: ${formatMoney(Number(lead.value))}` : null, lead.deadline_text].filter(Boolean).join(" "),
    },
    opts
  );
}
