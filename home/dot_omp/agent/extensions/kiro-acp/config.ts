import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface KiroAcpConfig {
  logger?: {
    /** Write $TMPDIR/omp-kiro-acp-debug.log. Default: off. */
    debug?: boolean;
    /** kiro-cli `-v` repeat count, 0 = off, max 3. Default: 0. */
    verbose?: number;
  };
  usageFooter?: {
    /** Show Kiro usage in the footer. Default: false (off). */
    enabled?: boolean;
    /** Poll interval in minutes. Default: 10. */
    pollMinutes?: number;
  };
  cost?: {
    /**
     * Amortized plan $ written to usage.cost.total per Kiro credit.
     * Default 0.02 (Pro / Pro+ / Pro Max / Power list rate). Set 0 to leave
     * cost at $0 (heatmap will not paint Kiro days by spend).
     */
    dollarsPerCredit?: number;
  };
}

const CONFIG_PATH = join(homedir(), ".omp", "agent", "kiro-acp.json");

/** Reads ~/.omp/agent/kiro-acp.json; empty object when missing/invalid. */
export function loadKiroAcpConfig(): KiroAcpConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as KiroAcpConfig;
  } catch {
    return {};
  }
}

interface LoggerConfig {
  debug: boolean;
  verbose: number;
}

/** Logger settings: config only, off when unset. */
export function resolveLoggerConfig(config: KiroAcpConfig): LoggerConfig {
  return {
    debug: config.logger?.debug ?? false,
    verbose: Math.min(3, Math.max(0, config.logger?.verbose ?? 0)),
  };
}

interface UsageFooterConfig {
  enabled: boolean;
  pollMinutes: number;
}

/** Footer settings: config with defaults (off, poll every 10 minutes). */
export function resolveUsageFooterConfig(
  config: KiroAcpConfig,
): UsageFooterConfig {
  const enabled = config.usageFooter?.enabled;
  const pollMinutes = Number(config.usageFooter?.pollMinutes);
  return {
    enabled: typeof enabled === "boolean" ? enabled : false,
    pollMinutes:
      Number.isFinite(pollMinutes) && pollMinutes > 0 ? pollMinutes : 10,
  };
}

/** List rate of paid individual plans: $20 / 1000 credits. */
export const DEFAULT_DOLLARS_PER_CREDIT = 0.02;

interface CostConfig {
  dollarsPerCredit: number;
}

/** Cost settings: config with default $0.02/credit. Explicit 0 disables. */
export function resolveCostConfig(config: KiroAcpConfig): CostConfig {
  const n = Number(config.cost?.dollarsPerCredit);
  return {
    dollarsPerCredit:
      Number.isFinite(n) && n >= 0 ? n : DEFAULT_DOLLARS_PER_CREDIT,
  };
}
