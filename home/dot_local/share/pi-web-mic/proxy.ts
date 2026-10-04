/**
 * The mic shim: pi-web with a microphone button in its composer, without
 * touching pi-web's own code.
 *
 * It sits in front of pi-web on loopback, serves three of its own assets, and
 * injects one <script> tag into HTML responses. Everything else — pages, JSON,
 * files, and the SSE stream pi-web pushes events over — is passed through.
 *
 * The recorder talks to /__mic/transcribe here rather than to the dictation
 * daemon directly, so the page stays same-origin and needs no CORS.
 */
import { join } from 'node:path';

const UPSTREAM = process.env.PI_WEB_MIC_UPSTREAM ?? 'http://127.0.0.1:30141';
const DICTATION = process.env.PI_WEB_MIC_DICTATION ?? 'http://127.0.0.1:8791';
const PORT = Number(process.env.PI_WEB_MIC_PORT ?? 8788);
const DIR = import.meta.dir;

function asset(file: string, type: string): Response {
  return new Response(Bun.file(join(DIR, file)), {
    headers: { 'content-type': type, 'cache-control': 'no-store' },
  });
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  // Long enough for a dictation and for a cold model load on the first try.
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/__mic/mic.js' || url.pathname === '/__mic.js')
      return asset('mic.js', 'text/javascript; charset=utf-8');
    if (url.pathname === '/__mic/worklet.js') {
      return asset('worklet.js', 'text/javascript; charset=utf-8');
    }
    if (url.pathname === '/__mic/transcribe' && request.method === 'POST') {
      return fetch(`${DICTATION}/transcribe`, {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') ?? 'audio/wav',
        },
        body: await request.arrayBuffer(),
      });
    }

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('content-length');
    headers.delete('accept-encoding');
    // pi-web accepts an API request only when the Origin it sees matches the
    // Host it sees. A proxied request must therefore arrive as if the browser
    // had talked to pi-web directly, whatever origin the browser used.
    if (headers.has('origin')) headers.set('origin', UPSTREAM);
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();

    const response = await fetch(new URL(url.pathname + url.search, UPSTREAM), {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: 'manual',
    });

    const type = response.headers.get('content-type') ?? '';
    // fetch decodes a compressed body, so the encoding headers must not survive:
    // a browser that sees `content-encoding: gzip` beside plain bytes fails the
    // request with ERR_CONTENT_DECODING_FAILED, and then nothing loads.
    const out = new Headers(response.headers);
    for (const header of [
      'content-length',
      'content-encoding',
      'transfer-encoding',
    ]) {
      out.delete(header);
    }

    if (!type.includes('text/html')) {
      return new Response(response.body, {
        status: response.status,
        headers: out,
      });
    }
    const html = await response.text();
    // A document that stays cached would keep the script tag this shim injected
    // the day it was fetched, and the button would silently disappear after a
    // change here.
    out.set('cache-control', 'no-store');
    out.set('content-type', 'text/html; charset=utf-8');
    // Injected before `</body>`, in the body rather than the head: React 19
    // hydrates the head as well, and an extra node there makes it discard the
    // whole client render (a blank page). The body placement is what the
    // prototype ran with. The script itself must also avoid touching the
    // document before hydration — see mic.js.
    const withScript = html.includes('</body>')
      ? html.replace('</body>', '<script src="/__mic/mic.js" defer></script></body>')
      : `${html}<script src="/__mic/mic.js" defer></script>`;
    return new Response(withScript, {
      status: response.status,
      headers: out,
    });
  },
});

console.log(
  `pi-web mic shim: http://127.0.0.1:${server.port} -> ${UPSTREAM} (dictation ${DICTATION})`,
);
