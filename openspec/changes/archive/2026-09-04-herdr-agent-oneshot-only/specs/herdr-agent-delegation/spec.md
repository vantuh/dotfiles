# herdr-agent-delegation Specification (delta)

## Purpose

Define the `herdr_agent` tool contract after the one-shot-only simplification: subagents are ephemeral job-doers that spawn, deliver a result, and close; continuation with accumulated context happens exclusively through session-file resume of a closed one-shot; no persistent lifecycle, no label-based reuse, and no standby mode exist in the tool.

## ADDED Requirements

### Requirement: Tool spawns one-shot agents only

The `herdr_agent` tool SHALL NOT expose a `lifecycle` parameter. Every spawned agent SHALL be a one-shot agent that is closed after a successful result is collected (by the waiting call or by the detached-delivery poller). No model-facing parameter or tool-result path SHALL create an agent that stays open across tasks by design.

#### Scenario: Minimal spawn

- **WHEN** `herdr_agent` is called with `agent` and `task` only
- **THEN** a one-shot agent is spawned, the result is delivered (blocking or detached), and the agent target is closed after collection

#### Scenario: Lifecycle parameter supplied

- **WHEN** a tool call includes `lifecycle: "persistent"`
- **THEN** the call fails schema validation because the parameter no longer exists

### Requirement: Continuation of a previous one-shot via resume

The `herdr_agent` tool SHALL support continuing a closed one-shot agent owned by the current Orchestrator session by passing `resumeClosed: true`, the exact `tabLabel`, and a new `task`. The resumed agent SHALL run with the archived child session file, so it starts with the context of the original task. Resume SHALL be rejected when the agent is still live (working, blocked, or parked on a question), when the label is owned by another Orchestrator session, or when the archived session file is missing or corrupt; in each case the error text SHALL name the correct alternative (re-wait, answer in place, or spawn fresh).

#### Scenario: Continue a closed researcher

- **WHEN** a one-shot `researcher` agent with label `Researcher` has finished and closed, and `herdr_agent` is called with `agent: researcher`, `resumeClosed: true`, `tabLabel: "Researcher"`, and a follow-up task
- **THEN** the agent restarts with the original child session and answers the follow-up with the prior context available

#### Scenario: Resume over a live agent

- **WHEN** `resumeClosed: true` names a label whose agent is still running or parked on a question
- **THEN** the call fails with an error directing the caller to re-wait (omit `task`) or answer the parked question with the same `tabLabel`

### Requirement: Continuation without live reuse by label

A `task` addressed to a live agent by its exact `tabLabel` SHALL be rejected unless that agent is parked on an unanswered question, in which case the task SHALL be treated as the answer and delivered to the parked agent. There SHALL be no path that sends a new task into a live agent that is not answering its own question.

#### Scenario: New task to a live working agent

- **WHEN** a live one-shot agent named `Scout` is working and a call arrives with `tabLabel: "Scout"` and a new task (no `resumeClosed`, no parked question)
- **THEN** the call fails with an error explaining that a live agent cannot receive a new task and naming the alternatives (re-wait without `task`, or `resumeClosed` after it closes)

#### Scenario: Answer a parked question

- **WHEN** a one-shot agent named `Scout` has asked a question and a call arrives with `tabLabel: "Scout"` and the answer as `task`
- **THEN** the answer is delivered to the parked agent and the round trip completes normally

### Requirement: Re-wait by omitting task

Omitting `task` with a `tabLabel` SHALL re-wait on the named live agent without sending a new prompt, as today. Omitting `task` SHALL never resurrect a closed agent.

#### Scenario: Reconnect after a timed-out wait

- **WHEN** a previous call timed out while the agent kept working, and `herdr_agent` is called again with the same `tabLabel` and no `task`
- **THEN** the tool reconnects and waits for the agent to settle without sending a new prompt

### Requirement: Fixed wait timeout

The wait timeout SHALL be a fixed constant (600000 ms) and SHALL NOT be a model-facing parameter. After a timeout or abort the tool SHALL return the soft re-wait hint as today.

#### Scenario: Long-running agent hits the timeout

- **WHEN** an agent runs longer than the fixed timeout during a `wait: true` call
- **THEN** the tool result reports the interruption with the re-wait hint, and the agent stays open for the re-wait path

### Requirement: Detached delivery remains the default

In UI sessions the tool SHALL return as soon as the prompt is accepted (`wait: false` default) and the widget poller SHALL deliver the result or parked question exactly once, closing one-shot targets on delivery. Headless sessions SHALL require `wait: true` and SHALL reject an explicit `wait: false`.

#### Scenario: Detached result delivered once

- **WHEN** a detached one-shot agent finishes with nobody waiting
- **THEN** the widget poller delivers the result as a message, closes the agent, and no second delivery occurs on any later path

### Requirement: Injected instructions describe policy, not lifecycle mechanics

The injected Orchestrator instructions SHALL state delegation policy only (when to delegate, profile choice, parallelism limits, self-contained tasks, no duplication, re-wait and resume entry points). Persistent-lifecycle, label-reuse, and standby-spawn rules SHALL NOT appear in the injected instructions; continuation mechanics SHALL be conveyed by the tool schema descriptions and tool-result texts.

#### Scenario: Instruction content after the change

- **WHEN** a fresh Orchestrator session starts and the system prompt is built
- **THEN** the injected Herdr agents section contains no mention of persistent agents, standby spawning, or label-reuse contracts, and mentions resume as the way to continue a closed one-shot
