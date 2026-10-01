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
  /** Step 1: one item per discovered agent. */
  readonly agentItems: readonly SelectItem[];
  /** Step 2: models for the chosen agent, scoped models first. */
  readonly modelItems: (
    agent: string,
    scopeKind: SettingsScopeKind,
  ) => readonly SelectItem[];
  /** Writable settings files in tab order; always contains the user scope. */
  readonly scopes: readonly SettingsScope[];
  /** Shown mid-modal when no project settings file exists for this project. */
  readonly localMissingNote?: string;
}

type StepKey = 'agent' | 'model';

const STEP_ORDER: readonly StepKey[] = ['agent', 'model'];

const CLEAR_VALUE = '__clear__';

const SCOPE_LABELS: Record<SettingsScopeKind, string> = {
  user: 'global',
  project: 'local',
};

/** Re-renders its text on demand, so a tab toggle does not reset the filter. */
class ScopeLine implements Component {
  constructor(private readonly text: () => string) {}

  render(_width: number): string[] {
    return this.text().split('\n');
  }

  invalidate(): void {}
}

export class AgentModelPicker extends Container {
  private step: StepKey = 'agent';
  private searchInput: Input | undefined;
  private selectList: SelectList | undefined;
  private scopeLine: ScopeLine | undefined;
  private listIndex = 0;
  private allItems: readonly SelectItem[] = [];
  private scopeIndex = 0;
  private agent: string | undefined;
  private model: string | null | undefined;

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
    private readonly data: PickerData,
    private readonly done: (result: PickerResult | null) => void,
  ) {
    super();
    this.showStep('agent');
  }

  private get scopeKind(): SettingsScopeKind {
    return this.data.scopes[this.scopeIndex]?.kind ?? 'user';
  }

  private stepTitle(): string {
    return this.step === 'agent'
      ? 'Subagent model · agent'
      : `Subagent model · model for ${this.agent ?? ''}`;
  }

  private scopeText(): string {
    const scope = this.data.scopes[this.scopeIndex];
    const label = SCOPE_LABELS[this.scopeKind];
    const path = scope ? ` → ${scope.path}` : '';
    const toggle = this.data.scopes.length > 1 ? '   [tab] switch target' : '';
    return `target: ${label}${path}${toggle}`;
  }

  private itemsForStep(): readonly SelectItem[] {
    return this.step === 'agent'
      ? this.data.agentItems
      : this.data.modelItems(this.agent ?? '', this.scopeKind);
  }

  private showStep(step: StepKey): void {
    this.step = step;
    this.allItems = this.itemsForStep();
    this.searchInput = new Input({ placeholder: 'type to filter' });
    this.searchInput.onSubmit = () => {
      this.selectList?.handleInput('\r');
    };
    this.scopeLine = new ScopeLine(() => this.scopeText());

    this.clear();
    this.addChild(new DynamicBorder((text) => this.theme.fg('accent', text)));
    this.addChild(
      new Text(this.theme.bold(this.theme.fg('accent', this.stepTitle()))),
    );
    this.addChild(this.scopeLine);
    if (this.data.localMissingNote) {
      this.addChild(
        new Text(this.theme.fg('warning', this.data.localMissingNote)),
      );
    }
    this.addChild(new Spacer(1));
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.selectList = this.buildList(this.allItems);
    this.listIndex = this.children.length;
    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        this.theme.fg(
          'dim',
          'type to filter · ↑↓ move · enter select · esc back/cancel · tab target',
        ),
      ),
    );
    this.addChild(new DynamicBorder((text) => this.theme.fg('accent', text)));
    this.invalidate();
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
    const model = this.model === undefined ? item.value : this.model;
    if (!agent) return;
    this.model = item.value === CLEAR_VALUE ? null : model;
    this.done({ agent, model: this.model, scopeKind: this.scopeKind });
  }

  private onCancel(): void {
    const index = STEP_ORDER.indexOf(this.step);
    const previous = index > 0 ? STEP_ORDER[index - 1] : undefined;
    if (!previous) {
      this.done(null);
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
