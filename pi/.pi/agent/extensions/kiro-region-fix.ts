import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (_pi: ExtensionAPI) {
  const origFetch = globalThis.fetch;

  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const rewritten = url.replace("q.eu-central-1.amazonaws.com", "q.us-east-1.amazonaws.com");

    if (typeof input === "string") return origFetch(rewritten, init);

    if (input instanceof URL) return origFetch(new URL(rewritten), init);

    return origFetch(new Request(rewritten, input), init);
  };
}
