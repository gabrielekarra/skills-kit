import type { ParsedSkill, Policy } from "../types.js";

function jsonSchemaToString(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "{}";
  return JSON.stringify(schema, null, 2);
}

export function generateGeminiSystemInstruction(skill: ParsedSkill): string {
  return `You have access to a function tool called "${skill.frontmatter.name}".

Description: ${skill.frontmatter.description}

${skill.body || "Use this tool when the user's request matches the description above."}

Input schema:
${jsonSchemaToString(skill.frontmatter.inputs)}

Output schema:
${jsonSchemaToString(skill.frontmatter.outputs)}

Call this function when appropriate and return the result to the user.
`;
}

export function generateGeminiFunctionDeclaration(skill: ParsedSkill): unknown {
  const inputSchema = skill.frontmatter.inputs ?? { type: "object", properties: {} };

  // Convert JSON Schema to Gemini's parameter schema format
  const parameters: Record<string, unknown> = {};
  if (typeof inputSchema === "object" && inputSchema !== null) {
    const schema = inputSchema as Record<string, unknown>;
    if (schema.properties && typeof schema.properties === "object") {
      parameters.type = "object";
      parameters.properties = schema.properties;
      if (schema.required) {
        parameters.required = schema.required;
      }
    }
  }

  return {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    parameters: Object.keys(parameters).length > 0 ? parameters : {
      type: "object",
      properties: {}
    }
  };
}

export function generateGeminiUsageDoc(skill: ParsedSkill, policy: Policy): string {
  return `# Using ${skill.frontmatter.name} with Google Gemini

## Overview
This skill provides: ${skill.frontmatter.description}

## Integration Steps

### 1. Add the function to your Gemini API client

\`\`\`python
import google.generativeai as genai
import json
import subprocess

genai.configure(api_key="YOUR_GEMINI_API_KEY")

# Load the function declaration
with open("adapters/gemini/function.json", "r") as f:
    function_declaration = json.load(f)

# Load system instruction
with open("adapters/gemini/system_instruction.txt", "r") as f:
    system_instruction = f.read()

model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    system_instruction=system_instruction,
    tools=[function_declaration]
)

chat = model.start_chat()
\`\`\`

### 2. Handle function calls

When Gemini returns a function call, execute the skill using skills-kit runner:

\`\`\`python
response = chat.send_message("Your user message here")

for part in response.parts:
    if fn := part.function_call:
        if fn.name == "${skill.frontmatter.name}":
            # Convert function arguments to JSON
            input_data = json.dumps(dict(fn.args))

            # Execute the skill
            result = subprocess.run(
                ["skills-kit", "run", ".", "--json", input_data],
                capture_output=True,
                text=True
            )

            output = json.loads(result.stdout)

            # Send result back to Gemini
            response = chat.send_message(
                genai.protos.Content(
                    parts=[genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fn.name,
                            response={"result": output}
                        )
                    )]
                )
            )
\`\`\`

### 3. JavaScript/Node.js Example

\`\`\`javascript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { runSkill } from "@skills-kit/runner";
import fs from "fs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const functionDeclaration = JSON.parse(
  fs.readFileSync("adapters/gemini/function.json", "utf8")
);

const systemInstruction = fs.readFileSync(
  "adapters/gemini/system_instruction.txt",
  "utf8"
);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction,
  tools: [{ functionDeclarations: [functionDeclaration] }]
});

const chat = model.startChat();
const result = await chat.sendMessage("Your message");

for (const part of result.response.candidates[0].content.parts) {
  if (part.functionCall) {
    if (part.functionCall.name === "${skill.frontmatter.name}") {
      const skillResult = await runSkill(".", {
        input: part.functionCall.args
      });

      // Send result back
      await chat.sendMessage([{
        functionResponse: {
          name: part.functionCall.name,
          response: { result: skillResult.output }
        }
      }]);
    }
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

## Resources

- [Gemini Function Calling Docs](https://ai.google.dev/docs/function_calling)
- [Gemini API Reference](https://ai.google.dev/api)
`;
}
