/**
 * Local dictation: a microphone button in the message box that records the browser's microphone and transcribes it on
 * this machine with the pi-dictation daemon, so no audio goes to a speech service.
 */
import type { Web } from "./_pocket.d.ts";

/** The daemon of `~/.local/bin/pi-dictation.ts`: loopback only, 16 kHz mono 16-bit WAV in, `{ text }` out. */
const DAEMON = (process.env.PI_POCKET_DICTATION ?? "http://127.0.0.1:8791").replace(/\/+$/, "");
const RATE = 16_000;
/** The daemon's own cap on one recording; past it, memory is the risk, not the model. */
const MAX_BYTES = 32 * 1024 * 1024;
/** A recording that the browser never finished sending is dropped after this long. */
const STALE_MS = 10 * 60_000;
const HEALTH_TIMEOUT_MS = 2_000;

/** The parts of one recording that the browser sent, by part number, while it records. */
interface Recording {
    chunks: Map<number, Buffer>;
    bytes: number;
    at: number;
}

const recordings = new Map<string, Recording>();

/** What to tell the person when the daemon is not there: the command that starts it, which is the usual cause. */
function unreachable(failure: unknown): string {
    const reason = failure instanceof Error ? failure.message : String(failure);

    return `The dictation daemon at ${DAEMON} did not answer (${reason}). Start it with \`dictate up\`.`;
}

/** A 16 kHz mono 16-bit WAV around raw little-endian PCM, as the daemon takes it. */
function wav(pcm: Buffer): Buffer {
    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);

    return Buffer.concat([header, pcm]);
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

    web.route("GET", "health", async () => {
        try {
            const response = await fetch(`${DAEMON}/health`, {
                signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
            });
            const status = await response.json().catch(() => ({}));

            return { ok: response.ok, ...status };
        } catch (failure) {
            return { ok: false, error: unreachable(failure) };
        }
    });

    // Audio reaches the daemon through these routes: the page's content security policy allows no other site.
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

    web.route("POST", "transcribe", async ({ body, signal }) => {
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

        let response: Response;

        try {
            response = await fetch(`${DAEMON}/transcribe`, {
                method: "POST",
                headers: { "content-type": "audio/wav" },
                body: wav(pcm),
                signal,
            });
        } catch (failure) {
            if (signal.aborted) {
                throw web.error(499, "The recording was cancelled.");
            }

            throw web.error(503, unreachable(failure));
        }

        const payload = (await response.json().catch(() => ({}))) as {
            text?: string;
            ms?: number;
            audioSeconds?: number;
            error?: string;
        };

        if (!response.ok) {
            throw web.error(502, payload.error ?? `The dictation daemon answered ${response.status}.`);
        }

        return {
            text: (payload.text ?? "").trim(),
            ms: payload.ms,
            audioSeconds: payload.audioSeconds,
        };
    });

    web.onDispose(() => recordings.clear());
    web.client("local-dictation");
}
