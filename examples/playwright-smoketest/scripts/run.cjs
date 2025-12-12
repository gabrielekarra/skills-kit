#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {}
  const steps = [
    { action: "goto", url: data.url ?? "about:blank" },
    { action: "fill", selector: "#username", value: data.username ?? "" },
    { action: "fill", selector: "#password", value: "***" },
    { action: "click", selector: "button[type=submit]" },
    { action: "assert", selector: "#dashboard" }
  ];
  const ok = Boolean(data.url && data.username && data.password);
  const screenshotPath = ok ? "" : "resources/failure.png";
  process.stdout.write(
    JSON.stringify({ ok, steps, screenshotPath, errors: ok ? [] : ["missing credentials"] })
  );
});

