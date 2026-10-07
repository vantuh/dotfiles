/**
 * Names a session from its conversation, the way Pi Web's "generate name"
 * button does: the whole transcript under a character budget, the session
 * model, strict title parsing, and no fallback. A failed run leaves the
 * session unnamed instead of naming it after a fragment of the user's own
 * message, which is what pi-autoname did whenever its model call failed.
 *
 * Auto-naming runs after a settled run and only while the session is unnamed,
 * so `/name`, `--name`, and a rename this process can see are left alone. A
 * rename made by another process is invisible here: the SDK reads session
 * names from its own in-memory entries and never re-reads the session file for
 * them. `/autoname` regenerates the name explicitly.
 *
 * The transcript and title cleanup live in ./lib.ts.
 */
import { randomUUID } from 'node:crypto';

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

import { buildTitleTranscript, parseGeneratedSessionTitle } from './lib.ts';

const TITLE_TIMEOUT_MS = 90_000;
/** A reasoning model shares this budget between thinking and the title. */
const TITLE_MAX_TOKENS = 512;

const TITLE_SYSTEM_PROMPT =
  'You name chat sessions from a transcript. Reply with the title only.';

const TITLE_PROMPT = `Create a concise title for this session based on the conversation above.

Requirements:
- Match the primary language used by the user.
- Describe the user's concrete goal or the outcome, not the act of chatting.
- Use 4-12 words for space-separated languages, or 8-24 characters for CJK text when practical.
- Do not call any tools.
- Return only the title as plain text, with no quotes, label, markdown, or explanation.`;

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

/** Asks the session model for a title, or throws: there is no fallback name. */
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
