import type { ParsedSkill, Policy } from "../types.js";

function jsonSchemaToString(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "{}";
  return JSON.stringify(schema, null, 2);
}

export function generateOpenAISystemPrompt(skill: ParsedSkill): string {
  return `You have access to a skill called "${skill.frontmatter.name}".

Description: ${skill.frontmatter.description}

When to use this skill:
${skill.body || "Use this skill when the user's request matches the description above."}

Input schema:
${jsonSchemaToString(skill.frontmatter.inputs)}

Output schema:
${jsonSchemaToString(skill.frontmatter.outputs)}

To invoke this skill, call the function "${skill.frontmatter.name}" with the appropriate input parameters.
The skill will return a JSON object matching the output schema.
`;
}

export function generateOpenAIToolDefinition(skill: ParsedSkill): unknown {
  const inputSchema = skill.frontmatter.inputs ?? { type: "object", properties: {} };

  return {
    type: "function",
    function: {
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      parameters: inputSchema
    }
  };
}

export function generateOpenAIUsageDoc(skill: ParsedSkill, policy: Policy): string {
  return `# Using ${skill.frontmatter.name} with OpenAI

## Overview
This skill provides: ${skill.frontmatter.description}

## Integration Steps

### 1. Add the tool to your OpenAI client

\`\`\`javascript
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI();
const toolDef = JSON.parse(fs.readFileSync("adapters/openai/tool.json", "utf8"));

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: fs.readFileSync("adapters/openai/system_prompt.txt", "utf8") },
    { role: "user", content: "Your user message here" }
  ],
  tools: [toolDef]
});
\`\`\`

### 2. Handle tool calls

When OpenAI returns a tool call, execute the skill using skills-kit runner:

\`\`\`javascript
import { runSkill } from "@skills-kit/runner";

for (const toolCall of response.choices[0].message.tool_calls || []) {
  if (toolCall.function.name === "${skill.frontmatter.name}") {
    const input = JSON.parse(toolCall.function.arguments);
    const result = await runSkill(".", { input });

    // Send result back to OpenAI
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result.output)
    });
  }
}
\`\`\`

## Policy
This skill has the following policy:
- Network access: ${policy.network ? "enabled" : "disabled"}
- Filesystem read: ${policy.fs_read.length > 0 ? policy.fs_read.join(", ") : "none"}
- Filesystem write: ${policy.fs_write.length > 0 ? policy.fs_write.join(", ") : "none"}
- Exec allowlist: ${policy.exec_allowlist.length > 0 ? policy.exec_allowlist.join(", ") : "none"}

## Running manually

\`\`\`bash
echo '${JSON.stringify({ example: "input" })}' | npx skills-kit run .
\`\`\`
`;
}
