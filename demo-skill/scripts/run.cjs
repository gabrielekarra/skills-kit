#!/usr/bin/env node
const fs = require("node:fs");

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}
  const out = { ok: true, echo: data };
  process.stdout.write(JSON.stringify(out));
});
