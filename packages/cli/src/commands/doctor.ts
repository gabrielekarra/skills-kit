import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";

const exec = promisify(execCb);

export type DoctorCheck = {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

function checkNodeVersion(): DoctorCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 20) {
    return {
      name: "Node.js version",
      status: "ok",
      message: `${version} (>= 20.x required)`
    };
  }

  return {
    name: "Node.js version",
    status: "error",
    message: `${version} (requires >= 20.x)`
  };
}

function checkAnthropicKey(): DoctorCheck {
  const key = process.env.ANTHROPIC_API_KEY;

  if (key && key.startsWith("sk-ant-")) {
    return {
      name: "ANTHROPIC_API_KEY",
      status: "ok",
      message: "Set and valid format"
    };
  }

  if (key) {
    return {
      name: "ANTHROPIC_API_KEY",
      status: "warning",
      message: "Set but doesn't match expected format"
    };
  }

  return {
    name: "ANTHROPIC_API_KEY",
    status: "error",
    message: "Not set (required for 'create' and 'refine' commands)"
  };
}

async function checkNetworkReachability(): Promise<DoctorCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.anthropic.com", {
      method: "HEAD",
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.status === 404 || response.status === 401 || response.ok) {
      return {
        name: "Network (api.anthropic.com)",
        status: "ok",
        message: "Reachable"
      };
    }

    return {
      name: "Network (api.anthropic.com)",
      status: "warning",
      message: `Unexpected status: ${response.status}`
    };
  } catch (err) {
    return {
      name: "Network (api.anthropic.com)",
      status: "warning",
      message: `Not reachable: ${err instanceof Error ? err.message : "unknown error"}`
    };
  }
}

async function checkPnpm(): Promise<DoctorCheck> {
  try {
    const { stdout } = await exec("pnpm --version");
    return {
      name: "pnpm",
      status: "ok",
      message: `v${stdout.trim()}`
    };
  } catch {
    return {
      name: "pnpm",
      status: "warning",
      message: "Not found (optional, but recommended for development)"
    };
  }
}

export async function runDoctor(): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkAnthropicKey());
  checks.push(await checkNetworkReachability());
  checks.push(await checkPnpm());

  const ok = checks.every((c) => c.status !== "error");

  return { ok, checks };
}
