import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface Bucket {
  label: string;
  /** 0-100, or null when the provider reports spend without a limit. */
  pct: number | null;
  /** Epoch ms. */
  resetsAt: number | null;
}

interface Provider {
  name: string;
  buckets: Bucket[];
  note?: string;
}

type Auth = Record<
  string,
  { type?: string; key?: string; access?: string } | undefined
>;

function authFile(): string {
  return join(
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'),
    'auth.json',
  );
}

async function getAuth(providerId: string): Promise<Auth[string]> {
  try {
    return (JSON.parse(await readFile(authFile(), 'utf8')) as Auth)[providerId];
  } catch {
    return undefined;
  }
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Reset times come back as ISO strings from the usage endpoints but as epoch
// seconds or milliseconds in rate-limit headers.
function toMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return numeric > 0 ? (numeric < 1e12 ? numeric * 1000 : numeric) : null;
}

// The usage payload also carries billing/credit keys (extra_usage, promo
// credits); only subscription rate-limit windows are percentages.
const ANTHROPIC_WINDOWS = [
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
];

/** Anthropic reports utilization as 0-100 on the OAuth usage endpoint. */
async function anthropic(): Promise<Provider | undefined> {
  const token = (await getAuth('anthropic'))?.access;
  if (!token) return undefined;
  const payload = (await getJson('https://api.anthropic.com/api/oauth/usage', {
    authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
  })) as Record<string, { utilization?: number; resets_at?: string } | null>;

  const buckets: Bucket[] = [];
  for (const id of ANTHROPIC_WINDOWS) {
    const window = payload[id];
    if (!window || typeof window.utilization !== 'number') continue;
    buckets.push({
      label: id.replace(/_/g, ' '),
      pct: window.utilization,
      resetsAt: toMs(window.resets_at),
    });
  }
  return buckets.length > 0 ? { name: 'Anthropic', buckets } : undefined;
}

async function opencodeGo(): Promise<Provider | undefined> {
  const key = (await getAuth('opencode-go'))?.key;
  if (!key) return undefined;
  const payload = (await getJson('https://opencode.ai/zen/go/v1/usage', {
    authorization: `Bearer ${key}`,
  })) as {
    usage?: Record<string, { percent?: number; resetsAt?: string } | undefined>;
  };

  const buckets: Bucket[] = [];
  for (const [id, window] of Object.entries(payload.usage ?? {})) {
    if (!window || typeof window.percent !== 'number') continue;
    buckets.push({
      label: id,
      pct: window.percent,
      resetsAt: toMs(window.resetsAt),
    });
  }
  return buckets.length > 0 ? { name: 'OpenCode Go', buckets } : undefined;
}

async function openrouter(): Promise<Provider | undefined> {
  const token = (await getAuth('openrouter'))?.access;
  if (!token) return undefined;
  const payload = (await getJson('https://openrouter.ai/api/v1/auth/key', {
    authorization: `Bearer ${token}`,
  })) as { data?: { usage?: number; limit?: number | null } };

  const { usage, limit } = payload.data ?? {};
  if (usage === undefined) return undefined;
  return {
    name: 'OpenRouter',
    buckets: limit
      ? [{ label: 'spend', pct: (usage / limit) * 100, resetsAt: null }]
      : [],
    note: limit
      ? `$${usage.toFixed(2)} of $${limit}`
      : `$${usage.toFixed(2)} spent, no key limit`,
  };
}

/** Codex only sends rate-limit headers on some responses, so keep the last ones seen. */
let codexHeaders: Record<string, string> = {};

const BAR_WIDTH = 16;

function bar(pct: number): string {
  const filled = Math.round(
    (Math.min(100, Math.max(0, pct)) / 100) * BAR_WIDTH,
  );
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
}

function until(resetsAt: number | null): string {
  if (!resetsAt) return '';
  const mins = Math.max(0, Math.round((resetsAt - Date.now()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = d > 0 ? [`${d}d`] : [];
  if (h > 0) parts.push(`${h}h`);
  if (d === 0) parts.push(`${m}m`);
  return parts.length > 0 ? `resets in ${parts.join(' ')}` : 'resets shortly';
}

export default function usage(pi: ExtensionAPI) {
  pi.on('after_provider_response', (event) => {
    const codex = Object.entries(event.headers).filter(([key]) =>
      /^x-codex-(primary|secondary)-(used-percent|reset-at|window-minutes)$/.test(
        key,
      ),
    );
    if (codex.length > 0) codexHeaders = Object.fromEntries(codex);
  });

  pi.registerCommand('usage', {
    description: 'Show provider rate-limit usage',
    handler: async (_args, ctx) => {
      const providers = (
        await Promise.all([
          anthropic().catch(() => undefined),
          opencodeGo().catch(() => undefined),
          openrouter().catch(() => undefined),
        ])
      ).filter((p): p is Provider => p !== undefined);

      const codexPct = codexHeaders['x-codex-primary-used-percent'];
      if (codexPct) {
        const resetAt = codexHeaders['x-codex-primary-reset-at'];
        providers.push({
          name: 'OpenAI Codex',
          buckets: [
            {
              label: 'primary window',
              pct: Number(codexPct),
              resetsAt: toMs(resetAt),
            },
          ],
          note: 'from response headers',
        });
      }

      if (providers.length === 0) {
        ctx.ui.notify(
          'No provider usage available (missing or expired credentials)',
          'warning',
        );
        return;
      }

      const lines: string[] = [];
      for (const provider of providers) {
        lines.push(provider.name);
        if (provider.buckets.length === 0 && provider.note === undefined)
          continue;
        for (const bucket of provider.buckets) {
          const value =
            bucket.pct === null
              ? ''
              : `${bar(bucket.pct)} ${String(Math.round(bucket.pct)).padStart(3)}%`;
          lines.push(
            `  ${bucket.label.padEnd(12)} ${value.padEnd(21)}  ${until(bucket.resetsAt)}`,
          );
        }
        if (provider.note) lines.push(`  ${provider.note}`);
      }
      await ctx.ui.select('Provider usage', lines);
    },
  });
}
