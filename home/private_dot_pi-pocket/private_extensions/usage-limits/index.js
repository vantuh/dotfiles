// Provider usage, in the app: a top bar button, a launcher action, and the `/usage-limits` command open one sheet with
// the rate-limit windows that `server.ts` reads on the server.

/** The version of `pocket` this module was written for: an older app does not load it. */
export const pocketApi = 1;

/** Percent as a width, and as its color: near the limit is trouble. */
const width = (pct) => `${Math.min(100, Math.max(0, pct ?? 0))}%`;
const color = (pct) =>
    pct === null ? "var(--muted)" : pct >= 90 ? "var(--err)" : pct >= 70 ? "var(--warn)" : "var(--accent)";
const percent = (pct) => (pct === null ? "—" : `${Math.round(pct)}%`);

/** "resets in 2d 3h", as the terminal's `/usage` says it. */
function until(resetsAt) {
    if (!resetsAt) {
        return "";
    }

    const mins = Math.max(0, Math.round((resetsAt - Date.now()) / 60_000));
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const parts = days > 0 ? [`${days}d`] : [];

    if (hours > 0) {
        parts.push(`${hours}h`);
    }

    if (days === 0) {
        parts.push(`${mins % 60}m`);
    }

    return parts.length > 0 ? `resets in ${parts.join(" ")}` : "resets shortly";
}

export default function setup(pocket) {
    const { html, useEffect, useState } = pocket;

    function Bucket({ bucket }) {
        const reset = until(bucket.resetsAt);

        return html`<div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
                <span class="small">${bucket.label}</span>
                <span class="mono small">${percent(bucket.pct)}</span>
            </div>
            <div
                style="height:6px;margin:4px 0 2px;border-radius:99px;background:var(--line);overflow:hidden"
                aria-hidden="true"
            >
                <div style=${`height:100%;width:${width(bucket.pct)};background:${color(bucket.pct)}`}></div>
            </div>
            ${reset && html`<div class="muted small">${reset}</div>`}
        </div>`;
    }

    function Usage() {
        const [data, setData] = useState(null);
        const [error, setError] = useState(null);
        const [busy, setBusy] = useState(false);

        const load = (fresh, signal) => {
            setBusy(true);
            pocket
                .api(fresh ? "providers?fresh=1" : "providers", undefined, signal && { signal })
                .then(
                    (next) => {
                        setData(next);
                        setError(null);
                        setBusy(false);
                    },
                    (failure) => {
                        if (!signal?.aborted) {
                            setError(failure.message);
                            setBusy(false);
                        }
                    },
                );
        };

        useEffect(() => {
            const stop = new AbortController();

            load(false, stop.signal);

            return () => stop.abort();
        }, []);

        if (error) {
            return html`<div class="error-box">${error}</div>`;
        }

        if (!data) {
            return html`<p class="muted">Reading your providers…</p>`;
        }

        return html`<div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
                <span class="muted small">read ${new Date(data.at).toLocaleTimeString()}</span>
                <button class="button" disabled=${busy} onClick=${() => load(true)}>
                    ${busy ? "Reading…" : "Refresh"}
                </button>
            </div>
            ${data.providers.length === 0 &&
            html`<p class="muted">
                No provider usage available. Sign in to a provider in Menu → Providers.
            </p>`}
            ${data.providers.map(
                (provider) => html`<section>
                    <div style="font-weight:600;margin:14px 0 8px">${provider.name}</div>
                    ${provider.buckets.map((bucket) => html`<${Bucket} bucket=${bucket} />`)}
                    ${provider.note && html`<p class="muted small">${provider.note}</p>`}
                </section>`,
            )}
        </div>`;
    }

    pocket.sheet({ id: "usage", title: "Provider usage", component: Usage });

    // Top bar buttons and launcher actions are experimental in 0.19.0: an older app keeps the command alone.
    if (typeof pocket.topbar === "function") {
        pocket.topbar({ id: "usage", title: "Provider usage", icon: "pulse", sheet: "usage" });
    }

    if (typeof pocket.launcher === "function") {
        pocket.launcher({
            id: "usage",
            label: "Provider usage",
            detail: "the rate-limit windows of your providers",
            icon: "pulse",
            keywords: ["usage", "limits", "quota", "rate"],
            sheet: "usage",
        });
    }

    // `/usage-limits` runs on the server, which tells the tabs to open this sheet.
    return pocket.on("show", () => pocket.openSheet("usage"));
}
