export type RunOptions = {
  input?: unknown;
  cwd?: string;
  timeout?: number;
};

export type RunResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
  logs?: string;
  artifacts?: string[];
};

export type PolicyViolation = {
  code: string;
  message: string;
};
