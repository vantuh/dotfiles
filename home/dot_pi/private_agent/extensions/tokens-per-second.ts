import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CHARS_PER_TOKEN = 4;
const WIDGET = "tok/s";
const BELOW = { placement: "belowEditor" as const };

export default function (pi: ExtensionAPI) {
  let firstTokenTime = 0;
  let deltaCount = 0;
  let charCount = 0;

  const reset = () => {
    firstTokenTime = 0;
    deltaCount = 0;
    charCount = 0;
  };

  const show = (ctx: ExtensionContext, text: string) => {
    ctx.ui.setWidget(WIDGET, [text], BELOW);
  };

  const hide = (ctx: ExtensionContext) => {
    ctx.ui.setWidget(WIDGET, undefined);
  };

  pi.on("agent_start", async (_event, ctx) => {
    reset();
    show(ctx, ctx.ui.theme.fg("dim", "⏱ generating..."));
  });

  pi.on("before_provider_request", async (_event, ctx) => {
    reset();
    show(ctx, ctx.ui.theme.fg("dim", "⏱ generating..."));
  });

  pi.on("message_update", async (event, ctx) => {
    const ame = event.assistantMessageEvent;
    if (
      !ame ||
      (ame.type !== "text_delta" &&
        ame.type !== "thinking_delta" &&
        ame.type !== "toolcall_delta")
    )
      return;

    if (!firstTokenTime) firstTokenTime = Date.now();
    deltaCount++;
    charCount += ame.delta.length;

    if (deltaCount % 10 !== 0) return;
    const genTime = (Date.now() - firstTokenTime) / 1000;
    if (genTime < 0.3) return;

    const official = event.message.usage?.output;
    const tokens =
      official && official > 0
        ? official
        : Math.round(charCount / CHARS_PER_TOKEN);
    const tps = Math.round(tokens / genTime);
    show(ctx, ctx.ui.theme.fg("accent", `⏱ ${tps} tok/s`));
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant" || !firstTokenTime) return;
    const genTime = (Date.now() - firstTokenTime) / 1000;
    if (genTime < 0.1) return;
    const output = event.message.usage?.output;
    const tokens =
      output && output > 0 ? output : Math.round(charCount / CHARS_PER_TOKEN);
    const tps = Math.round(tokens / genTime);
    show(ctx, ctx.ui.theme.fg("accent", `⏱ ${tps} tok/s`));
  });

  // message_end still has tool rounds ahead. Hide once the turn is idle.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!ctx.isIdle()) return;
    hide(ctx);
  });
}
