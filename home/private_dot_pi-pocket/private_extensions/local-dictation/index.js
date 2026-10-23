// Local dictation's browser part: a microphone button in the message box that records, has the word sent to
// `local-dictation.ts` to be transcribed on this machine, and puts the words into the box for the person to send.
// Nothing goes to a speech service, and nothing is sent by itself.

/** The version of `pocket` this module was written for: an older app does not load it. */
export const pocketApi = 1;

/** A microphone, as a 24×24 stroked path like the app's own icons. */
const MIC =
    "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3";

/** What the model takes: 16 kHz mono 16-bit PCM. */
const RATE = 16000;
/** Bytes of PCM in one request: base64 keeps it well under a route's 1 MB body. */
const PART_BYTES = 300_000;
/** Shorter than this is a tap, not a word. */
const MIN_SECONDS = 0.35;

/** A WAV recorder's type, in the order the browsers name them: Chrome and Safari differ. */
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

/** Bytes as base64, in pieces: one call with a whole recording would exceed the stack. */
function toBase64(bytes) {
    let text = "";

    for (let at = 0; at < bytes.length; at += 0x8000) {
        text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    }

    return btoa(text);
}

/** What the recorder heard, as 16 kHz mono 16-bit samples. */
async function toPcm(blob) {
    const context = new AudioContext();
    let decoded;

    try {
        decoded = await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
        await context.close();
    }

    if (decoded.duration < MIN_SECONDS) {
        throw new Error("Too short to transcribe.");
    }

    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
    const source = offline.createBufferSource();

    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();

    const channel = (await offline.startRendering()).getChannelData(0);
    const pcm = new Int16Array(channel.length);

    for (let at = 0; at < channel.length; at++) {
        pcm[at] = Math.max(-1, Math.min(1, channel[at])) * 0x7fff;
    }

    return pcm;
}

/** @param {import("../_pocket.d.ts").Pocket} pocket */
export default function setup(pocket) {
    let recorder = null;
    let stream = null;
    let busy = false;

    const button = pocket.composerButton({
        id: "mic",
        title: "Dictate on this machine",
        iconPath: MIC,
        run: () => void toggle(),
    });

    const idle = () => button.update({ title: "Dictate on this machine", badge: null });

    async function start() {
        if (typeof MediaRecorder === "undefined") {
            pocket.notify("error", "This browser cannot record audio.");

            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
        } catch (failure) {
            pocket.notify("error", `No microphone: ${failure.message ?? failure}`);

            return;
        }

        const type = TYPES.find((each) => MediaRecorder.isTypeSupported(each));
        const chunks = [];

        recorder = new MediaRecorder(stream, type === undefined ? {} : { mimeType: type });
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        recorder.onstop = () => void transcribe(chunks);
        recorder.start();
        button.update({ title: "Stop dictating", badge: "rec" });
        // The model loads on demand: start it now, so it is ready when the person stops speaking.
        pocket.api("warm", {}).catch((failure) => pocket.notify("error", String(failure.message ?? failure)));
    }

    function stop() {
        if (recorder === null) {
            return;
        }

        const current = recorder;

        recorder = null;
        idle();
        current.stop();
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
    }

    function toggle() {
        if (busy) {
            return;
        }

        if (recorder === null) {
            void start();
        } else {
            stop();
        }
    }

    /** Sends the recording in parts, then has the server transcribe it whole: split audio loses words at the cuts. */
    async function transcribe(chunks) {
        busy = true;
        button.update({ title: "Transcribing…", badge: null });

        try {
            if (chunks.length === 0) {
                throw new Error("Nothing was recorded.");
            }

            const pcm = await toPcm(new Blob(chunks, { type: chunks[0].type }));

            if (pcm.length < RATE * MIN_SECONDS) {
                throw new Error("Too short to transcribe.");
            }

            const id = crypto.randomUUID();
            const samples = PART_BYTES / 2;

            for (let seq = 0, at = 0; at < pcm.length; seq++, at += samples) {
                const part = pcm.subarray(at, at + samples);

                await pocket.api("audio", {
                    id,
                    seq,
                    pcm: toBase64(new Uint8Array(part.buffer, part.byteOffset, part.byteLength)),
                });
            }

            const { text } = await pocket.api("transcribe", { id });

            if (text === "") {
                throw new Error("Nothing was recognised.");
            }

            pocket.insertText(text);
        } catch (failure) {
            pocket.notify("error", String(failure.message ?? failure));
        } finally {
            busy = false;
            idle();
        }
    }

    return () => {
        stop();
        button.remove();
    };
}
