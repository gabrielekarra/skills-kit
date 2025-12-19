import type { ParsedSkill } from "../types.js";

export function generateClaudeNotes(skill: ParsedSkill): string {
  return `# Claude Integration Notes

This skill follows Claude's skill format and can be used directly with Claude Code or Claude Desktop.

## Directory Structure

\`\`\`
${skill.frontmatter.name}/
├── SKILL.md          # Skill manifest (YAML frontmatter + markdown)
├── policy.yaml       # Security policy
├── scripts/          # Executable scripts
│   └── run.cjs       # Main entrypoint
└── resources/        # Optional resources
\`\`\`

## Using with Claude

1. **Claude Code CLI**: Use the \`skills-kit\` commands or add to your skills directory
2. **Claude Desktop**: Place in your skills folder (check Claude settings)
3. **Claude API**: Reference as a custom tool in your integration

## Entrypoints

${skill.frontmatter.entrypoints?.map((ep) => `- \`${ep}\``).join("\n") ?? "- scripts/run.cjs"}

## Allowed Tools

${skill.frontmatter.allowed_tools?.map((t) => `- ${t}`).join("\n") ?? "None specified"}

---

This skill is portable and can also be used with other LLMs via adapters.
`;
}
