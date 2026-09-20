// Test: parsing of `kiro-cli chat --no-interactive /usage` output.
// Run: test/run-all.sh test/usage.test.ts

import {
  kiroAcpUsageProvider,
  parseKiroUsage,
  parseResetDate,
  toUsageReport,
} from "../usage.ts";
import { KIRO_ACP_PROVIDER } from "../overflow.ts";

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

// Sample captured from kiro-cli (2026-09), ANSI escapes preserved.
const SAMPLE =
  "\x1b[1mEstimated Usage\x1b[0m | resets on 2026-10-01 | \x1b[38;5;141mKIRO PRO MAX\x1b[0m\n" +
  "\x1b[1mCredits\x1b[0m (212.99 of 5000 covered in plan)\n" +
  "\x1b[38;5;141m████░░░░░░\x1b[0m 4%\n" +
  "\nSince your account is through your organization, for account management please contact your account administrator.\n";

const usage = parseKiroUsage(SAMPLE);
assert(usage !== null, "parses sample output");
assert(usage!.plan === "KIRO PRO MAX", `plan: ${usage!.plan}`);
assert(usage!.resetDate === "2026-10-01", `resetDate: ${usage!.resetDate}`);
assert(usage!.percent === 4, `percent: ${usage!.percent}`);
assert(
  usage!.credits === "212.99 of 5000 covered in plan",
  `credits: ${usage!.credits}`,
);

const noHeader = parseKiroUsage("some unrelated output");
assert(noHeader === null, "returns null without header");

const noBar = parseKiroUsage(
  "Estimated Usage | resets on 2026-10-01 | KIRO PRO MAX\nCredits (0 of 5000 covered in plan)",
);
assert(noBar !== null && noBar.percent === 0, "defaults percent to 0");

const resetMs = parseResetDate("2026-10-01");
assert(typeof resetMs === "number", "parseResetDate returns a timestamp");
{
  const d = new Date(resetMs!);
  assert(
    d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 1,
    "reset date is local midnight 2026-10-01",
  );
}

const report = toUsageReport(usage!, 1_700_000_000_000);
assert(report.provider === KIRO_ACP_PROVIDER, "report provider is kiro-acp");
assert(report.fetchedAt === 1_700_000_000_000, "report fetchedAt is passed through");
assert(report.limits.length === 1, "one credits limit");
const limit = report.limits[0];
assert(limit.label === "Credits", `limit label: ${limit.label}`);
assert(limit.scope.tier === "KIRO PRO MAX", `tier: ${limit.scope.tier}`);
assert(limit.scope.shared === true, "plan quota is shared");
assert(limit.amount.unit === "credits", `unit: ${limit.amount.unit}`);
assert(limit.amount.used === 212.99, `used: ${limit.amount.used}`);
assert(limit.amount.limit === 5000, `limit: ${limit.amount.limit}`);
assert(
  Math.abs((limit.amount.usedFraction ?? 0) - 212.99 / 5000) < 1e-12,
  "usedFraction is used/limit",
);
assert(limit.status === "ok", `status: ${limit.status}`);
assert(limit.window?.resetsAt === resetMs, "window.resetsAt matches parseResetDate");
assert(
  limit.notes?.[0] === "212.99 of 5000 covered in plan",
  `notes: ${limit.notes?.[0]}`,
);
assert(report.metadata?.plan === "KIRO PRO MAX", "metadata.plan");

const percentOnly = toUsageReport({
  plan: "KIRO",
  resetDate: "not-a-date",
  percent: 95,
  credits: "unparseable",
});
assert(percentOnly.limits[0].amount.unit === "percent", "falls back to percent unit");
assert(percentOnly.limits[0].amount.used === 95, "percent used is the scraped %");
assert(percentOnly.limits[0].status === "warning", "95% is warning (≥90%)");
assert(
  percentOnly.limits[0].window?.resetsAt === undefined,
  "invalid reset date omits resetsAt",
);

const exhausted = toUsageReport({
  plan: "KIRO",
  resetDate: "2026-10-01",
  percent: 100,
  credits: "5000 of 5000 covered in plan",
});
assert(exhausted.limits[0].status === "exhausted", "100% of credits is exhausted");

assert(
  kiroAcpUsageProvider.id === KIRO_ACP_PROVIDER,
  "usage provider id is kiro-acp",
);
assert(
  kiroAcpUsageProvider.supports({ provider: KIRO_ACP_PROVIDER }) === true,
  "supports kiro-acp",
);
assert(
  kiroAcpUsageProvider.supports({ provider: "anthropic" }) === false,
  "does not support other providers",
);
assert(
  kiroAcpUsageProvider.validatesCredentials === false,
  "dummy apiKey is not a real credential",
);

const aborted = new AbortController();
aborted.abort();
const abortedReport = await kiroAcpUsageProvider.fetchUsage({
  provider: KIRO_ACP_PROVIDER,
  signal: aborted.signal,
});
assert(
  abortedReport === null,
  "aborted fetch with empty cache does not spawn kiro-cli",
);
assert(
  (await kiroAcpUsageProvider.fetchUsage({ provider: "anthropic" })) === null,
  "foreign provider returns null",
);

console.log("✓ all usage tests passed");
