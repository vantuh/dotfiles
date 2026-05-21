# Pi Extension: Kiro ACP Provider

## Context

Мета — написати pi extension, який реєструє Kiro CLI як model provider через ACP (Agent Client Protocol). Замість використання окремого `kiro-ai-provider` пакету, extension напряму спавнить `kiro-cli acp` і спілкується через JSON-RPC over stdio.

Мотивація: використовувати корпоративну Kiro підписку в pi без ризику для підписки. Pi контролює system prompt, tools і agent loop, а Kiro виступає лише як "model backend". Досвід має бути максимально native — як прямий API call.

## Різниця: Direct API vs Kiro ACP

### Що ти втрачаєш через ACP (порівняно з прямим Anthropic/AWS API):

| Аспект                 | Direct API                                                 | Kiro ACP                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **System prompt**      | Повний контроль, pi відправляє свій                        | Kiro додає свій prompt зверху. Можна inject через `<system_instructions>` але Kiro's base prompt залишається                                                 |
| **Prompt caching**     | Anthropic ephemeral cache, до 90% економії на input tokens | ❌ Немає контролю. Kiro може кешувати внутрішньо, але pi не може це контролювати. На практиці з subscription це менш критично — ти платиш credits, не tokens |
| **Extended thinking**  | Повний контроль (budget, level)                            | Kiro не підтримує thinking взагалі — це не втрата, бо його там і не було                                                                                     |
| **Temperature/params** | Повний контроль                                            | ❌ Контролюється kiro-cli, не можна змінити                                                                                                                  |
| **Token usage**        | Точні цифри від API                                        | Тільки estimates (% context window, ~4 chars/token)                                                                                                          |
| **Tool calling**       | Native structured output від моделі                        | Через MCP bridge — Kiro виконує tools сам, потрібен relay                                                                                                    |
| **Streaming**          | Прямий SSE від API                                         | Через JSON-RPC notifications (додає мінімальну latency)                                                                                                      |
| **Context window**     | Точний контроль, pi manages                                | Kiro manages свій context, може compact без попередження                                                                                                     |
| **Cost tracking**      | Точний per-token cost                                      | Тільки "credits" (Kiro's internal unit)                                                                                                                      |
| **Session history**    | Pi повністю контролює                                      | Kiro зберігає свою копію, дублювання                                                                                                                         |
| **Model selection**    | Будь-яка модель будь-якого провайдера                      | Тільки моделі доступні в Kiro subscription                                                                                                                   |
| **Rate limits**        | Твій API key rate limit                                    | Kiro subscription limits                                                                                                                                     |

### Що працює нормально через ACP:

- ✅ **Pi skills** — працюють, бо pi контролює system prompt (inject через `<system_instructions>`)
- ✅ **Pi extensions** — працюють повністю (вони на рівні pi, не залежать від provider)
- ✅ **Pi tools** (read, bash, edit, write) — працюють через MCP bridge relay
- ✅ **Custom tools** — працюють через MCP bridge
- ✅ **Streaming** — працює, мінімальна додаткова latency
- ✅ **Multi-turn conversations** — працюють (Kiro manages session)
- ✅ **Model switching** — можна через `session/set_model`

### Головні обмеження для "native-like" досвіду:

1. **Prompt caching — немає прямого контролю.** При прямому API call, pi маркує system prompt і history як `cache_control: ephemeral` — Anthropic кешує ці блоки і наступні запити платять тільки за cache read (~10% ціни). Через ACP pi не може відправити cache control headers — Kiro сам вирішує що кешувати. Але оскільки ти на subscription з credits, а не pay-per-token, це менш критично. Credits витрачаються однаково незалежно від кешування.

2. **Kiro's system prompt завжди присутній** — навіть з custom agent, Kiro додає свій base context. Це з'їдає ~2-5k tokens context window і може конфліктувати з pi's instructions.

3. **Kiro може відмовити** — якщо Kiro's safety rules спрацюють на рівні agent (не моделі), запит буде заблоковано навіть якщо pi його дозволяє.

### Ризики для підписки:

- **Мінімальні** — ACP це офіційний протокол Kiro, підтримується для JetBrains/Zed
- Kiro рахує credits per session, не per-API-call
- Використання через ACP — це intended use case
- `kiro-acp-ai-provider` існує публічно і працює так само

## Feasibility Assessment

**Так, це можливо і безпечно для підписки.** Pi підтримує `registerProvider` з кастомним `streamSimple` хендлером. Kiro CLI підтримує ACP через `kiro-cli acp`.

### Ключова проблема: Tool Calling

Kiro ACP — це **agent protocol**, не model API. Коли Kiro отримує prompt, він:

1. Додає свій system prompt
2. Викликає модель
3. Якщо модель хоче tool call — Kiro **сам виконує** tool
4. Повертає фінальний результат

Але pi потребує **raw model output** з tool calls, щоб pi сам виконував tools.

### Рішення (з kiro-acp-ai-provider)

`kiro-acp-ai-provider` вирішує це через MCP Bridge:

1. Створює custom agent config з `--agent` flag
2. Визначає pi's tools як MCP tools через bridge script
3. Коли Kiro хоче викликати tool → MCP bridge → IPC → application виконує tool → result назад
4. Kiro продовжує з результатом

## Approach

### Рекомендований: Self-contained extension з MCP bridge

Написати self-contained extension (~400-500 рядків) що:

1. Спавнить `kiro-cli acp --agent <custom>`
2. Manages JSON-RPC communication (простий client, без vscode-jsonrpc dep)
3. Bridges tool calls через MCP bridge pattern (extracted script)
4. Translates ACP updates → AssistantMessageEventStream

Чому не використовувати `kiro-acp-ai-provider` як dep:

- Він для Vercel AI SDK, не для pi
- Багато коду для subagent isolation, lane routing, image FUP — нам це не потрібно
- Простіше взяти core logic (~200 рядків ACP client) і адаптувати

### Архітектура

```
Pi Agent Loop
    │
    ├─ streamSimple(model, context, options)
    │       │
    │       ▼
    │   Extension: kiro-acp.ts
    │       │
    │       ├─ Writes pi tools → /tmp/kiro-acp/tools-{hash}.json
    │       ├─ Sends prompt via JSON-RPC → kiro-cli stdin
    │       ├─ Reads streaming updates ← kiro-cli stdout
    │       │       │
    │       │       ├─ agent_message_chunk → text_delta events
    │       │       └─ tool_call → toolcall_start/delta/end events
    │       │
    │       └─ Returns AssistantMessageEventStream
    │
    ├─ Pi executes tool (read/bash/edit/etc)
    │
    ├─ Tool result → next streamSimple call
    │       │
    │       ▼
    │   Extension sends tool result via IPC → MCP bridge → kiro-cli
    │
    └─ Loop until done
```

### Як tool bridging працює:

1. Extension створює agent config: `tools: ["@mcp-bridge"]`, MCP server = node bridge script
2. Bridge script читає tools з JSON file і відповідає на `tools/list`
3. Коли Kiro хоче tool call → bridge отримує `tools/call` → HTTP POST до IPC server в extension
4. Extension зберігає pending tool call, повертає `toolcall_end` event в stream
5. Pi виконує tool, наступний `streamSimple` call містить tool result
6. Extension відправляє result через IPC → bridge → kiro-cli продовжує

## Files to create

- `~/.pi/agent/extensions/kiro-acp.ts` — основний extension (~400 рядків)
  - ACP client (spawn, JSON-RPC, session management)
  - streamSimple handler (Context → prompt, updates → events)
  - IPC server (HTTP, tool result relay)
  - registerProvider registration
- `~/.pi/agent/extensions/kiro-acp-bridge.mjs` — MCP bridge script (~100 рядків)
  - Reads tools from JSON file
  - Responds to MCP `tools/list` and `tools/call`
  - Relays tool calls to IPC server via HTTP

## References

- https://github.com/NachoFLizaur/kiro-acp-ai-provider — Kiro ACP provider for Vercel AI SDK (ACP client + MCP bridge logic)
- https://github.com/junghan0611/pi-shell-acp — Pi extension that connects to Claude/Codex/Gemini via ACP (exact same pattern we need, but for different backends)
- https://kiro.dev/docs/cli/acp/ — Kiro ACP documentation

## Reuse

- `pi-shell-acp` — **головний reference**. Це pi extension що робить те саме для Claude/Codex/Gemini. Ключові файли:
  - `index.ts` — registerProvider + streamSimple handler pattern
  - `event-mapper.ts` — ACP session updates → AssistantMessageEventStream events
  - `acp-bridge.ts` — ACP session management, prompt sending
- `kiro-acp-ai-provider/src/acp-client.ts` — Kiro-specific JSON-RPC client (spawn kiro-cli, initialize, session/new, session/prompt)
- `kiro-acp-ai-provider/src/agent-config.ts` — Kiro agent config generation (MCP bridge setup)
- `AssistantMessageEventStream` + `createAssistantMessageEventStream` з `@earendil-works/pi-ai`

## Steps

- [ ] 1. MCP Bridge script (`kiro-acp-bridge.mjs`): standalone Node script для tool relay
- [ ] 2. ACP Client: spawn kiro-cli, JSON-RPC over stdio, initialize handshake
- [ ] 3. Agent config generation: custom agent з MCP bridge, `<system_instructions>` meta-prompt
- [ ] 4. IPC Server: HTTP server в extension для прийому tool calls від bridge
- [ ] 5. streamSimple handler: Context → ACP prompt, session updates → AssistantMessageEvent
- [ ] 6. registerProvider: register "kiro-acp" provider з available models
- [ ] 7. Lifecycle: session_shutdown cleanup, process management, error recovery

## Verification

- `pi` запускається без помилок з extension
- `/model` показує kiro models (claude-sonnet-4.6, etc.)
- Простий text prompt працює (streaming)
- Tool calling працює (read, bash, edit, write)
- Multi-turn conversation працює
- Graceful shutdown (no orphan kiro-cli processes)

## Висновок

**Чи варто це робити?**

Для використання корпоративної Kiro підписки в pi — це хороший варіант. ACP це офіційний протокол, ризик для підписки мінімальний.

Обмеження порівняно з прямим API:

- Немає контролю над prompt caching (але з subscription credits це не критично)
- Kiro's base prompt з'їдає частину context window
- Kiro може заблокувати деякі запити через свої safety rules
- Token tracking тільки estimated

Pi skills, extensions, tools — все працюватиме повноцінно. Досвід буде ~90% від native.

## Open Questions

Вирішено:

- **Session management**: persistent session per pi session, новий `/new` → нова kiro session
- **Fallback**: не потрібен, при помилці просто виводити повідомлення
