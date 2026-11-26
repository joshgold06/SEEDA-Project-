// Checks the prep agent's rules in lib/agent/judge.ts: which leads qualify, when a duplicate stops a lead, who a draft is
// addressed to, and when a drafted email is thrown away. These rules are plain code, so they hold whatever the AI writes.
//
// Run with:  node scripts/check-agent-rules.mjs   (Node 22.18 or newer, which runs .ts files directly)

import assert from "node:assert/strict";
import { draftProblems, fillSender, hasSomethingToAct, isCandidate, isSetAside, judgeTwins, MIN_SCORE, pickRecipient, SENDER_TOKEN, SET_ASIDE_HOURS, SET_ASIDE_STEP, shouldClearWorking } from "../lib/agent/judge.ts";

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

// --- Who the email is for ----------------------------------------------------------------
const person = (name, role) => ({ kind: "person", name, role, id: name });
assert.equal(pickRecipient([]), null);
assert.equal(pickRecipient([{ kind: "owner", name: "Acme" }]), null, "owners and contractors are not people");
assert.equal(pickRecipient([person("Chris Chief", "Chief Executive Officer"), person("Pat Projects", "Vice President, Projects")]).name, "Pat Projects", "a project role beats the chief executive");
assert.equal(pickRecipient([person("Sam Chair", "Chairman"), person("Lee Safe", "Safety Advisor")]).name, "Lee Safe", "a named role beats a chairman");
assert.equal(pickRecipient([person("Kim Pres", "President"), person("Ann Anon")]).name, "Kim Pres", "a role beats none");
assert.equal(pickRecipient([person("Only Ceo", "CEO")]).name, "Only Ceo", "a chief executive is still chosen when nobody else is named");
assert.equal(pickRecipient([person("Vee Pee", "Vice President"), person("Pres Ident", "President")]).name, "Vee Pee", "a vice president is not treated as top level");

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
assert.equal(hasSomethingToAct([]), false, "nothing found");
assert.equal(hasSomethingToAct([{ kind: "owner" }]), false, "an owner alone is not enough");
assert.equal(hasSomethingToAct([{ kind: "owner" }, { kind: "owner" }]), false);
assert.equal(hasSomethingToAct([{ kind: "owner" }, { kind: "contractor" }]), true, "a contractor is something to approach");
assert.equal(hasSomethingToAct([{ kind: "person" }]), true, "a named person is someone to write to");

// --- When a draft is thrown away ---------------------------------------------------------
const good = `Hi Pat,\n\nI saw the Cedar LNG project in a public regulatory listing and wanted to introduce myself. SEEDA connects project teams with pre-vetted specialists for short, targeted input, so a team that already covers most of what it needs can add the rest without a long engagement.\n\nWould you be open to a short call?\n\nBest,\n${SENDER_TOKEN}`;
assert.deepEqual(draftProblems(good), []);
assert.ok(draftProblems(good.replace(SENDER_TOKEN, "Josh")).some((p) => p.includes("not signed")), "an unsigned draft is rejected");
assert.ok(draftProblems(good.replace("Pat", "[Name]")).some((p) => p.includes("placeholder")));
assert.ok(draftProblems(good.replace("short call?", "short call!")).some((p) => p.includes("exclamation")));
assert.ok(draftProblems(good + " word".repeat(200)).some((p) => p.includes("longer than 180")));
assert.ok(draftProblems(`Hi\n\nBest,\n${SENDER_TOKEN}`).some((p) => p.includes("too short")));

// --- Signing -----------------------------------------------------------------------------
assert.equal(fillSender(`Best,\n${SENDER_TOKEN}`, "Josh"), "Best,\nJosh");
assert.equal(fillSender(`${SENDER_TOKEN} and ${SENDER_TOKEN}`, "Josh"), "Josh and Josh", "every occurrence is replaced");

console.log("agent rule checks passed");
