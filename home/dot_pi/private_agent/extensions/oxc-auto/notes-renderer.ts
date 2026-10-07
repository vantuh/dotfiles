import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import {
  Container,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import type { TSchema } from 'typebox';

export const NOTE_PREFIX = '[oxc-auto]';

interface NoteTextContent {
  type: string;
  text?: string;
}
export const isNoteText = (
  c: NoteTextContent,
): c is {
  type: 'text';
  text: string;
} =>
  c.type === 'text' &&
  typeof c.text === 'string' &&
  c.text.startsWith(NOTE_PREFIX);

interface ChildMount {
  addChild(component: Component): void;
}
const isChildMount = (c: Component): c is Component & ChildMount =>
  'addChild' in c && typeof c.addChild === 'function';

/**
 * Wrap a built-in tool definition so its result block renders [oxc-auto]
 * notes beneath it (the built-in renderResult ignores text content).
 *
 * kiro-acp-style exact-width rows: each line is padded to the render width
 * and bg is applied as an open-only SGR prefix (no trailing \x1b[49m — a bg
 * reset here would also kill the ancestor Box's bg for its trailing pad
 * cell). theme.fg resets only fg (\\x1b[39m), so the bg survives interior
 * fg codes — no unpainted slivers.
 */
export function withNotesRenderer<TParams extends TSchema, TDetails, TState>(
  def: ToolDefinition<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> {
  const builtinRender = def.renderResult;
  return {
    ...def,
    renderResult(result, options, theme, context) {
      const comp = builtinRender?.(result, options, theme, context);
      const notes = result.content.filter(isNoteText).map((c) => c.text);
      if (comp && notes.length > 0 && isChildMount(comp)) {
        const toolName = def.name;
        const notesView: Component = {
          invalidate(): void {},
          render(width: number): string[] {
            const innerWidth = Math.max(1, width - 2);
            const bgOpen = theme.getBgAnsi('toolSuccessBg');
            const rows = notes
              .map((note) =>
                wrapTextWithAnsi(note, innerWidth).map((piece) => {
                  const pad = ' '.repeat(
                    Math.max(0, innerWidth - visibleWidth(piece)),
                  );
                  const row = ` ${theme.fg('warning', piece)}${pad} `;
                  return bgOpen + row;
                }),
              )
              .reduce<string[]>((all, noteRows, i) => {
                if (i > 0) all.push(bgOpen + ' '.repeat(width));
                return all.concat(noteRows);
              }, []);
            if (toolName === 'edit') rows.push(bgOpen + ' '.repeat(width));
            return rows;
          },
        };
        comp.addChild(notesView);
      }
      return comp ?? new Container();
    },
  };
}
