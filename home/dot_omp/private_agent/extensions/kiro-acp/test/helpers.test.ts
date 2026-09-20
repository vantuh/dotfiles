// Test: buildPromptParts prompt assembly (omp string[] systemPrompt).
// Run: test/run-all.sh test/helpers.test.ts

import {
  buildPromptParts,
  lastUserMessage,
  stampAssistantTiming,
} from "../helpers.ts";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";

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

{
  // omp appends role:"developer" reminders after the user turn; they are
  // part of the current input, not a replay of the original message.
  const context: Context = {
    systemPrompt: ["S"],
    messages: [
      { role: "user", content: "Run the tests", timestamp: 1 } as Context["messages"][number],
      { role: "developer", content: "Continue from the failing test.", timestamp: 2 } as Context["messages"][number],
    ],
  };
  const current = lastUserMessage(context);
  assert(
    current.includes("Run the tests") && current.includes("Continue from the failing test."),
    "trailing developer reminder is appended to the current prompt",
  );

  const replay = buildPromptParts(context, true);
  assert(
    replay.userMessage.includes("Run the tests"),
    "history replay still carries the user message",
  );
}

{
  // Assistant work between the user turn and the developer reminder must not
  // be swallowed into the current prompt either.
  const context: Context = {
    systemPrompt: ["S"],
    messages: [
      { role: "user", content: "Run the tests", timestamp: 1 } as Context["messages"][number],
      { role: "assistant", content: "Working on it", timestamp: 2 } as Context["messages"][number],
      { role: "developer", content: "Reminder text", timestamp: 3 } as Context["messages"][number],
    ],
  };
  const current = lastUserMessage(context);
  assert(
    current.includes("Run the tests") && current.includes("Reminder text"),
    "developer reminder after assistant work is still appended",
  );
}

{
  // No trailing developer messages: prompt is exactly the user text.
  const context: Context = {
    systemPrompt: ["S"],
    messages: [
      { role: "user", content: "Just this", timestamp: 1 } as Context["messages"][number],
    ],
  };
  const current = lastUserMessage(context);
  assert(
    current === "Just this",
    "plain user turn yields the bare user text",
  );
}

{
  const output = { role: "assistant" } as AssistantMessage;
  stampAssistantTiming(output, 1000, 1400, 2500);
  assert(output.duration === 1500, "duration is now - startTime");
  assert(output.ttft === 400, "ttft is firstTokenTime - startTime");
}

{
  const output = { role: "assistant" } as AssistantMessage;
  stampAssistantTiming(output, 1000, undefined, 2500);
  assert(output.duration === 1500, "duration is stamped without a first token");
  assert(output.ttft === undefined, "ttft is omitted until the first chunk");
}
