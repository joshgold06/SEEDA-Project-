import { z } from "zod";
import { SIGNAL_TYPES, WESTERN_REGIONS } from "./taxonomy";

// The "Lead Data Validation Gate" from the company's scope: every candidate lead
// must pass this before it can enter the pipeline. Regional constraint and
// required industry tag are enforced here, not left to the UI.
export const LeadSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(10, "Headline is too short to be a project signal").max(300),
  sourceUrl: z.url("Source link is not a valid URL"),
  publisher: z.string().min(1, "Publisher is missing"),
  publishedAt: z.iso.datetime({ error: "Publish date is invalid" }),
  region: z.enum(WESTERN_REGIONS, { error: "Not located in Alberta" }),
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
  reasons: z.array(z.object({ text: z.string(), kind: z.enum(["match", "constraint"]) })),
});

export type Lead = z.infer<typeof LeadSchema>;

// Leads below this score pass validation but are not worth a BD person's time.
export const MIN_SCORE = 40;
