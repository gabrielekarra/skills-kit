#!/usr/bin/env node

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const message = data.message || "";
    const count = data.count || 1;
    const uppercase = data.uppercase || false;

    let result = message;
    if (uppercase) {
      result = result.toUpperCase();
    }

    const repeated = Array(count).fill(result).join(" ");

    process.stdout.write(
      JSON.stringify({
        result: repeated,
        repeated: count
      })
    );
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
});
