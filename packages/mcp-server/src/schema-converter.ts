import { z } from "zod";

type YAMLSchemaProperty = {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  items?: YAMLSchemaProperty;
  properties?: Record<string, YAMLSchemaProperty>;
};

type YAMLSchema = Record<string, YAMLSchemaProperty>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function convertProperty(prop: YAMLSchemaProperty): z.ZodTypeAny {
  const type = prop.type?.toLowerCase() || "string";

  let schema: z.ZodTypeAny;

  switch (type) {
    case "string":
      schema = z.string();
      break;

    case "number":
      schema = z.number();
      break;

    case "integer":
      schema = z.number().int();
      break;

    case "boolean":
      schema = z.boolean();
      break;

    case "array":
      if (prop.items) {
        const itemSchema = convertProperty(prop.items);
        schema = z.array(itemSchema);
      } else {
        schema = z.array(z.any());
      }
      break;

    case "object":
      if (prop.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, value] of Object.entries(prop.properties)) {
          shape[key] = convertProperty(value);
        }
        schema = z.object(shape);
      } else {
        schema = z.record(z.any());
      }
      break;

    default:
      schema = z.any();
  }

  // Add description if present
  if (prop.description) {
    schema = schema.describe(prop.description);
  }

  // Handle defaults
  if (prop.default !== undefined) {
    schema = schema.default(prop.default);
  }

  // Handle optional fields (not required)
  if (prop.required === false || (prop.required === undefined && prop.default === undefined)) {
    schema = schema.optional();
  }

  return schema;
}

/**
 * Convert YAML-based input schema to Zod schema
 *
 * @param inputs - The inputs object from SKILL.md frontmatter
 * @returns A Zod object schema
 */
export function yamlToZodSchema(inputs: unknown): z.ZodObject<any> {
  if (!isRecord(inputs) || Object.keys(inputs).length === 0) {
    // Return empty object schema if no inputs defined
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (!isRecord(value)) {
      // If value is not a proper schema object, treat as string
      shape[key] = z.string().optional();
      continue;
    }

    const prop = value as YAMLSchemaProperty;
    shape[key] = convertProperty(prop);
  }

  return z.object(shape);
}
