import { z } from "zod";
import { matchesMimeType, parseSize } from "@skills-kit/core";

type YAMLSchemaProperty = {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  items?: YAMLSchemaProperty;
  properties?: Record<string, YAMLSchemaProperty>;
  // File-specific properties
  accept?: string[];
  maxSize?: string;
  compression?: string;
  streaming?: boolean;
  maxItems?: number;
};

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

    case "file":
      schema = createFileSchema(prop);
      break;

    case "array":
      if (prop.items) {
        const itemSchema = convertProperty(prop.items);
        const arraySchema = z.array(itemSchema);

        // Handle maxItems for arrays
        if (prop.maxItems && typeof prop.maxItems === "number") {
          schema = arraySchema.max(prop.maxItems);
        } else {
          schema = arraySchema;
        }
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
 * Create Zod schema for file input with validation
 */
function createFileSchema(prop: YAMLSchemaProperty): z.ZodTypeAny {
  // Base file input schema
  const baseSchema = z.object({
    filename: z.string(),
    mimeType: z.string(),
    data: z.string().optional(), // base64, not present in streaming mode
    size: z.number(),
    originalSize: z.number(),
    compression: z.enum(["none", "gzip", "brotli"]).default("none"),
    streaming: z.boolean().default(false),
    streamPath: z.string().optional(), // Present only in streaming mode
    streamId: z.string().optional() // Present only in streaming mode
  });

  let schema: z.ZodTypeAny = baseSchema;

  // Add MIME type validation
  if (prop.accept && Array.isArray(prop.accept) && prop.accept.length > 0) {
    schema = schema.refine(
      (file: { mimeType: string }) => matchesMimeType(file.mimeType, prop.accept as string[]),
      {
        message: `File must be one of: ${prop.accept.join(", ")}`
      }
    );
  }

  // Add size validation
  if (prop.maxSize && typeof prop.maxSize === "string") {
    const maxBytes = parseSize(prop.maxSize);
    schema = schema.refine((file: { originalSize: number }) => file.originalSize <= maxBytes, {
      message: `File must be smaller than ${prop.maxSize}`
    });
  }

  // Validate streaming consistency
  schema = schema.refine(
    (file: { streaming?: boolean; streamPath?: string; streamId?: string; data?: string }) => {
      if (file.streaming) {
        return file.streamPath && file.streamId && !file.data;
      }
      return !!file.data;
    },
    {
      message: "Streaming files must have streamPath/streamId, non-streaming must have data"
    }
  );

  return schema;
}

/**
 * Convert YAML-based input schema to Zod schema
 *
 * @param inputs - The inputs object from SKILL.md frontmatter
 * @returns A Zod object schema
 */
export function yamlToZodSchema(inputs: unknown): z.ZodObject<z.ZodRawShape> {
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
