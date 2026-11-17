// Checks the text-matching helpers in lib/research/run.ts: curly and straight quotes, and the different dashes, must
// count as the same, and the source file must not contain double-encoded ("mojibake") text again.
//
// Run with:  node scripts/check-research-text.mjs
// (Node 22.13 or newer. The helpers are read from the real source file, so this checks what the app runs.)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../lib/research/run.ts", import.meta.url));
const source = readFileSync(file, "utf8");

// 1. The file must be plain, correctly encoded text: no U+00C3 U+00A2 pairs (UTF-8 read as Windows-1252).
assert.ok(!source.includes(String.fromCharCode(0xC3, 0xA2)), "lib/research/run.ts contains double-encoded characters");

// 2. Take the two helpers out of the file and run them.
function take(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `could not find ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end >= 0, `could not find the end of ${startMarker}`);
  return source.slice(start, end + endMarker.length);
}
const norm = new Function(`${stripTypeScriptTypes(take("export const norm = ", ".trim();")).replace(/^export /, "")}; return norm;`)();
const shortTitle = new Function(`${stripTypeScriptTypes(take("const shortTitle = ", "\n};")).replace(/^export /, "")}; return shortTitle;`)();

// Curly and straight single quotes match.
assert.equal(norm("It’s"), "it's");
assert.equal(norm("It's"), "it's");
assert.equal(norm("‘quoted’"), "'quoted'");
// Curly and straight double quotes match.
assert.equal(norm("“the project”"), '"the project"');
assert.equal(norm('"the project"'), '"the project"');
// En dash, em dash and minus sign all become a hyphen.
assert.equal(norm("A–B"), "a-b");
assert.equal(norm("A—B"), "a-b");
assert.equal(norm("A−B"), "a-b");
// A quoted sentence from a page matches the model's straight-quote copy of it.
const page = norm("“This is a critical milestone,” said Doug Arnell – Cedar LNG’s CEO.");
const modelsCopy = norm(`"This is a critical milestone," said Doug Arnell - Cedar LNG's CEO.`);
assert.ok(page.includes(modelsCopy), "a sentence with curly quotes should match its straight-quote copy");
// Whitespace and case are ignored.
assert.equal(norm("  Hello\n  World "), "hello world");

// shortTitle drops curly double quotes from a headline.
assert.equal(shortTitle("“Cedar LNG” expansion approved"), "Cedar LNG expansion approved");

console.log("research text checks passed");
