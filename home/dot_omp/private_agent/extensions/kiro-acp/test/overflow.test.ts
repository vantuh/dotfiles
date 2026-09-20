// Test: classifyKiroContextOverflow prefixes kiro context-limit errors with
// omp's generic overflow marker (drives auto-compaction recovery), while
// leaving rate limits and already-classified errors untouched.
// Run: test/run-all.sh test/overflow.test.ts

import {
  classifyKiroContextOverflow,
  KIRO_ACP_PROVIDER,
} from "../overflow.ts";

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

const kiroMessage = (errorMessage: string) => ({
  role: "assistant",
  stopReason: "error",
  provider: KIRO_ACP_PROVIDER,
  errorMessage,
});

{
  const classified = classifyKiroContextOverflow(
    kiroMessage("Maximum allowed input is 200000 tokens, but 250000 were sent"),
  );
  assert(
    classified?.startsWith("context_length_exceeded: ") ?? false,
    "a kiro context-limit error gains the omp overflow marker",
  );
  assert(
    classified?.includes("Maximum allowed input is 200000 tokens"),
    "the original error text is preserved after the marker",
  );
}

{
  assert(
    classifyKiroContextOverflow(
      kiroMessage("request failed: too many requests, throttled"),
    ) === undefined,
    "a rate-limit error is not classified as overflow",
  );
}

{
  assert(
    classifyKiroContextOverflow(
      kiroMessage("context_length_exceeded: Maximum context length exceeded"),
    ) === undefined,
    "an already-classified error is not re-prefixed",
  );
}

{
  assert(
    classifyKiroContextOverflow({
      role: "assistant",
      stopReason: "stop",
      provider: KIRO_ACP_PROVIDER,
      errorMessage: "context limit exceeded",
    }) === undefined,
    "a non-error stopReason is never classified",
  );
}

{
  assert(
    classifyKiroContextOverflow({
      role: "assistant",
      stopReason: "error",
      provider: "anthropic",
      errorMessage: "context limit exceeded",
    }) === undefined,
    "another provider's error is left alone",
  );
}

{
  assert(
    classifyKiroContextOverflow(
      kiroMessage("unexpected backend failure"),
    ) === undefined,
    "an unrelated kiro error is left alone",
  );
}

console.log("✓ all overflow tests passed");
