#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {
    process.stdout.write(JSON.stringify({
      valid: false,
      errors: ["Invalid input JSON"],
      warnings: []
    }));
    return;
  }

  const response = data.response || {};
  const schema = data.schema || {};
  const errors = [];
  const warnings = [];

  // Basic schema validation
  if (schema.type === "object" && schema.properties) {
    const props = schema.properties;
    const required = schema.required || [];

    // Check required fields
    for (const field of required) {
      if (!(field in response)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check types
    for (const [field, fieldSchema] of Object.entries(props)) {
      if (field in response) {
        const value = response[field];
        const expectedType = fieldSchema.type;

        if (expectedType === "number" && typeof value !== "number") {
          errors.push(`Field "${field}" should be number, got ${typeof value}`);
        } else if (expectedType === "string" && typeof value !== "string") {
          errors.push(`Field "${field}" should be string, got ${typeof value}`);
        } else if (expectedType === "boolean" && typeof value !== "boolean") {
          errors.push(`Field "${field}" should be boolean, got ${typeof value}`);
        } else if (expectedType === "array" && !Array.isArray(value)) {
          errors.push(`Field "${field}" should be array, got ${typeof value}`);
        } else if (expectedType === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
          errors.push(`Field "${field}" should be object, got ${typeof value}`);
        }
      }
    }

    // Warn about extra fields
    for (const field of Object.keys(response)) {
      if (!(field in props)) {
        warnings.push(`Extra field not in schema: ${field}`);
      }
    }
  }

  process.stdout.write(JSON.stringify({
    valid: errors.length === 0,
    errors,
    warnings
  }));
});
