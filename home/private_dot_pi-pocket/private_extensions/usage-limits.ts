/**
 * Provider usage: a button in the top bar, a launcher action, and a `/usage-limits` command that open a sheet with the
 * rate-limit windows of each provider this machine is signed in to. The tokens stay on the server, in the route.
 *
 * The readers are ported from the Pi extension `~/.pi/extensions/usage`, without its reset redemption: spending a
 * reset credit cannot be undone, so that stays in the terminal's `/usage`.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Host, Web } from "./_pocket.d.ts";

/** Anthropic reports limit resets only to the Claude Code CLI surface. */
const CLAUDE_CLI_UA = "claude-cli/2.19.1 (external, cli)";
const TIMEOUT_MS = 25_000;
const CACHE_MS = 60_000;

/** One rate-limit window: a share of its limit, or spend without one. */
interface Bucket {
    label: string;
    pct: number | null;
    /** Epoch ms, when the provider says when the window resets. */
    resetsAt: number | null;
}

interface Provider {
    name: string;
    buckets: Bucket[];
    note?: string;
}

type Auth = Record<string, { type?: string; key?: string; access?: string } | undefined>;

function authFile(host: Host): string {
    return join(host.agentDir, "auth.json");
}

async function credential(host: Host, providerId: string): Promise<Auth[string]> {
    try {
        return (JSON.parse(await readFile(authFile(host), "utf8")) as Auth)[providerId];
    } catch {
        return undefined;
    }
}

async function request(
    url: string,
    headers: Record<string, string>,
    init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<unknown> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const res = await fetch(url, {
        method: init?.method ?? "GET",
        headers: init?.body ? { ...headers, "content-type": "application/json" } : headers,
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal,
    });
    const text = await res.text();
    let payload: unknown;

    try {
        payload = text ? JSON.parse(text) : undefined;
    } catch {
        payload = undefined;
    }

    if (!res.ok) {
        throw new Error(`${res.status} ${text.slice(0, 120)}`);
    }

    return payload;
}

// Reset times are ISO strings from the usage endpoints, and epoch seconds or milliseconds in rate-limit headers.
function toMs(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    // V8's fallback date parser reads a bare number as a year-2000 date, so epochs come first.
    if (typeof value === "number" || /^\d+$/.test(value)) {
        const numeric = Number(value);

        return numeric > 0 ? (numeric < 1e12 ? numeric * 1000 : numeric) : null;
    }

    const parsed = Date.parse(value);

    return Number.isNaN(parsed) ? null : parsed;
}

const claudeHeaders = (token: string) => ({
    authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
    "user-agent": CLAUDE_CLI_UA,
});

const ANTHROPIC_WINDOWS: [string, string][] = [
    ["five_hour", "5 hours"],
    ["seven_day", "7 days"],
    ["seven_day_opus", "7 days Opus"],
    ["seven_day_sonnet", "7 days Sonnet"],
];

interface ClaudeUsage {
    five_hour?: { utilization?: number; resets_at?: string } | null;
    seven_day?: { utilization?: number; resets_at?: string } | null;
    seven_day_opus?: { utilization?: number; resets_at?: string } | null;
    seven_day_sonnet?: { utilization?: number; resets_at?: string } | null;
}

async function anthropic(host: Host, signal: AbortSignal): Promise<Provider | undefined> {
    const token = (await credential(host, "anthropic"))?.access;

    if (!token) {
        return undefined;
    }

    const payload = (await request(
        "https://api.anthropic.com/api/oauth/usage?skip_spend=1",
        claudeHeaders(token),
        { signal },
    )) as ClaudeUsage;
    const buckets: Bucket[] = [];

    for (const [id, label] of ANTHROPIC_WINDOWS) {
        const window = payload[id as keyof ClaudeUsage];

        if (!window || typeof window.utilization !== "number") {
            continue;
        }

        buckets.push({ label, pct: window.utilization, resetsAt: toMs(window.resets_at) });
    }

    return buckets.length > 0 ? { name: "Anthropic", buckets } : undefined;
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
}

/**
 * Codex rate limits are only readable with the codex CLI's own OAuth token: Pi's OpenAI token is refused by the
 * ChatGPT backend.
 */
async function codex(signal: AbortSignal): Promise<Provider | undefined> {
    const dir = process.env.CODEX_HOME ?? join(homedir(), ".codex");
    let tokens: { access_token?: string; account_id?: string };

    try {
        tokens =
            (
                JSON.parse(await readFile(join(dir, "auth.json"), "utf8")) as {
                    tokens?: { access_token?: string; account_id?: string };
                }
            ).tokens ?? {};
    } catch {
        return undefined;
    }

    if (!tokens.access_token || !tokens.account_id) {
        return undefined;
    }

    const payload = (await request(
        "https://chatgpt.com/backend-api/wham/usage",
        {
            authorization: `Bearer ${tokens.access_token}`,
            "chatgpt-account-id": tokens.account_id,
        },
        { signal },
    )) as CodexUsage;
    const buckets: Bucket[] = [];

    const add = (label: string, window: CodexWindow | null | undefined) => {
        if (!window || typeof window.used_percent !== "number") {
            return;
        }

        buckets.push({ label, pct: window.used_percent, resetsAt: toMs(window.reset_at) });
    };

    add("5 hours", payload.rate_limit?.primary_window);
    add("7 days", payload.rate_limit?.secondary_window);

    for (const extra of payload.additional_rate_limits ?? []) {
        add(extra.limit_name ?? "extra", extra.rate_limit?.primary_window);
    }

    return buckets.length > 0
        ? { name: payload.plan_type ? `OpenAI Codex (${payload.plan_type})` : "OpenAI Codex", buckets }
        : undefined;
}

async function openrouter(host: Host, signal: AbortSignal): Promise<Provider | undefined> {
    const credentials = await credential(host, "openrouter");
    // An api_key-shaped credential carries the token in `key`, not `access`.
    const token = credentials?.access ?? credentials?.key;

    if (!token) {
        return undefined;
    }

    const payload = (await request(
        "https://openrouter.ai/api/v1/auth/key",
        { authorization: `Bearer ${token}` },
        { signal },
    )) as { data?: { usage?: number; limit?: number | null } };
    const { usage, limit } = payload.data ?? {};

    if (usage === undefined) {
        return undefined;
    }

    return {
        name: "OpenRouter",
        buckets: limit ? [{ label: "spend", pct: (usage / limit) * 100, resetsAt: null }] : [],
        note: limit ? `$${usage.toFixed(2)} of $${limit}` : `$${usage.toFixed(2)} spent, no key limit`,
    };
}

async function opencodeGo(host: Host, signal: AbortSignal): Promise<Provider | undefined> {
    const key = (await credential(host, "opencode-go"))?.key;

    if (!key) {
        return undefined;
    }

    const payload = (await request(
        "https://opencode.ai/zen/go/v1/usage",
        { authorization: `Bearer ${key}` },
        { signal },
    )) as { usage?: Record<string, { percent?: number; resetsAt?: string } | undefined> };
    const buckets: Bucket[] = [];

    for (const [id, window] of Object.entries(payload.usage ?? {})) {
        if (!window || typeof window.percent !== "number") {
            continue;
        }

        buckets.push({ label: id, pct: window.percent, resetsAt: toMs(window.resetsAt) });
    }

    return buckets.length > 0 ? { name: "OpenCode Go", buckets } : undefined;
}

async function collect(host: Host, signal: AbortSignal): Promise<Provider[]> {
    const settled = await Promise.allSettled([
        anthropic(host, signal),
        codex(signal),
        opencodeGo(host, signal),
        openrouter(host, signal),
    ]);

    return settled
        .map((each) => (each.status === "fulfilled" ? each.value : undefined))
        .filter((each): each is Provider => each !== undefined);
}

export default function createUsageLimits(host: Host, web: Web) {
    if (typeof web.client !== "function") {
        throw new Error("usage-limits needs Pi Pocket 0.14.0 or later. Update it and restart the server.");
    }

    let cache: { at: number; providers: Provider[] } | undefined;

    web.route("GET", "providers", async ({ query, signal }) => {
        if (query.get("fresh") === "1" || cache === undefined || Date.now() - cache.at > CACHE_MS) {
            cache = { at: Date.now(), providers: await collect(host, signal) };
        }

        return { providers: cache.providers, at: cache.at };
    });

    // A command cannot open a sheet itself: it tells the browser module, which opens it.
    web.command("usage-limits", {
        description: "Open the provider usage sheet",
        scope: "global",
        handler: (_args, ctx) => {
            web.send("show", {}, { to: ctx.user.id });

            return { type: "toast" as const, level: "info" as const, message: "Opening provider usage" };
        },
    });

    web.client("usage-limits");
}
