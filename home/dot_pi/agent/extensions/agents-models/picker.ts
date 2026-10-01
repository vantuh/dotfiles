import { DynamicBorder, type Theme } from '@earendil-works/pi-coding-agent';
import {
  Container,
  type Component,
  Input,
  type KeybindingsManager,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  fuzzyFilter,
  type TUI,
} from '@earendil-works/pi-tui';

import type { SettingsScope, SettingsScopeKind } from './settings.ts';

export interface PickerResult {
  readonly agent: string;
  /** `null` clears the existing override. */
  readonly model: string | null;
  readonly scopeKind: SettingsScopeKind;
}

export interface PickerData {
  /** Step 1: one item per discovered agent, described for the active target. */
  readonly agentItems: (scope: SettingsScope) => readonly SelectItem[];
  /** Step 2: models for the chosen agent, scoped models first. */
  readonly modelItems: (
    agent: string,
    scopeKind: SettingsScopeKind,
  ) => readonly SelectItem[];
  /** Writable settings files in tab order; the first entry is the user scope. */
  readonly scopes: readonly [SettingsScope, ...SettingsScope[]];
  /** Shown mid-modal when no project settings file exists for this project. */
  readonly localMissingNote?: string;
  /** Dim note under the target line on the agent step, e.g. the hidden count. */
  readonly agentListNote?: string;
}

type StepKey = 'agent' | 'model';

type StatusKind = 'info' | 'error';

const STEP_ORDER: readonly StepKey[] = ['agent', 'model'];

const CLEAR_VALUE = '__clear__';

/** Re-renders its text on demand, so a tab toggle does not reset the filter. */
class ScopeLine implements Component {
  constructor(private readonly text: () => string) {}

  render(_width: number): string[] {
    return this.text().split('\n');
  }

  invalidate(): void {}
}

/**
 * Two-step overlay: pick an agent, pick a model. Saving a model returns to the
 * agent list so several agents can be pinned in one pass; the caller reloads Pi
 * when the overlay closes if anything changed.
 */
export class AgentModelPicker extends Container {
  private step: StepKey = 'agent';
  private searchInput: Input | undefined;
  private selectList: SelectList | undefined;
  private scopeLine: ScopeLine | undefined;
  private statusLine: ScopeLine | undefined;
  private listIndex = 0;
  private allItems: readonly SelectItem[] = [];
  private scopeIndex = 0;
  private agent: string | undefined;
  private busy = false;
  private changed = false;
  private status:
    | { readonly text: string; readonly kind: StatusKind }
    | undefined;

  /** Propagates TUI focus so the search input can position the cursor. */
  get focused(): boolean {
    return this.searchInput?.focused ?? false;
  }

  set focused(value: boolean) {
    if (this.searchInput) this.searchInput.focused = value;
  }

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly buildData: () => PickerData,
    private readonly apply: (
      result: PickerResult,
    ) => Promise<string | undefined>,
    private readonly done: (changed: boolean) => void,
  ) {
    super();
    this.showStep('agent');
  }

  private get data(): PickerData {
    return this.buildData();
  }

  private get scope(): SettingsScope {
    return this.data.scopes[this.scopeIndex] ?? this.data.scopes[0];
  }

  private get scopeKind(): SettingsScopeKind {
    return this.scope.kind;
  }

  private stepTitle(): string {
    return this.step === 'agent'
      ? 'Subagent model · agent'
      : `Subagent model · model for ${this.agent ?? ''}`;
  }

  private scopeText(): string {
    const toggle = this.data.scopes.length > 1 ? '   [tab] switch' : '';
    return `target: ${this.scope.label} → ${this.scope.path}${toggle}`;
  }

  private hintText(): string {
    return this.step === 'agent'
      ? 'type to filter · ↑↓ move · enter select · esc close'
      : 'type to filter · ↑↓ move · enter save · esc back · tab target';
  }

  private showStep(step: StepKey): void {
    const data = this.data;
    this.step = step;
    this.allItems =
      step === 'agent'
        ? data.agentItems(this.scope)
        : data.modelItems(this.agent ?? '', this.scopeKind);
    this.searchInput = new Input({ placeholder: 'type to filter' });
    this.searchInput.onSubmit = () => {
      this.selectList?.handleInput('\r');
    };
    this.scopeLine = new ScopeLine(() => this.scopeText());
    this.statusLine = new ScopeLine(() => this.status?.text ?? '');

    this.clear();
    this.addChild(new DynamicBorder((text) => this.theme.fg('accent', text)));
    this.addChild(
      new Text(this.theme.bold(this.theme.fg('accent', this.stepTitle()))),
    );
    this.addChild(this.scopeLine);
    if (step === 'agent' && data.agentListNote) {
      this.addChild(new Text(this.theme.fg('dim', data.agentListNote)));
    }
    if (data.localMissingNote) {
      this.addChild(new Text(this.theme.fg('warning', data.localMissingNote)));
    }
    if (this.status) {
      this.addChild(
        new Text(
          this.theme.fg(
            this.status.kind === 'error' ? 'error' : 'success',
            this.status.text,
          ),
        ),
      );
    }
    this.addChild(new Spacer(1));
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.selectList = this.buildList(this.allItems);
    this.listIndex = this.children.length;
    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(this.theme.fg('dim', this.hintText())));
    this.addChild(new DynamicBorder((text) => this.theme.fg('accent', text)));
    this.invalidate();
  }

  private setStatus(text: string, kind: StatusKind): void {
    this.status = { text, kind };
  }

  private buildList(items: readonly SelectItem[]): SelectList {
    const list = new SelectList(
      [...items],
      Math.min(Math.max(items.length, 1), 12),
      {
        selectedPrefix: (text) => this.theme.fg('accent', text),
        selectedText: (text) => this.theme.fg('accent', text),
        description: (text) => this.theme.fg('muted', text),
        scrollInfo: (text) => this.theme.fg('dim', text),
        noMatch: (text) => this.theme.fg('warning', text),
      },
      { minPrimaryColumnWidth: 16, maxPrimaryColumnWidth: 44 },
    );
    list.onSelect = (item) => this.onSelect(item);
    list.onCancel = () => this.onCancel();
    return list;
  }

  private applyFilter(): void {
    const query = this.searchInput?.getValue() ?? '';
    const matches = query
      ? fuzzyFilter(
          [...this.allItems],
          query,
          (item) => `${item.label} ${item.description ?? ''}`,
        )
      : this.allItems;
    const next = this.buildList(matches);
    this.children.splice(this.listIndex, 1, next);
    this.selectList = next;
    this.invalidate();
    this.tui.requestRender();
  }

  private onSelect(item: SelectItem): void {
    if (this.step === 'agent') {
      this.agent = item.value;
      this.showStep('model');
      return;
    }
    const agent = this.agent;
    if (!agent || this.busy) return;
    const model = item.value === CLEAR_VALUE ? null : item.value;
    void this.commit({ agent, model, scopeKind: this.scopeKind });
  }

  private async commit(result: PickerResult): Promise<void> {
    this.busy = true;
    this.setStatus('saving…', 'info');
    this.tui.requestRender();
    try {
      const error = await this.apply(result);
      if (error) {
        this.setStatus(error, 'error');
      } else {
        this.changed = true;
        this.setStatus(
          `saved ${result.agent} → ${result.model ?? 'no override'}`,
          'info',
        );
      }
    } finally {
      this.busy = false;
      this.showStep('agent');
      this.tui.requestRender();
    }
  }

  private onCancel(): void {
    if (this.busy) return;
    const index = STEP_ORDER.indexOf(this.step);
    const previous = index > 0 ? STEP_ORDER[index - 1] : undefined;
    if (!previous) {
      this.done(this.changed);
      return;
    }
    this.showStep(previous);
    this.tui.requestRender();
  }

  /** Tab cycles the write target; the model list depends on it, so it rebuilds. */
  private toggleScope(): void {
    if (this.data.scopes.length < 2) return;
    this.scopeIndex = (this.scopeIndex + 1) % this.data.scopes.length;
    this.showStep(this.step);
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, 'tui.select.cancel')) {
      this.onCancel();
      return;
    }
    if (this.keybindings.matches(data, 'tui.input.tab')) {
      this.toggleScope();
      return;
    }
    const isNavigation =
      this.keybindings.matches(data, 'tui.select.up') ||
      this.keybindings.matches(data, 'tui.select.down') ||
      this.keybindings.matches(data, 'tui.select.pageUp') ||
      this.keybindings.matches(data, 'tui.select.pageDown') ||
      this.keybindings.matches(data, 'tui.select.confirm');

    if (isNavigation) {
      this.selectList?.handleInput(data);
    } else {
      this.searchInput?.handleInput(data);
      this.applyFilter();
    }
    this.tui.requestRender();
  }
}
