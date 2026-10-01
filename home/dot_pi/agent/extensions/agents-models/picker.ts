import { DynamicBorder, type Theme } from '@earendil-works/pi-coding-agent';
import {
  Container,
  Input,
  type KeybindingsManager,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  fuzzyFilter,
  type TUI,
} from '@earendil-works/pi-tui';

export interface PickerResult {
  readonly agent: string;
  /** `null` clears the existing override. */
  readonly model: string | null;
  readonly scopeKind: 'user' | 'project';
}

export interface PickerData {
  /** Step 1: one item per discovered agent. */
  readonly agentItems: readonly SelectItem[];
  /** Step 2: models for the chosen agent, scoped models first. */
  readonly modelItems: (agent: string) => readonly SelectItem[];
  /** Step 3: settings files that can receive the override. */
  readonly scopeItems: (
    agent: string,
    model: string | null,
  ) => readonly SelectItem[];
}

type StepKey = 'agent' | 'model' | 'scope';

const STEP_ORDER: readonly StepKey[] = ['agent', 'model', 'scope'];

const CLEAR_VALUE = '__clear__';

export class AgentModelPicker extends Container {
  private step: StepKey = 'agent';
  private searchInput: Input | undefined;
  private selectList: SelectList | undefined;
  private listIndex = 0;
  private allItems: readonly SelectItem[] = [];
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

  private stepTitle(): string {
    if (this.step === 'agent') return 'Subagent model · 1/3 agent';
    if (this.step === 'model') {
      return `Subagent model · 2/3 model for ${this.agent ?? ''}`;
    }
    return `Subagent model · 3/3 write to`;
  }

  private itemsForStep(): readonly SelectItem[] {
    if (this.step === 'agent') return this.data.agentItems;
    if (this.step === 'model') return this.data.modelItems(this.agent ?? '');
    return this.data.scopeItems(this.agent ?? '', this.model ?? null);
  }

  private showStep(step: StepKey): void {
    this.step = step;
    this.allItems = this.itemsForStep();
    this.searchInput = new Input({ placeholder: 'type to filter' });
    this.searchInput.onSubmit = () => {
      this.selectList?.handleInput('\r');
    };

    this.clear();
    this.addChild(new DynamicBorder((text) => this.theme.fg('accent', text)));
    this.addChild(
      new Text(this.theme.bold(this.theme.fg('accent', this.stepTitle()))),
    );
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
          'type to filter · ↑↓ move · enter select · esc back/cancel',
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
    if (this.step === 'model') {
      this.model = item.value === CLEAR_VALUE ? null : item.value;
      this.showStep('scope');
      return;
    }
    const agent = this.agent;
    const model = this.model;
    if (!agent || model === undefined) return;
    this.done({
      agent,
      model,
      scopeKind: item.value === 'project' ? 'project' : 'user',
    });
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

  handleInput(data: string): void {
    if (this.keybindings.matches(data, 'tui.select.cancel')) {
      this.onCancel();
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
