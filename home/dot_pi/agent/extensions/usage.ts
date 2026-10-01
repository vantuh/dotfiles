import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { getKiroUsage } from './kiro-acp/usage.ts';

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

interface CodexWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
}

interface CodexUsage {
  plan_type?: string;
  rate_limit?: {
    primary_window?: CodexWindow | null;
    secondary_window?: CodexWindow | null;
  };
  additional_rate_limits?: {
    limit_name?: string;
    rate_limit?: { primary_window?: CodexWindow | null };
  }[];
  rate_limit_reset_credits?: { available_count?: number };
}

/**
 * Codex rate limits are only readable with the codex CLI's own OAuth token —
 * Pi's OpenAI token is rejected by the ChatGPT backend.
 */
async function codexFromCli(): Promise<Provider | undefined> {
  const dir = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  let tokens: { access_token?: string; account_id?: string };
  try {
    tokens =
      (
        JSON.parse(await readFile(join(dir, 'auth.json'), 'utf8')) as {
          tokens?: { access_token?: string; account_id?: string };
        }
      ).tokens ?? {};
  } catch {
    return undefined;
  }
  if (!tokens.access_token || !tokens.account_id) return undefined;

  const payload = (await getJson('https://chatgpt.com/backend-api/wham/usage', {
    authorization: `Bearer ${tokens.access_token}`,
    'chatgpt-account-id': tokens.account_id,
  })) as CodexUsage;

  const buckets: Bucket[] = [];
  const add = (label: string, window: CodexWindow | null | undefined) => {
    if (!window || typeof window.used_percent !== 'number') return;
    buckets.push({
      label,
      pct: window.used_percent,
      resetsAt: toMs(window.reset_at?.toString()),
    });
  };
  add('5 hours', payload.rate_limit?.primary_window);
  add('7 days', payload.rate_limit?.secondary_window);
  for (const extra of payload.additional_rate_limits ?? []) {
    add(extra.limit_name ?? 'extra', extra.rate_limit?.primary_window);
  }

  const resets = payload.rate_limit_reset_credits?.available_count ?? 0;
  return {
    name: 'OpenAI Codex',
    buckets,
    note: [
      payload.plan_type,
      resets > 0 ? `${resets} resets available` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
  };
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

/** Kiro reports plan usage only through the kiro CLI; reuse the kiro-acp parser. */
async function kiro(): Promise<Provider | undefined> {
  const usage = await getKiroUsage();
  return {
    name: `Kiro (${usage.plan})`,
    buckets: [
      {
        label: 'plan credits',
        pct: usage.percent,
        resetsAt: toMs(usage.resetDate),
      },
    ],
    note: usage.credits || undefined,
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
          codexFromCli().catch(() => undefined),
          openrouter().catch(() => undefined),
          kiro().catch(() => undefined),
        ])
      ).filter((p): p is Provider => p !== undefined);

      // Codex headers only appear on some responses (typically 429s), so they
      // stand in when the wham endpoint is unavailable.
      if (!providers.some((p) => p.name === 'OpenAI Codex')) {
        const codexPct = codexHeaders['x-codex-primary-used-percent'];
        if (codexPct) {
          providers.push({
            name: 'OpenAI Codex',
            buckets: [
              {
                label: 'primary window',
                pct: Number(codexPct),
                resetsAt: toMs(codexHeaders['x-codex-primary-reset-at']),
              },
            ],
            note: 'from response headers',
          });
        }
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
