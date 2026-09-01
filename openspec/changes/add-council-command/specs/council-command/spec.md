## Purpose

The `/council` command asks one question to several models in parallel through Herdr agents and produces a single consolidated answer, so the user gets cross-checked input from multiple models with one command.

## ADDED Requirements

### Requirement: Council command parses question and config

The `/council <question>` command SHALL read the model list from `~/.pi/agent/council.json` (`{"models": [...]}`) and inject an orchestration user message containing the question and the configured models. If the question is empty, the command SHALL show usage help and inject nothing. If the config file is missing, unreadable, or has an empty `models` list, the command SHALL notify the user and inject nothing.

#### Scenario: Normal invocation

- **WHEN** the user runs `/council Why is X better than Y?` and the config lists 3 models
- **THEN** a user message is injected containing the question and all 3 model names

#### Scenario: Missing question

- **WHEN** the user runs `/council` with no arguments
- **THEN** usage help is shown and no user message is injected

#### Scenario: Missing or empty config

- **WHEN** `~/.pi/agent/council.json` does not exist or `models` is empty
- **THEN** a warning notification names the missing config and no user message is injected

### Requirement: Council command refuses while busy

The `/council` command SHALL refuse to inject the message while the main agent is mid-turn, with a warning notification.

#### Scenario: Invoked during an active turn

- **WHEN** the user runs `/council ...` while the agent is not idle
- **THEN** a warning is shown and no user message is injected

### Requirement: Orchestrator spawns one researcher per model in parallel

The injected council message SHALL instruct the Orchestrator to spawn one `researcher` agent per configured model using the `herdr_agent` tool, all in a single turn with `wait: false` (parallel), each with a distinct `tabLabel` identifying the model, and each passing the model as a `model` override.

#### Scenario: Three configured models

- **WHEN** the Orchestrator processes the injected council message with 3 configured models
- **THEN** it issues 3 `herdr_agent` calls with `agent: researcher`, a `model` override each, distinct labels, and `wait: false`

### Requirement: Model override changes spawned child model

The `herdr_agent` tool SHALL accept an optional `model` string parameter that overrides the agent profile's model for that spawn; the spawned child Pi process SHALL run with the overridden model and all other profile settings (system prompt, tools, thinking) unchanged.

#### Scenario: Override supplied

- **WHEN** `herdr_agent` is called with `agent: researcher` and `model: opus-5`
- **THEN** the child Pi process is launched with `--model opus-5` and the researcher profile's other settings

#### Scenario: Override omitted

- **WHEN** `herdr_agent` is called without `model`
- **THEN** the child uses the profile's own model (existing behavior unchanged)

### Requirement: Orchestrator consolidates answers

After the researchers' answers are delivered, the Orchestrator SHALL produce one consolidated final answer in the main session. No additional consolidator agent or pane SHALL be spawned.

#### Scenario: All answers received

- **WHEN** all spawned council researchers have returned their answers
- **THEN** the Orchestrator writes a single consolidated answer to the main session
