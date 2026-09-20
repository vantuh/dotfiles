// Account-level plan usage (credits, % of plan, reset date) is NOT available
// over ACP: kiro-cli exposes only session-scoped metrics (_kiro.dev/metadata
// contextUsagePercentage, per-turn meteringUsage/sessionCost — see types.ts).
// The /usage data comes from a direct AWS call (AmazonCodeWhispererService
// .GetUsageLimits) that the CLI makes internally and never forwards to ACP
// clients (verified against kiro-cli 2.19.1: all candidate usage/quota JSON-RPC
// methods return -32601). So spawning `kiro-cli chat --no-interactive /usage`
// is the only viable source. Wired into omp's /usage panel via registerProvider
// `{ usage }` (AuthStorage.setRuntimeUsageProvider).

import { spawn } from "node:child_process";

import { log } from "./logging.ts";
import { KIRO_ACP_PROVIDER } from "./overflow.ts";

export interface KiroUsage {
  plan: string;
  /** Raw reset date from kiro-cli, e.g. "2026-10-01". */
  resetDate: string;
  /** Percent of plan credits used (0-100). */
  percent: number;
  /** Raw credits line inside parentheses, e.g. "212.99 of 5000 covered in plan". */
  credits: string;
}

/** Subset of omp's UsageReport — kept structural so tests don't need @oh-my-pi. */
export interface KiroUsageReport {
  provider: string;
  fetchedAt: number;
  limits: Array<{
    id: string;
    label: string;
    scope: {
      provider: string;
      tier?: string;
      windowId?: string;
      shared?: boolean;
    };
    window?: {
      id: string;
      label: string;
      resetsAt?: number;
    };
    amount: {
      used?: number;
      limit?: number;
      remaining?: number;
      usedFraction?: number;
      remainingFraction?: number;
      unit: "percent" | "credits";
    };
    status: "ok" | "warning" | "exhausted" | "unknown";
    notes?: string[];
  }>;
  metadata?: Record<string, unknown>;
}

const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const FETCH_TIMEOUT_MS = 45_000;
const CREDITS_OF_RE = /([0-9]+(?:\.[0-9]+)?)\s+of\s+([0-9]+(?:\.[0-9]+)?)/i;

/** Parses the output of `kiro-cli chat --no-interactive /usage`. */
export function parseKiroUsage(raw: string): KiroUsage | null {
  const text = raw.replace(ANSI_RE, "");
  const header = text.match(/Estimated Usage \| resets on ([^|]+) \| (.+)/);
  if (!header) return null;
  const credits = text.match(/Credits \(([^)]+)\)/);
  const percent = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return {
    plan: header[2].trim(),
    resetDate: header[1].trim(),
    percent: percent ? Number(percent[1]) : 0,
    credits: credits ? credits[1].trim() : "",
  };
}

/** Local calendar midnight for a `YYYY-MM-DD` reset date from kiro-cli. */
export function parseResetDate(date: string): number | undefined {
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ).getTime();
  }
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function quotaStatus(
  usedFraction: number | undefined,
): KiroUsageReport["limits"][number]["status"] {
  if (usedFraction === undefined) return "unknown";
  if (usedFraction >= 1) return "exhausted";
  if (usedFraction >= 0.9) return "warning";
  return "ok";
}

function creditAmount(usage: KiroUsage): KiroUsageReport["limits"][number]["amount"] {
  const match = usage.credits.match(CREDITS_OF_RE);
  if (match) {
    const used = Number(match[1]);
    const limit = Number(match[2]);
    if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
      const usedFraction = used / limit;
      return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        usedFraction,
        remainingFraction: Math.max(0, 1 - usedFraction),
        unit: "credits",
      };
    }
  }
  const usedFraction = Math.max(0, Math.min(1, usage.percent / 100));
  return {
    used: usage.percent,
    usedFraction,
    remainingFraction: 1 - usedFraction,
    unit: "percent",
  };
}

/** Maps scraped kiro-cli /usage into omp's /usage panel shape. */
export function toUsageReport(
  usage: KiroUsage,
  fetchedAt = Date.now(),
): KiroUsageReport {
  const amount = creditAmount(usage);
  const resetsAt = parseResetDate(usage.resetDate);
  const notes = usage.credits ? [usage.credits] : undefined;
  return {
    provider: KIRO_ACP_PROVIDER,
    fetchedAt,
    limits: [
      {
        id: "kiro-acp:credits:plan",
        label: "Credits",
        scope: {
          provider: KIRO_ACP_PROVIDER,
          tier: usage.plan || undefined,
          windowId: "monthly",
          shared: true,
        },
        window: {
          id: "monthly",
          label: "Plan Period",
          ...(resetsAt !== undefined ? { resetsAt } : {}),
        },
        amount,
        status: quotaStatus(amount.usedFraction),
        ...(notes ? { notes } : {}),
      },
    ],
    metadata: {
      plan: usage.plan,
      resetDate: usage.resetDate,
    },
  };
}

function runKiroCli(bin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ["chat", "--no-interactive", "/usage"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${bin} /usage timed out after ${FETCH_TIMEOUT_MS}ms`));
    }, FETCH_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      // kiro-cli writes the /usage report to stderr when not attached to a TTY.
      const output = out + err;
      if (code === 0 && output.trim()) {
        resolve(output);
      } else {
        reject(
          new Error(
            `${bin} /usage exited with code ${code}${output ? `: ${output.trim().slice(0, 200)}` : ""}`,
          ),
        );
      }
    });
  });
}

async function fetchKiroUsage(): Promise<KiroUsage> {
  let raw: string;
  try {
    raw = await runKiroCli("kiro-cli");
  } catch (error) {
    // Fall back to `kiro` only when kiro-cli is not installed (same policy as my-usage).
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    raw = await runKiroCli("kiro");
  }
  const usage = parseKiroUsage(raw);
  if (!usage) throw new Error("could not parse kiro /usage output");
  return usage;
}

let inflight: Promise<KiroUsage> | null = null;
let lastGood: KiroUsage | null = null;

/** Last successful scrape; used so /usage can render while a refresh is in flight. */
export function peekKiroUsage(): KiroUsage | null {
  return lastGood;
}

/** Fetches fresh usage data. Concurrent callers share one in-flight fetch. */
export async function getKiroUsage(): Promise<KiroUsage> {
  if (!inflight) {
    inflight = fetchKiroUsage()
      .then((usage) => {
        lastGood = usage;
        log("usage fetched", { percent: usage.percent, plan: usage.plan });
        return usage;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Warm the scrape cache at extension load so the first /usage overlay is not
 * blocked on kiro-cli (omp's per-provider usage timeout is 10s; the scrape
 * can take longer). Failures are logged and ignored.
 */
export function prefetchKiroUsage(): void {
  void getKiroUsage().catch((error) => {
    log("usage prefetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(signal.reason ?? new Error("aborted"));
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

/**
 * omp UsageProvider. Does not abort the kiro-cli spawn: AuthStorage's 10s
 * signal only cancels *this* waiter's Promise; the scrape continues so the
 * next poll (and the footer) can use lastGood.
 */
async function fetchKiroAcpUsage(params: {
  provider: string;
  signal?: AbortSignal;
}): Promise<KiroUsageReport | null> {
  if (params.provider !== KIRO_ACP_PROVIDER) return null;
  if (params.signal?.aborted) {
    return lastGood ? toUsageReport(lastGood) : null;
  }
  if (lastGood) {
    void getKiroUsage().catch(() => {});
    return toUsageReport(lastGood);
  }
  try {
    const usage = params.signal
      ? await Promise.race([getKiroUsage(), aborted(params.signal)])
      : await getKiroUsage();
    return toUsageReport(usage);
  } catch {
    return lastGood ? toUsageReport(lastGood) : null;
  }
}

/** Passed to `pi.registerProvider(..., { usage })` so /usage lists Kiro. */
export const kiroAcpUsageProvider = {
  id: KIRO_ACP_PROVIDER,
  validatesCredentials: false,
  retainLastGoodOnFailure: true,
  supports: (params: { provider?: string }) =>
    params.provider === KIRO_ACP_PROVIDER,
  fetchUsage: fetchKiroAcpUsage,
};
