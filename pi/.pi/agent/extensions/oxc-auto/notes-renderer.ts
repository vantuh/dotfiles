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
 * and bg is applied OUTERMOST. theme.fg resets only fg (\\x1b[39m), so the
 * outer bg survives interior fg codes — no unpainted slivers.
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
        const notesView: Component = {
          invalidate(): void {},
          render(width: number): string[] {
            const innerWidth = Math.max(1, width - 2);
            return notes
              .map((note) =>
                wrapTextWithAnsi(note, innerWidth).map((piece) => {
                  const pad = ' '.repeat(
                    Math.max(0, innerWidth - visibleWidth(piece)),
                  );
                  const row = ` ${theme.fg('warning', piece)}${pad} `;
                  return theme.bg('toolSuccessBg', row);
                }),
              )
              .reduce<string[]>((all, rows, i) => {
                if (i > 0)
                  all.push(theme.bg('toolSuccessBg', ' '.repeat(width)));
                return all.concat(rows);
              }, []);
          },
        };
        comp.addChild(notesView);
      }
      return comp ?? new Container();
    },
  };
}
