/**
 * pi-dictation — this machine's speech-to-text endpoint.
 *
 * It transcribes 16 kHz mono WAV with transcribe.cpp on the GGUF model Handy
 * already downloaded, and does nothing else. The phone-facing recorder lives in
 * the pi-web mic shim, which is its only client, so there is no page here and it
 * listens on loopback alone. Audio never leaves this machine.
 *
 *   GET  /health      model name, whether it is warm, and any load error
 *   POST /transcribe  16 kHz mono WAV bytes in, { text, ms, audioSeconds } out
 */
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { TranscribeModel } from 'transcribe-cpp';

const PORT = Number(process.env.PI_DICTATION_PORT ?? 8791);
const HOST = process.env.PI_DICTATION_HOST ?? '127.0.0.1';
const LANGUAGE = process.env.PI_DICTATION_LANGUAGE ?? 'uk';
/** One dictation posting more than this is a bug or an attack, not speech. */
const MAX_BYTES = 32 * 1024 * 1024;
const TARGET_RATE = 16000;

/** The whisper.cpp family model Handy keeps, newest Q8_0 turbo preferred. */
function findModel(): string {
  const configured = process.env.PI_DICTATION_MODEL?.trim();
  if (configured) return configured;

  const hub = join(homedir(), '.cache', 'huggingface', 'hub');
  const candidates: string[] = [];
  for (const repo of readdirSync(hub).filter((name) =>
    name.startsWith('models--handy-computer--whisper-'),
  )) {
    const snapshots = join(hub, repo, 'snapshots');
    for (const revision of readdirSync(snapshots)) {
      const dir = join(snapshots, revision);
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.gguf')) candidates.push(join(dir, file));
      }
    }
  }
  const turbo = candidates.filter((path) => path.includes('large-v3-turbo'));
  const chosen = [
    turbo.find((path) => path.includes('Q8_0')),
    turbo[0],
    candidates[0],
  ].find(Boolean);
  if (!chosen) {
    throw new Error(
      'no Handy whisper GGUF under ~/.cache/huggingface/hub; set PI_DICTATION_MODEL',
    );
  }
  return chosen;
}

const MODEL_PATH = findModel();
const MODEL_NAME = MODEL_PATH.split('/').pop() ?? MODEL_PATH;

let model: TranscribeModel | null = null;
let warming: Promise<void> | null = null;
let warmError: string | null = null;

/**
 * Loads the model once and keeps it resident: a cold load takes ~16 s on an
 * M4 Pro (Metal + ~900 MB of weights), a warm transcription runs ~20x faster
 * than real time, so paying that once at startup is what makes the button in
 * pi-web feel instant.
 */
function warm(): Promise<void> {
  warming ??= (async () => {
    const started = Date.now();
    try {
      model = await TranscribeModel.load(MODEL_PATH);
      console.log(
        `pi-dictation: ${MODEL_NAME} ready in ${Date.now() - started} ms`,
      );
    } catch (error) {
      warmError = error instanceof Error ? error.message : String(error);
      console.error(`pi-dictation: model load failed: ${warmError}`);
    }
  })();
  return warming;
}

/** 16-bit PCM WAV to mono float samples, with the header read rather than guessed. */
function wavToPcm(buf: Buffer): {
  pcm: Float32Array;
  sampleRate: number;
  seconds: number;
} {
  if (
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('not a WAV file');
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = view.getUint32(pos + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(pos + 10, true);
      sampleRate = view.getUint32(pos + 12, true);
      bits = view.getUint16(pos + 22, true);
    } else if (id === 'data') {
      dataOffset = pos + 8;
      dataLength = Math.min(size, buf.length - dataOffset);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (dataOffset < 0 || sampleRate === 0 || channels === 0)
    throw new Error('WAV has no fmt/data chunk');
  if (bits !== 16) throw new Error(`expected 16-bit PCM, got ${bits}-bit`);
  if (Math.abs(sampleRate - TARGET_RATE) > 1)
    throw new Error(`expected ${TARGET_RATE} Hz, got ${sampleRate} Hz`);

  const frames = Math.floor(dataLength / 2 / channels);
  const pcm = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    pcm[frame] = view.getInt16(dataOffset + frame * channels * 2, true) / 32768;
  }
  return { pcm, sampleRate, seconds: frames / sampleRate };
}

function failure(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  // A long dictation plus a cold model load can take a while on the first try.
  idleTimeout: 255,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return Response.json({
        ok: true,
        port: PORT,
        model: MODEL_NAME,
        language: LANGUAGE,
        ready: model !== null,
        warming: warming !== null && model === null && warmError === null,
        error: warmError,
      });
    }

    if (pathname === '/transcribe' && request.method === 'POST') {
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > MAX_BYTES) return failure('recording too large', 413);

      const body = Buffer.from(await request.arrayBuffer());
      if (body.length === 0) return failure('empty body', 400);
      if (body.length > MAX_BYTES) return failure('recording too large', 413);

      let audio: { pcm: Float32Array; seconds: number };
      try {
        audio = wavToPcm(body);
      } catch (error) {
        return failure(
          error instanceof Error ? error.message : String(error),
          400,
        );
      }
      if (audio.pcm.length < TARGET_RATE / 4)
        return failure('recording is too short to transcribe', 400);

      await warm();
      if (!model) return failure(warmError ?? 'model is still loading', 503);

      try {
        const started = Date.now();
        const result = await model.transcribe(audio.pcm, {
          language: LANGUAGE,
        });
        const ms = Date.now() - started;
        console.log(
          `pi-dictation: ${audio.seconds.toFixed(1)} s audio -> ${result.text.length} chars in ${ms} ms`,
        );
        return Response.json({
          text: result.text.trim(),
          ms,
          audioSeconds: audio.seconds,
          language: result.language || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`pi-dictation: transcription failed: ${message}`);
        return failure(message, 500);
      }
    }

    return failure(`unknown endpoint ${pathname}`, 404);
  },
});

void warm();
console.log(
  `pi-dictation: listening on http://${HOST}:${server.port} with ${MODEL_NAME} (language ${LANGUAGE})`,
);
