// Checks the prep agent's rules in lib/agent/judge.ts: which leads qualify, when a duplicate stops a lead, who a draft is
// addressed to, and when a drafted email is thrown away. These rules are plain code, so they hold whatever the AI writes.
//
// Run with:  node scripts/check-agent-rules.mjs   (Node 22.18 or newer, which runs .ts files directly)

import assert from "node:assert/strict";
import { draftProblems, fillSender, hasSomethingToAct, isCandidate, isFinanceRole, isSetAside, judgeTwins, MIN_SCORE, pickRecipient, projectPeople, sameDeal, SENDER_TOKEN, SET_ASIDE_HOURS, SET_ASIDE_STEP, shouldClearWorking } from "../lib/agent/judge.ts";
import { withoutFederalOttawa } from "../lib/leads/federal.ts";

// --- Which leads qualify -----------------------------------------------------------------
const lead = { type: "News", inScan: true, dismissed: false, score: 70 };
assert.equal(isCandidate(lead), true);
assert.equal(isCandidate({ ...lead, type: "Regulatory" }), true);
assert.equal(isCandidate({ ...lead, type: "Tender" }), false, "tenders are not researched");
assert.equal(isCandidate({ ...lead, type: "Permit" }), false, "permits are not researched");
assert.equal(isCandidate({ ...lead, score: MIN_SCORE - 1 }), false, "a weak lead is not worth the searches");
assert.equal(isCandidate({ ...lead, score: MIN_SCORE }), true);
assert.equal(isCandidate({ ...lead, inScan: false }), false);
assert.equal(isCandidate({ ...lead, dismissed: true }), false);

// --- Duplicates: the same company must not be approached twice about one project ---------
const a = { id: "a", title: "Yellowhead pipeline begins" };
const b = { id: "b", title: "ATCO breaks ground on Yellowhead" };
assert.equal(judgeTwins([], new Set(), new Set()), null, "no twins: go ahead");
assert.deepEqual(judgeTwins([a], new Set(), new Set(["a"])), { twin: a, why: "being_contacted" });
assert.deepEqual(judgeTwins([a], new Set(["a"]), new Set()), { twin: a, why: "already_prepared" });
assert.equal(judgeTwins([a, b], new Set(["a"]), new Set(["b"])).why, "being_contacted", "being contacted outranks already prepared");
assert.equal(judgeTwins([a], new Set(["zzz"]), new Set(["yyy"])), null, "an unrelated lead being worked does not block");

// --- The same company and dollar figure is one project, wherever it was filed ------------
const sunrise = { owner: "Enbridge", title: "Ottawa approves Enbridge's $4B Sunrise natural gas pipeline expansion project", value: 4e9 };
const begins = { owner: "Enbridge", title: "Construction begins on $4-billion Enbridge natural gas pipeline expansion in B.C.", value: 4e9 };
assert.equal(sameDeal(sunrise, begins), true, "the real case that was missed");
assert.equal(sameDeal(sunrise, { ...begins, owner: "" }), true, "the headline names the company");
assert.equal(sameDeal({ ...sunrise, owner: "" }, begins), true);
assert.equal(sameDeal(sunrise, { ...begins, owner: "Enbridge Inc." }), true);
assert.equal(sameDeal(sunrise, { ...begins, value: 4.1e9 }), true, "within 5 percent");
assert.equal(sameDeal(sunrise, { ...begins, value: 2.9e9 }), false, "a different figure");
assert.equal(sameDeal(sunrise, { ...begins, value: undefined }), false, "no figure");
assert.equal(sameDeal(sunrise, { owner: "TC Energy", title: "TC Energy plans $4B line", value: 4e9 }), false, "a different company");
assert.equal(sameDeal({ ...sunrise, value: 5e7 }, { ...begins, value: 5e7 }), false, "a small figure is too common");
assert.equal(sameDeal({ ...sunrise, owner: "" }, { ...begins, owner: "" }), false, "no company named at all");
assert.equal(sameDeal({ owner: "Energy", title: "A $4B plan", value: 4e9 }, { owner: "Energy", title: "B $4B plan", value: 4e9 }), false, "a generic word is not a company");

// --- "Ottawa" meaning the federal government is not a location ---------------------------
const ontarioCity = (t) => /\bottawa\b/i.test(withoutFederalOttawa(t));
for (const t of [
  "Ottawa approves Enbridge's $4B Sunrise natural gas pipeline expansion project",
  "Ottawa supplying $200M for B.C.'s Woodfibre LNG project",
  "Ottawa to fast-track nuclear project",
  "Ottawa has formally approved the mine",
  "Ottawa and Alberta sign pipeline accord",
  "Ottawa-Alberta deal clears way for pipeline",
  "LNG expansion wins approval from Ottawa",
  "Ottawa’s approval of the Kitimat terminal",
]) assert.equal(ontarioCity(t), false, `government: ${t}`);
for (const t of ["Ottawa Hospital campus construction begins", "New $2B transit line planned for downtown Ottawa", "Ottawa city council approves tower", "Ottawa airport terminal expansion", "Aecon wins Ottawa LRT contract"]) {
  assert.equal(ontarioCity(t), true, `the city: ${t}`);
}

// --- Who the email is for ----------------------------------------------------------------
const acme = { owner: "Acme Mining Ltd.", contractors: [] };
const person = (name, role, company = "Acme Mining") => ({ kind: "person", name, role, company, evidence: `${name} spoke about the project.`, id: name });
const pick = (people, lead = acme) => pickRecipient(people, lead)?.name ?? null;
assert.equal(pick([]), null);
assert.equal(pick([{ kind: "owner", name: "Acme", evidence: "Acme owns it." }]), null, "owners and contractors are not people");
assert.equal(pick([person("Chris Chief", "Chief Executive Officer"), person("Pat Projects", "Vice President, Projects")]), "Pat Projects", "a project role beats the chief executive");
assert.equal(pick([person("Sam Chair", "Chairman"), person("Lee Safe", "Safety Advisor")]), "Lee Safe", "a named role beats a chairman");
assert.equal(pick([person("Kim Pres", "President"), person("Ann Anon", undefined)]), "Kim Pres", "a role beats none");
assert.equal(pick([person("Only Ceo", "CEO")]), "Only Ceo", "a chief executive is still chosen when nobody else is named");
assert.equal(pick([person("Vee Pee", "Vice President"), person("Pres Ident", "President")]), "Vee Pee", "a vice president is not treated as top level");

// --- Only people who belong to the project ----------------------------------------------
// The real LNG Canada result: an investment commentator must not be chosen.
const lng = { owner: "LNG Canada", contractors: [] };
const lngFindings = [
  { kind: "owner", name: "LNG Canada", evidence: "LNG Canada is going ahead with its Phase 2 expansion project in Kitimat." },
  { kind: "contractor", name: "Fluor Corporation", evidence: "FEED Contractor JGC Corporation + Fluor Corporation JV" },
  person("Ryan Iverson", "Portfolio Manager", "CEM"),
  person("Cederic Cremers", "integrated gas president", "Shell"),
];
assert.equal(pickRecipient(lngFindings, lng), null, "neither the commentator nor an unlisted company is chosen: the project team is addressed");
assert.deepEqual(projectPeople(lngFindings, lng).leftOut.map((p) => p.name), ["Ryan Iverson", "Cederic Cremers"]);
assert.equal(pick([...lngFindings, person("Faye Fluor", "Project Director", "Fluor")], lng), "Faye Fluor", "someone at a contractor belongs");
// The real Highland Valley result: Fluor was not listed as a contractor, but the owner's sentence says it was awarded the work.
const teck = [
  { kind: "owner", name: "Teck Resources Limited", evidence: "Teck Resources Limited (Teck) has awarded Fluor the Highland Valley Copper Mine Life Extension project." },
  person("Harish Jammula", "President of Fluor's Mining & Metals business", "Fluor"),
];
assert.equal(pick(teck, { owner: "Teck", contractors: [] }), "Harish Jammula", "a company named in the owner's sentence belongs");
assert.equal(pick([...teck.slice(0, 1), person("Out Sider", "Director", "Some Consultancy")], { owner: "Teck", contractors: [] }), null);
assert.equal(pick([person("Gen Eric", "Director", "Energy")], { owner: "Pembina Energy", contractors: [] }), null, "a generic word is not a company");
assert.equal(pick([{ ...person("No Company", "Manager", undefined), company: undefined, evidence: "No Company, a manager at Acme Mining, said so." }]), "No Company", "without a company the sentence must name the owner");
assert.equal(pick([{ ...person("No Link", "Manager", undefined), company: undefined, evidence: "No Link said it is exciting." }]), null);
for (const role of ["Portfolio Manager", "Investment Analyst", "Chief Investment Officer", "Economist", "Investor Relations"]) {
  assert.equal(isFinanceRole(role), true, role);
  assert.equal(pick([person("Fin Ance", role)]), null, `${role} is not written to`);
}
assert.equal(isFinanceRole("Project Manager"), false);

// --- A failed lead is set aside, so it cannot block the queue ---------------------------
const now = Date.parse("2026-11-26T12:00:00Z");
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
const setAside = [{ step: "Picked the lead" }, { step: SET_ASIDE_STEP }];
const midRun = [{ step: "Picked the lead" }];
assert.equal(isSetAside(setAside), true);
assert.equal(isSetAside(midRun), false);
assert.equal(isSetAside(null), false);
assert.equal(shouldClearWorking({ created_at: ago(2), steps: midRun }, now), false, "a run in progress is left alone");
assert.equal(shouldClearWorking({ created_at: ago(11), steps: midRun }, now), true, "a crashed run is cleared soon");
assert.equal(shouldClearWorking({ created_at: ago(11), steps: setAside }, now), false, "a set-aside lead is not retried straight away");
assert.equal(shouldClearWorking({ created_at: ago(23 * 60), steps: setAside }, now), false);
assert.equal(shouldClearWorking({ created_at: ago(SET_ASIDE_HOURS * 60 + 1), steps: setAside }, now), true, "after a day it is tried again");

// --- Whether research found anything to act on ------------------------------------------
const owner = { kind: "owner", name: "Acme Mining", evidence: "Acme Mining owns it." };
assert.equal(hasSomethingToAct([], acme), false, "nothing found");
assert.equal(hasSomethingToAct([owner], acme), false, "an owner alone is not enough");
assert.equal(hasSomethingToAct([owner, { kind: "contractor", name: "Bird", evidence: "Bird builds it." }], acme), true, "a contractor is something to approach");
assert.equal(hasSomethingToAct([owner, person("Pat", "Director")], acme), true, "someone on the project is someone to write to");
assert.equal(hasSomethingToAct([owner, person("Ryan", "Portfolio Manager", "CEM")], acme), false, "an outside commentator is not enough");

// --- When a draft is thrown away ---------------------------------------------------------
const good = `Hi Pat,\n\nI saw the Cedar LNG project in a public regulatory listing and wanted to introduce myself. SEEDA connects project teams with pre-vetted specialists for short, targeted input, so a team that already covers most of what it needs can add the rest without a long engagement.\n\nWould you be open to a short call?\n\nBest,\n${SENDER_TOKEN}`;
assert.deepEqual(draftProblems(good), []);
assert.ok(draftProblems(good.replace(SENDER_TOKEN, "Josh")).some((p) => p.includes("not signed")), "an unsigned draft is rejected");
assert.ok(draftProblems(good.replace("Pat", "[Name]")).some((p) => p.includes("placeholder")));
assert.ok(draftProblems(good.replace("short call?", "short call!")).some((p) => p.includes("exclamation")));
assert.ok(draftProblems(good + " word".repeat(200)).some((p) => p.includes("longer than 180")));
assert.ok(draftProblems(`Hi\n\nBest,\n${SENDER_TOKEN}`).some((p) => p.includes("too short")));
// Today's two real openings, and close variants, are rejected.
for (const opening of ["I saw your name on the Highland Valley Copper project.", "I saw your name on a recent news report.", "I read that you are involved in the project.", "I noticed you are leading this work."]) {
  assert.ok(draftProblems(good.replace("I saw the Cedar LNG project in a public regulatory listing", opening)).some((p) => p.includes("saw the person")), opening);
}

// --- Signing -----------------------------------------------------------------------------
assert.equal(fillSender(`Best,\n${SENDER_TOKEN}`, "Josh"), "Best,\nJosh");
assert.equal(fillSender(`${SENDER_TOKEN} and ${SENDER_TOKEN}`, "Josh"), "Josh and Josh", "every occurrence is replaced");

console.log("agent rule checks passed");
