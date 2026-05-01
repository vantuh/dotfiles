import type { ExtensionAPI, OAuthCredentials } from "@mariozechner/pi";

const FORCED_REGION = "us-east-1";
const BASE_URL = `https://q.${FORCED_REGION}.amazonaws.com/generateAssistantResponse`;

export default function (pi: ExtensionAPI) {
	// Override the kiro provider to always use us-east-1, regardless of
	// the region embedded in the auth token (which is eu-central-1 for this account).
	// The CodeWhisperer profile ARN lives in us-east-1, so all requests must go there.
	pi.registerProvider("kiro", {
		oauth: {
			// Patch refreshToken: force region to us-east-1 on every credential refresh
			async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
				return { ...credentials, region: FORCED_REGION };
			},
			// Patch modifyModels: always route to us-east-1 regardless of cred.region
			modifyModels(models, _credentials) {
				return models.map((m) =>
					m.provider === "kiro" ? { ...m, baseUrl: BASE_URL } : m
				);
			},
		},
	});

	// Also suppress the now-harmless profileArn warning (eu endpoint returns empty profiles)
	const originalWarn = console.warn.bind(console);
	console.warn = (...args: unknown[]) => {
		const msg = typeof args[0] === "string" ? args[0] : "";
		if (msg.startsWith("[pi-provider-kiro] Failed to resolve profileArn")) return;
		originalWarn(...args);
	};
}
