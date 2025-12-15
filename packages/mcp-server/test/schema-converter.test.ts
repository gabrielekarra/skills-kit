import { describe, it, expect } from "vitest";
import { yamlToZodSchema } from "../src/schema-converter.js";
import { z } from "zod";

describe("yamlToZodSchema", () => {
  it("converts empty inputs to empty object schema", () => {
    const schema = yamlToZodSchema({});
    const result = schema.parse({});
    expect(result).toEqual({});
  });

  it("converts string type", () => {
    const schema = yamlToZodSchema({
      name: {
        type: "string",
        description: "User name"
      }
    });

    expect(() => schema.parse({ name: "John" })).not.toThrow();
    expect(() => schema.parse({ name: 123 })).toThrow();
  });

  it("converts number type", () => {
    const schema = yamlToZodSchema({
      age: {
        type: "number",
        description: "User age"
      }
    });

    expect(() => schema.parse({ age: 25 })).not.toThrow();
    expect(() => schema.parse({ age: "25" })).toThrow();
  });

  it("converts boolean type", () => {
    const schema = yamlToZodSchema({
      active: {
        type: "boolean"
      }
    });

    expect(() => schema.parse({ active: true })).not.toThrow();
    expect(() => schema.parse({ active: "true" })).toThrow();
  });

  it("converts array type", () => {
    const schema = yamlToZodSchema({
      tags: {
        type: "array",
        items: {
          type: "string"
        }
      }
    });

    expect(() => schema.parse({ tags: ["a", "b"] })).not.toThrow();
    expect(() => schema.parse({ tags: [1, 2] })).toThrow();
  });

  it("converts object type with properties", () => {
    const schema = yamlToZodSchema({
      config: {
        type: "object",
        properties: {
          host: {
            type: "string"
          },
          port: {
            type: "number"
          }
        }
      }
    });

    expect(() =>
      schema.parse({
        config: {
          host: "localhost",
          port: 3000
        }
      })
    ).not.toThrow();
  });

  it("handles default values", () => {
    const schema = yamlToZodSchema({
      count: {
        type: "number",
        default: 10
      }
    });

    const result = schema.parse({});
    expect(result).toEqual({ count: 10 });
  });

  it("handles optional fields", () => {
    const schema = yamlToZodSchema({
      optional: {
        type: "string",
        required: false
      }
    });

    expect(() => schema.parse({})).not.toThrow();
    expect(() => schema.parse({ optional: "value" })).not.toThrow();
  });

  it("handles complex nested schema", () => {
    const schema = yamlToZodSchema({
      query: {
        type: "string",
        description: "Search query",
        required: true
      },
      limit: {
        type: "number",
        description: "Max results",
        default: 10
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Filter tags"
      },
      options: {
        type: "object",
        properties: {
          verbose: {
            type: "boolean",
            default: false
          }
        }
      }
    });

    const result = schema.parse({
      query: "test"
    });

    expect(result).toHaveProperty("query", "test");
    expect(result).toHaveProperty("limit", 10);
  });

  it("handles null or undefined inputs", () => {
    expect(() => yamlToZodSchema(null)).not.toThrow();
    expect(() => yamlToZodSchema(undefined)).not.toThrow();
  });
});
