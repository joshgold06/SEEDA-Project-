import { z } from "zod";
import { ACTIVE_REGION_SENTENCE, REGIONS, SIGNAL_TYPES } from "./taxonomy";

// The "Lead Data Validation Gate" from the company's scope: every candidate lead
// must pass this before it can enter the pipeline. Regional constraint and
// required industry tag are enforced here, not left to the UI.
export const LeadSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(10, "Headline is too short to be a project signal").max(300),
  sourceUrl: z.url("Source link is not a valid URL"),
  publisher: z.string().min(1, "Publisher is missing"),
  publishedAt: z.iso.datetime({ error: "Publish date is invalid" }),
  region: z.enum(REGIONS, { error: `Not located in ${ACTIVE_REGION_SENTENCE}` }),
  location: z.string().min(2),
  organization: z.string().min(1),
  organizationKnown: z.boolean(),
  ownerType: z.enum(["Private", "Public", "Unclear"]),
  contractors: z.array(z.string()),
  industryTags: z.array(z.string()).min(1, "No industry tag matched (energy, mining, water or infrastructure)"),
  signalType: z.enum(SIGNAL_TYPES, { error: "No project signal found in the headline" }),
  keywords: z.array(z.string()),
  score: z.number().int().min(0).max(100),
  estimatedValue: z.number().positive().optional(),
  // Where the lead came from. Headlines are "News"; the rest are official registers (see lib/leads/official).
  origin: z.enum(["News", "Regulatory", "Permit"]).default("News"),
  // Only official records carry this: the register's own wording for the detail page.
  detail: z
    .object({
      overview: z.string(),
      stage: z.string(),
      stageNote: z.string(),
      documentName: z.string(),
      /** "Posted Sep 15", or the register's own wording when it gives no date. */
      timing: z.string(),
      dateLine: z.string(),
      sizeNote: z.string().optional(),
    })
    .optional(),
  reasons: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(["match", "constraint"]),
      factor: z.enum(["region", "signal", "keywords", "recency", "value", "contractor", "owner"]).optional(),
      points: z.number().optional(),
    })
  ),
});

export type Lead = z.infer<typeof LeadSchema>;

// Leads below this score pass validation but are not worth a BD person's time.
export const MIN_SCORE = 40;
