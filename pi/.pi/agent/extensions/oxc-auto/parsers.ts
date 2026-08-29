export interface Finding {
  line: string;
  severity: string;
  rule: string;
  message: string;
}

interface EslintMessage {
  line?: unknown;
  severity?: unknown;
  ruleId?: unknown;
  message?: unknown;
}
const isEslintMessage = (v: unknown): v is EslintMessage =>
  typeof v === 'object' && v !== null && 'line' in v;

export function parseOxlint(stdout: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(
      /^::(warning|error) file=[^,]+,line=(\d+),.*?title=([^:]*)::(.*)$/,
    );
    if (m)
      findings.push({
        severity: m[1],
        line: m[2],
        rule: m[3],
        message: m[4].replace(/^[^:]+:\d+:\d+:\s*/, ''),
      });
  }
  return findings;
}

export function parseEslint(stdout: string): Finding[] {
  let results: unknown;
  try {
    results = JSON.parse(stdout);
  } catch {
    return [];
  }
  const entries: unknown[] = Array.isArray(results) ? results : [];
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('messages' in entry) ||
      !Array.isArray(entry.messages)
    )
      continue;
    for (const m of entry.messages) {
      if (!isEslintMessage(m) || typeof m.line !== 'number' || m.line <= 0)
        continue; // skips whole-file warnings too
      findings.push({
        line: String(m.line),
        severity: m.severity === 2 ? 'error' : 'warning',
        rule: typeof m.ruleId === 'string' ? m.ruleId : 'unknown',
        message: typeof m.message === 'string' ? m.message : '',
      });
    }
  }
  return findings;
}
