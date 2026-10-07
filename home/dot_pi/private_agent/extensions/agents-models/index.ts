import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import type { SelectItem } from '@earendil-works/pi-tui';

import {
  discoverAgents,
  type DiscoveredAgent,
  resolveModelOrigin,
  selectPinnableAgents,
  withOverrideOnlyAgents,
} from './agents.ts';
import {
  AgentModelPicker,
  type PickerData,
  type PickerResult,
} from './picker.ts';
import {
  type SettingsScope,
  projectSettingsScope,
  readSubagentSettingsForScope,
  userSettingsScope,
  writeAgentModelOverride,
} from './settings.ts';

const CLEAR_VALUE = '__clear__';

function modelRef(model: Model<Api>): string {
  return `${model.provider}/${model.id}`;
}

function agentItems(
  agents: readonly DiscoveredAgent[],
  describe: (agent: DiscoveredAgent) => string,
): SelectItem[] {
  return agents.map((agent) => ({
    value: agent.name,
    label: agent.name,
    description: describe(agent),
  }));
}

function createPickerData(
  ctx: ExtensionCommandContext,
  agents: readonly DiscoveredAgent[],
  scopes: PickerData['scopes'],
  describe: (agent: DiscoveredAgent) => string,
  hiddenCount: number,
): PickerData {
  const hasLocal = scopes.some((scope) => scope.kind === 'project');

  return {
    agentItems: () => agentItems(agents, describe),
    scopes,
    agentListNote:
      hiddenCount > 0
        ? `${hiddenCount} hidden · disabled in agentOverrides`
        : undefined,
    localMissingNote: hasLocal
      ? undefined
      : 'local: no project settings for this project',

    modelItems: (agent, scopeKind) => {
      const scoped = ctx.scopedModels.map((entry) => entry.model);
      const scopedIds = new Set(scoped.map(modelRef));
      const available = ctx.modelRegistry
        .getAvailable()
        .filter((model) => !scopedIds.has(modelRef(model)))
        .sort((a, b) => modelRef(a).localeCompare(modelRef(b)));

      const toItem = (model: Model<Api>, isScoped: boolean): SelectItem => {
        const ref = modelRef(model);
        const authed = ctx.modelRegistry.hasConfiguredAuth(model);
        return {
          value: ref,
          label: ref,
          description: [
            isScoped ? 'scoped' : undefined,
            model.name,
            authed ? undefined : 'no auth',
          ]
            .filter(Boolean)
            .join(' · '),
        };
      };

      const scope = scopes.find((entry) => entry.kind === scopeKind);
      const hasOverride =
        scope !== undefined &&
        readSubagentSettingsForScope(scope).overrides.has(agent);

      return [
        ...scoped.map((model) => toItem(model, true)),
        ...available.map((model) => toItem(model, false)),
        ...(hasOverride
          ? [
              {
                value: CLEAR_VALUE,
                label: 'clear override',
                description: `remove the pinned model in ${scope?.path}`,
              } satisfies SelectItem,
            ]
          : []),
      ];
    },
  };
}

export default function agentsModelsExtension(pi: ExtensionAPI): void {
  pi.registerCommand('agents-models', {
    description: 'Pin a model to a subagent (writes subagents.agentOverrides)',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('agents-models needs the interactive TUI', 'warning');
        return;
      }

      const userScope = userSettingsScope();
      const projectScope = projectSettingsScope(ctx.cwd);
      // Tab order: global, then local when the project has settings.
      const scopes: PickerData['scopes'] = [
        userScope,
        ...(projectScope ? [projectScope] : []),
      ];
      const parentModel = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : 'parent session model';

      // Rebuilt per step so the agent list shows models pinned earlier in the
      // same pass.
      const buildData = (): PickerData => {
        const views = {
          user: readSubagentSettingsForScope(userScope),
          project: projectScope
            ? readSubagentSettingsForScope(projectScope)
            : undefined,
        };
        const describe = (agent: DiscoveredAgent): string => {
          const origin = resolveModelOrigin(agent, views, parentModel);
          return `${origin.source}: ${origin.model}`;
        };
        const discovered = withOverrideOnlyAgents(
          discoverAgents(ctx.cwd),
          views,
        );
        const { pinnable, hiddenCount } = selectPinnableAgents(discovered);
        return createPickerData(ctx, pinnable, scopes, describe, hiddenCount);
      };

      const initial = buildData().agentItems();
      if (initial.length === 0) {
        ctx.ui.notify('No pinnable subagents found', 'warning');
        return;
      }

      const changed = await ctx.ui.custom<boolean>(
        (tui, theme, keybindings, done) =>
          new AgentModelPicker(
            tui,
            theme,
            keybindings,
            buildData,
            async (result) => writeResult(result, scopes),
            done,
          ),
        { overlay: true },
      );

      if (!changed) return;
      ctx.ui.notify('Reloading so the new agent models take effect', 'info');
      void ctx.reload().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Reload failed: ${message}`, 'error');
      });
    },
  });
}

/** Applies one pin; returns an error message for the modal, or undefined. */
function writeResult(
  result: PickerResult,
  scopes: readonly SettingsScope[],
): string | undefined {
  const scope = scopes.find((entry) => entry.path === result.scope.path);
  if (!scope) return `Unknown target: ${result.scope.label}`;

  try {
    writeAgentModelOverride(scope, result.agent, result.model);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to write ${scope.path}: ${message}`;
  }
}
