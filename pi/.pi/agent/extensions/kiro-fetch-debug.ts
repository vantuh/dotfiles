import type { ExtensionAPI } from "@mariozechner/pi";

export default function (_pi: ExtensionAPI) {
  if (!process.env.KIRO_FETCH_DEBUG) return;

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("amazonaws.com") || url.includes("kiro.dev")) {
      const target = init?.headers && (init.headers as Record<string, string>)["X-Amz-Target"];
      const tag = target?.includes("GenerateAssistantResponse")
        ? "🤖 API"
        : target?.includes("ListAvailableProfiles")
          ? "👤 PROFILE"
          : target?.includes("GetUsageLimits")
            ? "📊 USAGE"
            : url.includes("oidc.")
              ? "🔑 OIDC"
              : url.includes("auth.desktop.kiro")
                ? "🔑 DESKTOP"
                : "❓ AWS";
      console.error(`[kiro] ${tag} → ${url}`);
    }
    return origFetch(input, init);
  };
}
