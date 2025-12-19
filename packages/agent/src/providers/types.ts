export type LLMWrite = { path: string; content: string };

export type LLMResponse = {
  writes?: LLMWrite[];
  patch?: string;
  message?: string;
};

export type ContextAttachment = {
  filename: string;
  mimeType: string;
  data: string; // base64
};

export type ProviderContext = {
  model?: string;
  existingFiles?: Record<string, string>;
  attachments?: ContextAttachment[];
};

import type { Policy } from "@skills-kit/core";

export type SkillSpec = {
  name: string;
  description: string;
  version?: string;
  authors?: string[];
  allowed_tools?: string[];
  entrypoints?: string[];
  inputs?: unknown;
  outputs?: unknown;
  capabilities?: string[];
  runtime_dependencies?: string[];
  policy: Policy;
  [key: string]: unknown;
};

export interface LLMProvider {
  name: string;
  generateSkill(description: string, context: ProviderContext): Promise<LLMResponse>;
  repairSkill(description: string, context: ProviderContext, errors: string[]): Promise<LLMResponse>;

  generateSpec?: (nlPrompt: string, context: ProviderContext) => Promise<SkillSpec>;
  generateFilesFromSpec?: (spec: SkillSpec, context: ProviderContext) => Promise<LLMResponse>;
}
