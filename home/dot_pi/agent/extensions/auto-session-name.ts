/**
 * Names a session from its conversation, the way Pi Web's "generate name"
 * button does: the whole transcript under a character budget, the session
 * model, strict title parsing, and no fallback. A failed run leaves the
 * session unnamed instead of writing a fragment of the user's own message,
 * which is how pi-autoname produced names like "так" or "Дякую".
 *
 * Auto-naming runs after a settled run and only while the session is unnamed,
 * so `/name`, `--name`, and a rename this process can see are left alone. A
 * rename made by another process is invisible here: the SDK reads session
 * names from its own in-memory entries and never re-reads the session file for
 * them. `/autoname` regenerates the name explicitly.
 */
import { randomUUID } from 'node:crypto';

import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import type {
  Api,
  AssistantMessage,
  Model,
  ModelThinkingLevel,
} from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

const TITLE_TIMEOUT_MS = 90_000;
/** A reasoning model shares this budget between thinking and the title. */
const TITLE_MAX_TOKENS = 512;
const MAX_TITLE_LENGTH = 80;

// Per-message caps: every user turn carries the goal, only the newest reply
// needs its body, and the replies between them only need their opening line.
// Tool calls and their results are dropped outright, because they dominate the
// token count while saying nothing about what the user wanted.
const USER_CHARS = 800;
const ASSISTANT_CHARS = 300;
const LAST_ASSISTANT_CHARS = 600;
const SUMMARY_CHARS = 600;
// Total budget across all messages, so a long session does not cost more to
// name than a short one.
const TRANSCRIPT_CHARS = 6000;
// Share reserved for the opening turns: a session states its goal early and
// then drifts into routine follow-ups, and naming it after its last chore is
// worse than naming it after the work it started with.
const TRANSCRIPT_HEAD_CHARS = Math.round(TRANSCRIPT_CHARS * 0.4);

const ELISION = '[…]';
const IMAGE_PLACEHOLDER = '[image]';

const TITLE_SYSTEM_PROMPT =
  'You name chat sessions from a transcript. Reply with the title only.';

const TITLE_PROMPT = `Create a concise title for this session based on the conversation above.

Requirements:
- Match the primary language used by the user.
- Describe the user's concrete goal or the outcome, not the act of chatting.
- Use 4-12 words for space-separated languages, or 8-24 characters for CJK text when practical.
- Do not call any tools.
- Return only the title as plain text, with no quotes, label, markdown, or explanation.`;

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts: string[] = [];
  let images = 0;
  for (const block of content as readonly unknown[]) {
    if (typeof block !== 'object' || block === null) continue;
    const { type } = block as { type?: unknown };
    if (type === 'text') {
      const { text } = block as { text?: unknown };
      if (typeof text === 'string') parts.push(text);
    } else if (type === 'image') {
      images += 1;
    }
  }

  const text = parts.join('\n').trim();
  if (images === 0) return text;
  const marker =
    images === 1 ? IMAGE_PLACEHOLDER : `${IMAGE_PLACEHOLDER} ×${images}`;
  return text ? `${text}\n${marker}` : marker;
}

/** Truncates by code point so a clip never splits a surrogate pair. */
function clip(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length <= max
    ? text
    : `${characters.slice(0, max).join('')}…`;
}

/**
 * A title needs the goal the session opened with and the outcome it reached.
 * The middle is what makes a long session expensive, so keep both ends and
 * drop it: cost and latency then stop tracking session length.
 */
function boundTranscript(lines: readonly string[]): string {
  const joined = lines.join('\n\n');
  if (joined.length <= TRANSCRIPT_CHARS || lines.length < 2) return joined;

  const head: string[] = [];
  let used = ELISION.length + 4;
  let next = 0;
  // The first line always survives, however long the session is.
  for (; next < lines.length; next += 1) {
    const size = used + lines[next].length + 2;
    if (head.length > 0 && size > TRANSCRIPT_HEAD_CHARS) break;
    head.push(lines[next]);
    used = size;
  }

  const tail: string[] = [];
  for (let index = lines.length - 1; index >= next; index -= 1) {
    const size = used + lines[index].length + 2;
    if (size > TRANSCRIPT_CHARS) break;
    tail.unshift(lines[index]);
    used = size;
  }

  if (next + tail.length >= lines.length) return joined;
  return [...head, ELISION, ...tail].join('\n\n');
}

function lineForMessage(
  message: AgentMessage,
  lastAssistant: AgentMessage | undefined,
): string | undefined {
  if (
    message.role === 'compactionSummary' ||
    message.role === 'branchSummary'
  ) {
    const summary = message.summary.trim();
    return summary
      ? `[Earlier summary] ${clip(summary, SUMMARY_CHARS)}`
      : undefined;
  }
  if (message.role === 'custom') {
    const text = textOf(message.content).trim();
    return text ? `User: ${clip(text, USER_CHARS)}` : undefined;
  }
  if (message.role === 'bashExecution') {
    const command = message.command.trim();
    return command
      ? `User: ${clip(`Ran \`${command}\``, USER_CHARS)}`
      : undefined;
  }
  if (message.role !== 'user' && message.role !== 'assistant') return undefined;

  const text = textOf(message.content).trim();
  if (!text) return undefined;
  if (message.role === 'user') return `User: ${clip(text, USER_CHARS)}`;
  const cap =
    message === lastAssistant ? LAST_ASSISTANT_CHARS : ASSISTANT_CHARS;
  return `Assistant: ${clip(text, cap)}`;
}

/** Flattens the session into the plain-text transcript the title model reads. */
export function buildTitleTranscript(
  messages: readonly AgentMessage[],
): string {
  let lastAssistant: AgentMessage | undefined;
  for (const message of messages) {
    if (message.role === 'assistant' && textOf(message.content).trim()) {
      lastAssistant = message;
    }
  }

  const lines: string[] = [];
  for (const message of messages) {
    const line = lineForMessage(message, lastAssistant);
    if (line) lines.push(line);
  }
  return boundTranscript(lines);
}

function stripWrappingQuotes(value: string): string {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['\u201c', '\u201d'],
    ['\u300c', '\u300d'],
    ['\u300e', '\u300f'],
  ];
  for (const [start, end] of pairs) {
    if (value.startsWith(start) && value.endsWith(end) && value.length > 2) {
      return value.slice(start.length, -end.length).trim();
    }
  }
  return value;
}

/** Converges the model's free text into a single-line session name. */
export function parseGeneratedSessionTitle(raw: string): string {
  let value = raw.trim();
  const fenced = value.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) value = fenced[1].trim();

  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { title?: unknown };
      if (typeof parsed.title === 'string') value = parsed.title.trim();
    } catch {
      // Not JSON after all; the plain-text cleanup below still applies.
    }
  }

  value = value.split(/\r?\n/, 1)[0] ?? '';
  value = value.replace(
    /^(?:session\s+title|title|标题|назва|заголовок)\s*[:：-]\s*/i,
    '',
  );
  value = stripWrappingQuotes(value).replace(/\s+/g, ' ').trim();
  value = value.replace(/[。.!]+$/u, '').trim();

  if (!/[\p{L}\p{N}]/u.test(value)) {
    throw new Error('The model did not return a usable session title');
  }

  const characters = Array.from(value);
  if (characters.length > MAX_TITLE_LENGTH) {
    value = characters.slice(0, MAX_TITLE_LENGTH).join('').trim();
  }
  return value;
}

/**
 * Naming is a short classification task, so thinking only adds latency and
 * tokens: use the cheapest level the model supports. Gemini rejects "minimal"
 * and its SDK emits that level when thinking is disabled, so it skips to the
 * next supported level instead.
 */
function resolveTitleThinkingLevel(model: Model<Api>): ModelThinkingLevel {
  if (!model.reasoning) return 'off';
  // getSupportedThinkingLevels lists levels in ascending cost order.
  const supported = getSupportedThinkingLevels(model);
  const rejectsMinimal =
    model.api === 'google-generative-ai' || /gemini/i.test(model.id);
  const usable = rejectsMinimal
    ? supported.filter((level) => level !== 'off' && level !== 'minimal')
    : supported;
  return usable[0] ?? supported[0] ?? 'off';
}

function titleFromAssistant(message: AssistantMessage): string {
  if (message.stopReason === 'error') {
    throw new Error(message.errorMessage || 'The title model request failed');
  }
  if (message.stopReason === 'aborted') {
    throw new Error('Session title generation timed out');
  }

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The model did not return a session title');
  return parseGeneratedSessionTitle(text);
}

/** Asks the session model for a title of the current conversation. */
async function generateTitle(ctx: ExtensionContext): Promise<string> {
  const transcript = buildTitleTranscript(
    ctx.sessionManager.buildSessionProjection().messages,
  );
  if (!transcript.trim()) {
    throw new Error('The session has no usable text to name');
  }

  const model = ctx.model;
  if (!model) throw new Error('The session has no model to name it with');
  const thinking = resolveTitleThinkingLevel(model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
  try {
    const stream = ctx.modelRegistry.streamSimple(
      model,
      {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${transcript}\n\n${TITLE_PROMPT}` },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      {
        maxTokens: TITLE_MAX_TOKENS,
        // Too small and too unique to reuse the session's prefix or to write a
        // cache nobody will read.
        cacheRetention: 'none',
        sessionId: randomUUID(),
        signal: controller.signal,
        ...(thinking === 'off' ? {} : { reasoning: thinking }),
      },
    );
    return titleFromAssistant(await stream.result());
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Session title generation timed out', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function (pi: ExtensionAPI): void {
  let inFlight = false;

  pi.on('agent_settled', (_event, ctx) => {
    if (inFlight || pi.getSessionName()) return;

    const sessionId = ctx.sessionManager.getSessionId();
    inFlight = true;
    const naming = (async () => {
      try {
        const title = await generateTitle(ctx);
        // `/name` is not awaited by the editor, so a manual name may have
        // landed while the title was generated.
        if (ctx.sessionManager.getSessionId() !== sessionId) return;
        if (pi.getSessionName()) return;
        pi.setSessionName(title);
      } catch {
        // An unnamed session is better than a misleading name. The next settle
        // tries again, so a transient model failure heals on its own.
      } finally {
        inFlight = false;
      }
    })();

    // One-shot modes tear the session down as soon as this handler returns, so
    // the name has to land inside the run. The TUI keeps the session alive and
    // must not delay the next prompt.
    return ctx.mode === 'tui' ? undefined : naming;
  });

  pi.registerCommand('autoname', {
    description: 'Generate the session name from the current conversation',
    handler: async (_args, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId();
      const nameBefore = pi.getSessionName();
      try {
        const title = await generateTitle(ctx);
        // The explicit command overrides the name it started from, never one
        // that landed while it was generating.
        if (ctx.sessionManager.getSessionId() !== sessionId) return;
        if (pi.getSessionName() !== nameBefore) {
          ctx.ui.notify(
            'Session name changed while the title was generated; keeping the newer name',
            'warning',
          );
          return;
        }
        pi.setSessionName(title);
        ctx.ui.notify(`Session renamed: ${title}`, 'info');
      } catch (error) {
        ctx.ui.notify(`Session naming failed: ${errorMessage(error)}`, 'error');
      }
    },
  });
}
