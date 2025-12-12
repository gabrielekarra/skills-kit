#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {}
  const diff = String(data.diff || "");
  const risks = [];
  const suggestions = [];

  if (/eval\(/.test(diff)) risks.push({ level: "high", reason: "eval() usage" });
  if (/console\.log/.test(diff)) risks.push({ level: "low", reason: "debug logging" });
  if (/TODO/.test(diff)) suggestions.push("Resolve TODOs before merge.");
  if (/any\b/.test(diff)) suggestions.push("Consider stronger typing than any.");

  const summary = risks.length ? `Found ${risks.length} risk(s).` : "No obvious risks found.";

  process.stdout.write(JSON.stringify({ risks, suggestions, summary }));
});

