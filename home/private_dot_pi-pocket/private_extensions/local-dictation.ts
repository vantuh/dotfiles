/**
 * Local dictation: a microphone button in the message box that records the browser's microphone and transcribes it on
 * this machine with transcribe.cpp, so no audio goes to a speech service.
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Web } from "./_pocket.d.ts";

/**
 * transcribe-cpp is not one of Pi Pocket's packages, so `run_after_20-install-local-dictation-deps.sh.tmpl` installs it
 * in the browser module's folder, and it is imported by path: Node looks for packages only in `node_modules` beside here.
 */
const BINDINGS = join(
    import.meta.dirname,
    "local-dictation",
    "node_modules",
    "transcribe-cpp",
    "dist",
    "index.js",
);
const LANGUAGE = process.env.PI_DICTATION_LANGUAGE ?? "uk";
/** The model holds ~900 MB with Metal, so it goes after this long without a dictation and loads again at the next one. */
const IDLE_MS = Number(process.env.PI_DICTATION_IDLE_MINUTES ?? 10) * 60_000;
const RATE = 16_000;
/** Past this, memory is the risk, not the model. */
const MAX_BYTES = 32 * 1024 * 1024;
/** A recording that the browser never finished sending is dropped after this long. */
const STALE_MS = 10 * 60_000;

/** The part of transcribe-cpp's `TranscribeModel` used here. */
interface Model {
    transcribe(pcm: Float32Array, options: { language: string }): Promise<{ text: string }>;
    dispose(): void;
}

/** The parts of one recording that the browser sent, by part number, while it records. */
interface Recording {
    chunks: Map<number, Buffer>;
    bytes: number;
    at: number;
}

/** The whisper GGUF that Handy downloaded, the Q8_0 large-v3-turbo first. */
function findModel(): string {
    const configured = process.env.PI_DICTATION_MODEL?.trim();

    if (configured) {
        return configured;
    }

    const hub = join(homedir(), ".cache", "huggingface", "hub");
    const candidates: string[] = [];

    for (const repo of readdirSync(hub).filter((name) => name.startsWith("models--handy-computer--whisper-"))) {
        const snapshots = join(hub, repo, "snapshots");

        for (const revision of readdirSync(snapshots)) {
            const dir = join(snapshots, revision);

            for (const file of readdirSync(dir)) {
                if (file.endsWith(".gguf")) {
                    candidates.push(join(dir, file));
                }
            }
        }
    }

    const turbo = candidates.filter((path) => path.includes("large-v3-turbo"));
    const chosen = [turbo.find((path) => path.includes("Q8_0")), turbo[0], candidates[0]].find(Boolean);

    if (chosen === undefined) {
        throw new Error("No Handy whisper GGUF under ~/.cache/huggingface/hub. Set PI_DICTATION_MODEL.");
    }

    return chosen;
}

/** Raw little-endian 16-bit PCM as the float samples the model takes. */
function toFloat(pcm: Buffer): Float32Array {
    const samples = new Float32Array(pcm.length >> 1);

    for (let at = 0; at < samples.length; at++) {
        samples[at] = pcm.readInt16LE(at * 2) / 32768;
    }

    return samples;
}

function idOf(value: unknown, web: Web): string {
    const id = typeof value === "string" ? value : "";

    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
        throw web.error(400, "Bad recording id.");
    }

    return id;
}

function partOf(value: unknown, web: Web): Buffer {
    const text = typeof value === "string" ? value : "";
    const pcm = Buffer.from(text, "base64");

    if (pcm.length === 0) {
        throw web.error(400, "An audio part was empty.");
    }

    return pcm;
}

export default function createLocalDictation(_host: unknown, web: Web) {
    if (typeof web.route !== "function" || typeof web.client !== "function") {
        throw new Error("local-dictation needs Pi Pocket 0.14.0 or later. Update it and restart the server.");
    }

    const recordings = new Map<string, Recording>();
    let loading: Promise<Model> | null = null;
    let idle: NodeJS.Timeout | undefined;
    let gone = false;

    // Loaded at the first use, not with the module: a reload then never holds two models at once.
    function model(): Promise<Model> {
        clearTimeout(idle);

        if (loading === null) {
            const started = (async () => {
                const { TranscribeModel } = await import(pathToFileURL(BINDINGS).href);
                const loaded: Model = await TranscribeModel.load(findModel());

                if (gone) {
                    loaded.dispose();

                    throw new Error("Local dictation was turned off.");
                }

                return loaded;
            })();

            loading = started;
            // A failed load is tried again at the next dictation.
            started.catch(() => {
                if (loading === started) {
                    loading = null;
                }
            });
        }

        return loading;
    }

    // dispose() waits behind the model's own lock, so a transcription that still runs finishes first.
    function unload(): void {
        clearTimeout(idle);
        void loading?.then((loaded) => loaded.dispose(), () => undefined);
        loading = null;
    }

    function rest(): void {
        clearTimeout(idle);
        idle = setTimeout(unload, IDLE_MS);
        idle.unref();
    }

    function failed(failure: unknown): Error {
        return web.error(503, `The dictation model did not load: ${failure instanceof Error ? failure.message : failure}`);
    }

    // The browser asks for this when recording starts, so the model loads while the person speaks.
    web.route("POST", "warm", async () => {
        try {
            await model();
        } catch (failure) {
            throw failed(failure);
        }

        rest();

        return { ok: true };
    });

    // Audio reaches the server through these routes: the page's content security policy allows no other site.
    web.route("POST", "audio", ({ body }) => {
        const id = idOf(body.id, web);
        const seq = Number(body.seq);

        if (!Number.isInteger(seq) || seq < 0) {
            throw web.error(400, "Bad part number.");
        }

        const now = Date.now();

        for (const [each, recording] of recordings) {
            if (now - recording.at > STALE_MS) {
                recordings.delete(each);
            }
        }

        const pcm = partOf(body.pcm, web);
        const recording = recordings.get(id) ?? { chunks: new Map<number, Buffer>(), bytes: 0, at: now };
        const before = recording.chunks.get(seq)?.length ?? 0;

        recording.chunks.set(seq, pcm);
        recording.bytes += pcm.length - before;
        recording.at = now;

        if (recording.bytes > MAX_BYTES) {
            recordings.delete(id);

            throw web.error(413, "That recording is too long.");
        }

        recordings.set(id, recording);

        return { bytes: recording.bytes };
    });

    web.route("POST", "transcribe", async ({ body }) => {
        const id = idOf(body.id, web);
        const recording = recordings.get(id);

        recordings.delete(id);

        if (recording === undefined) {
            throw web.error(400, "That recording is gone. Send it again.");
        }

        const pcm = Buffer.concat(
            [...recording.chunks.entries()].sort(([a], [b]) => a - b).map(([, part]) => part),
        );

        if (pcm.length < RATE / 2) {
            throw web.error(400, "Too short to transcribe.");
        }

        let loaded: Model;

        try {
            loaded = await model();
        } catch (failure) {
            throw failed(failure);
        }

        try {
            const { text } = await loaded.transcribe(toFloat(pcm), { language: LANGUAGE });

            return { text: text.trim() };
        } catch (failure) {
            throw web.error(500, `Transcription failed: ${failure instanceof Error ? failure.message : failure}`);
        } finally {
            rest();
        }
    });

    web.onDispose(() => {
        gone = true;
        recordings.clear();
        unload();
    });
    web.client("local-dictation");
}
