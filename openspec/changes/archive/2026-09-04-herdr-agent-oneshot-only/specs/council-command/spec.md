# council-command Specification (delta)

## MODIFIED Requirements

### Requirement: Orchestrator spawns one researcher per model in parallel

The injected council message SHALL instruct the Orchestrator to spawn one `researcher` agent per configured model using the `herdr_agent` tool, all in a single turn with `wait: false` (parallel), each with a distinct `tabLabel` identifying the model, and each passing the model as a `model` override. The message SHALL NOT reference agent lifecycles; council researchers are one-shot agents that close after their answer is delivered.

#### Scenario: Three configured models

- **WHEN** the Orchestrator processes the injected council message with 3 configured models
- **THEN** it issues 3 `herdr_agent` calls with `agent: researcher`, a `model` override each, distinct labels, and `wait: false`, with no lifecycle parameter in any call
