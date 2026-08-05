import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * AutoCapitalize — a small ProseMirror plugin that upper-cases the first
 * letter of a new sentence as the user types.
 *
 * Triggers on any single lowercase letter insertion when either:
 *   - the three chars immediately preceding the cursor (in the same block)
 *     match `[.!?]\s+` — i.e. sentence-ending punctuation + whitespace, or
 *   - the parent block is empty at the cursor (start of a paragraph/heading).
 *
 * Skips inside `codeBlock` (and future math nodes) so code stays verbatim.
 * A single `enabled: false` flip on the extension disables the whole plugin
 * without unmounting the editor.
 */
export interface AutoCapitalizeOptions {
  enabled: boolean;
}

const AUTO_CAP_KEY = new PluginKey('autoCapitalize');

// Nodes where we never rewrite the incoming character. `math*` don't exist in
// the schema today but are cheap to list up-front so we don't have to remember
// to update this when they're added.
const SKIP_NODE_TYPES = new Set(['codeBlock', 'math', 'mathInline', 'mathBlock']);

export const AutoCapitalize = Extension.create<AutoCapitalizeOptions>({
  name: 'autoCapitalize',

  addOptions() {
    return { enabled: true };
  },

  addProseMirrorPlugins() {
    // Captured once at editor-create time. The parent remounts the editor
    // when the user flips the toggle, so `enabled` here always reflects
    // the current setting for this editor instance.
    const enabled = this.options.enabled;
    return [
      new Plugin({
        key: AUTO_CAP_KEY,
        props: {
          handleTextInput(view, from, to, text) {
            if (!enabled) return false;
            // Only intercept a single lowercase ASCII letter. Anything else
            // (numbers, punctuation, multi-char paste, non-Latin scripts) is
            // left alone — auto-caps is an English-prose affordance.
            if (text.length !== 1 || !/^[a-z]$/.test(text)) return false;

            const { state } = view;
            const $pos = state.doc.resolve(from);
            const parent = $pos.parent;
            if (SKIP_NODE_TYPES.has(parent.type.name)) return false;

            // Offset of the cursor within the parent block's text.
            const offsetInParent = from - $pos.start();

            // Start of block: parent has no text before the cursor.
            if (offsetInParent === 0) {
              view.dispatch(state.tr.insertText(text.toUpperCase(), from, to));
              return true;
            }

            // Look back up to 3 chars within the same block.
            const lookbackStart = Math.max(0, offsetInParent - 3);
            const before = parent.textBetween(lookbackStart, offsetInParent, '\n', '\n');
            if (/[.!?]\s+$/.test(before)) {
              view.dispatch(state.tr.insertText(text.toUpperCase(), from, to));
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
