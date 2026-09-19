// Test: buildPromptParts prompt assembly (omp string[] systemPrompt).
// Run: test/run-all.sh test/helpers.test.ts

import { buildPromptParts } from "../helpers.ts";
import type { Context } from "@earendil-works/pi-ai";

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

{
  // omp's Context.systemPrompt is string[] (pi passed a string).
  const context: Context = {
    systemPrompt: ["First block.", "Second block."],
    messages: [],
  };
  const parts = buildPromptParts(context, false);
  assert(
    parts.systemPrompt === "First block.\n\nSecond block.",
    "string[] systemPrompt is joined into one prompt string",
  );
}

{
  const context: Context = {
    systemPrompt: ["Only block."],
    messages: [],
  };
  const parts = buildPromptParts(context, false);
  assert(
    parts.systemPrompt === "Only block.",
    "single-block array is joined without separators",
  );
}

{
  // pi-style string input keeps working through the same path.
  const context: Context = {
    systemPrompt: "Plain system prompt.",
    messages: [],
  };
  const parts = buildPromptParts(context, false);
  assert(
    parts.systemPrompt === "Plain system prompt.",
    "plain string systemPrompt is preserved verbatim",
  );
}

{
  // Hash consumers must receive a string, never an array.
  const context: Context = {
    systemPrompt: ["Block"],
    messages: [],
  };
  const parts = buildPromptParts(context, false);
  assert(
    typeof parts.systemPrompt === "string",
    "joined systemPrompt is a string",
  );
}
