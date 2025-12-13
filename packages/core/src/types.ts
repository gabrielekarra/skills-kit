export type SkillFrontmatter = {
  name: string;
  description: string;
  version?: string;
  authors?: string[];
  allowed_tools?: string[];
  entrypoints?: string[];
  inputs?: unknown;
  outputs?: unknown;
  capabilities?: string[];
  targets?: string[];
  policy?: unknown;
  tests?: unknown;
  [key: string]: unknown;
};

export type ParsedSkill = {
  dir: string;
  skillPath: string;
  frontmatter: SkillFrontmatter;
  body: string;
  rawFrontmatter: unknown;
};

export type Policy = {
  network: boolean;
  fs_read: string[];
  fs_write: string[];
  exec_allowlist: string[];
  domains_allowlist: string[];
};

export type LintIssue = {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
};

export type LintResult = {
  ok: boolean;
  issues: LintIssue[];
};

export type AssertRule =
  | { type: "contains"; path: string; value: unknown }
  | { type: "matches"; path: string; value: string };

export type GoldenTestCase = {
  name?: string;
  input: unknown;
  expected?: unknown;
  assert?: AssertRule;
};

export type TestFailure = {
  testCase: GoldenTestCase;
  error: string;
};

export type TestResult = {
  ok: boolean;
  passed: number;
  failed: number;
  failures: TestFailure[];
};
