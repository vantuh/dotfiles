// Subagent models, in the app: a row in the Menu and an action in the launcher open one sheet with the roles of
// `~/.pi/agent/agents/`; a pick writes that role's model into its profile, which `server.ts` reads at each spawn.

/** The version of `pocket` this module was written for: an older app does not load it. */
export const pocketApi = 1;

/** A model id is long: rows show its last part, the sheet under a role shows all of it. */
const short = (spec) => (spec.includes("/") ? spec.slice(spec.indexOf("/") + 1) : spec);

const facts = (model) =>
    [
        model.contextWindow && `${Math.round(model.contextWindow / 1000)}k context`,
        model.cost && `$${model.cost.input} in · $${model.cost.output} out per 1M`,
    ]
        .filter(Boolean)
        .join(" · ");

/** Two lines on the left, one short value on the right: the app's own row, which wants them to fit any width. */
const LEFT = "flex-direction:column;align-items:flex-start;gap:0;min-width:0";
const UNDER = "display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
const RIGHT = "flex:0 0 auto;white-space:nowrap";

export default function setup(pocket) {
    const { html, useEffect, useState } = pocket;

    function Roles() {
        const [data, setData] = useState(null);
        const [error, setError] = useState(null);
        const [picked, setPicked] = useState(null);
        const [busy, setBusy] = useState(null);
        const [status, setStatus] = useState(null);

        useEffect(() => {
            const stop = new AbortController();

            pocket.api("roles", undefined, { signal: stop.signal }).then(
                (next) => setData(next),
                (failure) => {
                    if (!stop.signal.aborted) setError(failure.message);
                },
            );

            return () => stop.abort();
        }, []);

        if (error) {
            return html`<div class="error-box">${error}</div>`;
        }

        if (!data) {
            return html`<p class="muted">Reading your subagents…</p>`;
        }

        const role = picked === null ? undefined : data.roles.find((each) => each.name === picked);

        const save = async (model) => {
            setBusy(model ?? "default");
            try {
                const next = await pocket.api("model", { name: role.name, model });
                setData((was) => ({ ...was, roles: next.roles }));
                setError(null);
                setStatus(`${role.name} → ${model === null ? "Pi default" : model}`);
                setPicked(null);
            } catch (failure) {
                setError(failure.message);
            } finally {
                setBusy(null);
            }
        };

        if (role !== undefined) {
            const models = [...data.models];
            // A model that the owner took off the list stays visible, so a role that uses it can be seen and changed.
            if (role.model !== undefined && !models.some((each) => each.spec === role.model)) {
                models.unshift({ spec: role.model, name: short(role.model) });
            }

            return html`<div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                    <button class="button" disabled=${busy !== null} onClick=${() => setPicked(null)}>Back</button>
                    <span class="small">Model for <span style="font-weight:600">${role.name}</span></span>
                </div>
                ${
                    models.length === 0 &&
                    html`<p class="muted">
                        No models for subagents yet. Add them in Menu → Providers → Models for subagents.
                    </p>`
                }
                ${
                    role.model !== undefined &&
                    html`<button class="list-item" disabled=${busy !== null} onClick=${() => save(null)}>
                        <span style=${LEFT}>
                            <span style="font-weight:600">Pi default</span>
                            <span class="muted small" style=${UNDER}>no model: the role runs on its session's model</span>
                        </span>
                        <span class="muted small" style=${RIGHT}>${busy === "default" ? "saving…" : ""}</span>
                    </button>`
                }
                ${models.map((model) => {
                    const chosen = model.spec === role.model;
                    const allowed = data.models.some((each) => each.spec === model.spec);

                    return html`<button
                        class="list-item"
                        disabled=${busy !== null || !allowed}
                        onClick=${() => save(model.spec)}
                    >
                        <span style=${LEFT}>
                            <span style=${chosen ? "font-weight:600" : ""}>${model.name}</span>
                            <span class="muted small mono" style=${UNDER}>
                                ${model.spec}${allowed && facts(model) ? ` · ${facts(model)}` : ""}
                            </span>
                        </span>
                        <span class=${allowed ? "muted small" : "warn small"} style=${RIGHT}>
                            ${chosen
                                ? "now"
                                : busy === model.spec
                                  ? "saving…"
                                  : allowed
                                    ? ""
                                    : "not allowed"}
                        </span>
                    </button>`;
                })}
                <p class="muted small">
                    The model goes into the role's profile, so its next subagent starts on it.
                </p>
            </div>`;
        }

        return html`<div>
            ${
                status !== null &&
                html`<p class="small" style="margin-bottom:10px">Saved: ${status}</p>`
            }
            ${
                data.roles.length === 0 &&
                html`<p class="muted">No roles in your agents folder.</p>`
            }
            ${data.roles.map(
                (each) => html`<button
                    class="list-item"
                    onClick=${() => {
                        setStatus(null);
                        setPicked(each.name);
                    }}
                >
                    <span style=${LEFT}>
                        <span style="font-weight:600">${each.name}</span>
                        ${each.description && html`<span class="muted small" style=${UNDER}>${each.description}</span>`}
                    </span>
                    <span
                        class=${each.allowed ? "mono small" : "warn small"}
                        style=${RIGHT}
                        title=${each.model ?? "Pi default"}
                    >
                        ${each.model === undefined ? "Pi default" : short(each.model)}
                        ${each.allowed ? "" : " · not allowed"}
                    </span>
                </button>`,
            )}
            <p class="muted small">
                A role runs on the model here, whatever Pi asks for. The models a subagent may use at all are chosen
                in Menu → Providers; a role without one runs on its session's model.
            </p>
        </div>`;
    }

    pocket.sheet({ id: "roles", title: "Subagent models", component: Roles, wide: true });
    pocket.menu({
        id: "roles",
        label: "Subagent models",
        hint: "the model of each subagent",
        sheet: "roles",
    });

    if (typeof pocket.launcher === "function") {
        pocket.launcher({
            id: "roles",
            label: "Subagent models",
            detail: "the model of each subagent",
            icon: "grid",
            keywords: ["subagent", "agents", "roles", "model"],
            sheet: "roles",
        });
    }
}
