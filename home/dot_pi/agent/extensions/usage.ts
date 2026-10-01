import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

import { getKiroUsage } from './kiro-acp/usage.ts';

interface Bucket {
  label: string;
  /** 0-100, or null when the provider reports spend without a limit. */
  pct: number | null;
  /** Epoch ms. */
  resetsAt: number | null;
}

/** One redeemable rate-limit reset, as shown in the reset picker. */
interface ResetItem {
  /** Provider-side credit id, passed back to the redeem endpoint. */
  id: string;
  label: string;
  detail: string;
}

interface Provider {
  name: string;
  buckets: Bucket[];
  resets?: ResetItem[];
  /** Spends one reset; returns a human-readable result. */
  redeem?: (id: string) => Promise<string>;
  note?: string;
}

/** Anthropic only reports limit resets to the Claude Code CLI surface. */
const CLAUDE_CLI_UA = 'claude-cli/2.19.1 (external, cli)';

const CLOSE_ROW = '  Esc: back · here to close';

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

async function request(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body
      ? { ...headers, 'content-type': 'application/json' }
      : headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  if (!res.ok) {
    const detail =
      payload && typeof payload === 'object' && 'error' in payload
        ? JSON.stringify((payload as { error: unknown }).error).slice(0, 200)
        : text.slice(0, 200);
    throw new Error(`${res.status} ${detail}`);
  }
  return payload;
}

const getJson = (url: string, headers: Record<string, string>) =>
  request(url, headers);
const postJson = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
) => request(url, headers, { method: 'POST', body });

// Reset times come back as ISO strings from the usage endpoints but as epoch
// seconds or milliseconds in rate-limit headers.
function toMs(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Date.parse(String(value));
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return numeric > 0 ? (numeric < 1e12 ? numeric * 1000 : numeric) : null;
}

function stamp(ms: number | null): string {
  return ms
    ? `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC (${until(ms)})`
    : 'no expiry reported';
}

// The usage payload also carries billing/credit keys (extra_usage, promo
// credits); only subscription rate-limit windows are percentages.
const ANTHROPIC_WINDOWS = [
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
];

interface ClaudeGrant {
  id?: string;
  label?: string;
  resets_left?: number;
  ends_at?: string;
  paused?: boolean;
  clears?: string[];
}

interface ClaudeUsage {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  seven_day?: { utilization?: number; resets_at?: string } | null;
  seven_day_opus?: { utilization?: number; resets_at?: string } | null;
  seven_day_sonnet?: { utilization?: number; resets_at?: string } | null;
  cedar_ember?: {
    grants?: ClaudeGrant[];
    next_grant_id?: string | null;
  } | null;
}

const claudeHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  'anthropic-beta': 'oauth-2025-04-20',
  'user-agent': CLAUDE_CLI_UA,
});

/**
 * Anthropic reports utilization as 0-100. The `cedar_ember` reset-credit block
 * is only populated by the `cedar_ember=1` probe query, and it answers
 * `ineligible_reason: "surface"` unless the request identifies as Claude Code,
 * so one probe call covers both the windows and the resets.
 */
async function anthropic(): Promise<Provider | undefined> {
  const token = (await getAuth('anthropic'))?.access;
  if (!token) return undefined;
  const payload = (await getJson(
    'https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1',
    claudeHeaders(token),
  )) as ClaudeUsage;

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
  if (buckets.length === 0) return undefined;

  const grants = (payload.cedar_ember?.grants ?? []).filter(
    (grant): grant is ClaudeGrant & { id: string } =>
      typeof grant.id === 'string' &&
      !grant.paused &&
      typeof grant.resets_left === 'number' &&
      grant.resets_left > 0 &&
      (!grant.ends_at || Date.parse(grant.ends_at) > Date.now()),
  );
  // A grant can hold several resets; show one row per reset so each entry in
  // the picker maps to exactly one credit.
  const resets: ResetItem[] = grants.flatMap((grant) =>
    Array.from({ length: grant.resets_left ?? 0 }, (_, index) => ({
      id: grant.id,
      label: `${stamp(toMs(grant.ends_at))}  ${grant.label ?? 'Claude limit reset'}${
        (grant.resets_left ?? 0) > 1
          ? ` [${index + 1}/${grant.resets_left}]`
          : ''
      }`,
      detail: [
        grant.label,
        `expires ${stamp(toMs(grant.ends_at))}`,
        grant.clears?.length
          ? `clears: ${grant.clears.map((id) => id.replace(/_/g, ' ')).join(', ')}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    })),
  );

  return {
    name: 'Anthropic',
    buckets,
    resets,
    redeem: (id) => redeemClaudeReset(token, id),
  };
}

async function redeemClaudeReset(
  token: string,
  grantId: string | undefined,
): Promise<string> {
  if (!grantId) return 'No matching reset credit — usage may have changed.';
  const profile = (await getJson(
    'https://api.anthropic.com/api/oauth/profile',
    claudeHeaders(token),
  )) as { organization?: { uuid?: string }; organization_uuid?: string };
  const orgId = profile.organization?.uuid ?? profile.organization_uuid;
  if (!orgId)
    return 'Could not resolve the Claude organization for this account.';

  const payload = (await postJson(
    `https://api.anthropic.com/api/organizations/${encodeURIComponent(orgId)}/reset_rate_limits`,
    claudeHeaders(token),
    { program: 'cedar_ember', grant_id: grantId, request_id: randomUUID() },
  )) as { result?: string; reason?: string; cleared?: string[] };

  if (payload.result === 'reset') {
    const cleared = payload.cleared?.map((id) => id.replace(/_/g, ' '));
    return `Reset applied — cleared: ${cleared?.length ? cleared.join(', ') : 'rate-limit windows'}.`;
  }
  return `Not applied: ${payload.reason ?? payload.result ?? 'unknown response'}.`;
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

interface CodexCredit {
  id?: string;
  title?: string;
  expires_at?: string;
  status?: string;
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

  const headers = {
    authorization: `Bearer ${tokens.access_token}`,
    'chatgpt-account-id': tokens.account_id,
  };
  const payload = (await getJson(
    'https://chatgpt.com/backend-api/wham/usage',
    headers,
  )) as CodexUsage;

  const buckets: Bucket[] = [];
  const add = (label: string, window: CodexWindow | null | undefined) => {
    if (!window || typeof window.used_percent !== 'number') return;
    buckets.push({
      label,
      pct: window.used_percent,
      resetsAt: toMs(window.reset_at),
    });
  };
  add('5 hours', payload.rate_limit?.primary_window);
  add('7 days', payload.rate_limit?.secondary_window);
  for (const extra of payload.additional_rate_limits ?? []) {
    add(extra.limit_name ?? 'extra', extra.rate_limit?.primary_window);
  }

  let credits: CodexCredit[] = [];
  try {
    credits =
      (
        (await getJson(
          'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
          headers,
        )) as { credits?: CodexCredit[] }
      ).credits ?? [];
  } catch {
    // Keep the provider: the reset count still comes from /wham/usage.
  }
  const available = credits.filter(
    (credit): credit is CodexCredit & { id: string } =>
      typeof credit.id === 'string' && credit.status === 'available',
  );
  const resets: ResetItem[] = available.map((credit) => ({
    id: credit.id,
    label: `${stamp(toMs(credit.expires_at))}  ${credit.title ?? 'Codex rate limit reset'}`,
    detail: `${credit.title ?? 'Codex rate limit reset'}\nexpires ${stamp(toMs(credit.expires_at))}`,
  }));
  const count = payload.rate_limit_reset_credits?.available_count ?? 0;
  if (resets.length < count) {
    // The credit list was unavailable or partial; keep the count honest.
    for (let i = resets.length; i < count; i++) {
      resets.push({
        id: '',
        label: 'expiry unknown  Codex rate limit reset',
        detail: 'Expiry could not be loaded from the Codex credits route.',
      });
    }
  }

  return {
    name: 'OpenAI Codex',
    buckets,
    resets,
    redeem: (id) => redeemCodexReset(headers, id),
    note: payload.plan_type,
  };
}

async function redeemCodexReset(
  headers: Record<string, string>,
  creditId: string | undefined,
): Promise<string> {
  if (!creditId) return 'No matching Codex credit — usage may have changed.';
  const payload = (await postJson(
    'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
    headers,
    {
      credit_id: creditId,
      redeem_request_id: randomUUID(),
    },
  )) as { code?: string; message?: string };
  return payload.code === 'reset'
    ? 'Reset applied — your Codex rate-limit windows were refreshed.'
    : `Not applied: ${payload.code ?? 'unknown'}${payload.message ? ` (${payload.message})` : ''}.`;
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

async function collectProviders(): Promise<Provider[]> {
  const providers = (
    await Promise.all([
      anthropic().catch(() => undefined),
      codexFromCli().catch(() => undefined),
      opencodeGo().catch(() => undefined),
      kiro().catch(() => undefined),
      openrouter().catch(() => undefined),
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
  return providers;
}

/**
 * Three levels, each Esc returning to the previous one: provider list -> reset
 * picker -> yes/no confirmation. Redeeming is irreversible, so the last step
 * always asks.
 */
async function pickReset(
  provider: Provider,
  ctx: ExtensionContext,
): Promise<boolean> {
  const items = provider.resets ?? [];
  if (items.length === 0) return false;
  for (;;) {
    const picked = await ctx.ui.select(
      `${provider.name} resets`,
      items.map((item) => item.label),
    );
    if (picked === undefined) return false;
    const item = items.find((candidate) => candidate.label === picked);
    const redeem = provider.redeem;
    if (!item || !redeem) continue;

    const confirmed = await ctx.ui.confirm(
      'Use this reset?',
      `${item.detail}\n\nThis spends one reset credit and cannot be undone.`,
    );
    // Esc and "no" are indistinguishable, and both mean "back to the list".
    if (!confirmed) continue;

    const result = await redeem(item.id).catch(
      (error: unknown) =>
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    await ctx.ui.confirm('Reset result', result);
    return true;
  }
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
      let providers = await collectProviders();
      if (providers.length === 0) {
        ctx.ui.notify(
          'No provider usage available (missing or expired credentials)',
          'warning',
        );
        return;
      }

      const buildLines = () => {
        const lines: string[] = [];
        const resetRows = new Map<string, Provider>();
        for (const provider of providers) {
          lines.push(provider.name);
          if (
            provider.buckets.length === 0 &&
            provider.resets === undefined &&
            provider.note === undefined
          )
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
          if (provider.resets && provider.resets.length > 0) {
            const row = `  ↩ resets       ${provider.resets.length} available`;
            lines.push(row);
            resetRows.set(row, provider);
          }
          if (provider.note) lines.push(`  ${provider.note}`);
        }
        lines.push('', CLOSE_ROW);
        return { lines, resetRows };
      };

      let { lines, resetRows } = buildLines();

      // Headless modes resolve select() to undefined immediately, which would
      // spin the Esc loop forever.
      if (!ctx.hasUI) {
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      for (;;) {
        const selected = await ctx.ui.select('Provider usage', lines);
        if (selected === undefined) continue;
        if (selected === CLOSE_ROW) return;
        const provider = resetRows.get(selected);
        if (!provider) continue;
        if (await pickReset(provider, ctx)) {
          providers = await collectProviders();
          ({ lines, resetRows } = buildLines());
        }
      }
    },
  });
}
