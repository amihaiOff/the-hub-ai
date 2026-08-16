'use client';

import Heading from '@tiptap/extension-heading';
import { ReactNodeViewRenderer, NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `CollapsibleHeading` extends the default Heading node with a `collapsed`
 * boolean attribute and a NodeView that renders a chevron button on the
 * left of the heading. A ProseMirror plugin translates the attribute into
 * decorations that hide every sibling block between this heading and the
 * next equal-or-higher-level heading, giving a Notion-style outline
 * toggle without touching the document structure.
 */
export const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({
          'data-collapsed': attrs.collapsed ? 'true' : 'false',
        }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingNodeView);
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), buildCollapseDecorationsPlugin()];
  },
});

function HeadingNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const level = Number(node.attrs.level ?? 1);
  const collapsed = Boolean(node.attrs.collapsed);

  const toggle = () => {
    if (!editor.isEditable) return;
    updateAttributes({ collapsed: !collapsed });
  };

  // Aliased to a valid Tailwind tag class map so JSX picks the right heading
  // element (h1/h2/h3/...). NodeViewContent renders the editable text.
  const Tag = `h${Math.min(6, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  return (
    <NodeViewWrapper
      as="div"
      data-collapsed={collapsed ? 'true' : 'false'}
      className="group relative"
    >
      <button
        type="button"
        // Prevent ProseMirror's own dragstart when the user clicks the
        // toggle. contentEditable=false ensures the chevron isn't part of
        // the editable text.
        contentEditable={false}
        // tabIndex=-1 keeps this button OUT of the keyboard tab order.
        // Otherwise pressing Tab from inside a list item steals focus
        // to the nearest chevron button (native browser behaviour)
        // BEFORE ProseMirror's Tab keymap (sinkListItem) can fire —
        // the caret leaves the editor and list-indent silently no-ops.
        tabIndex={-1}
        onClick={toggle}
        aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        aria-expanded={!collapsed}
        className={cn(
          'text-muted-foreground/60 hover:text-foreground absolute top-1/2 -left-6 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-opacity',
          // Desktop reveals the toggle on hover; touch devices have no hover, so
          // keep it visible there — otherwise collapsible headings look like
          // plain headings on mobile and the collapse affordance is undiscoverable.
          collapsed
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
        )}
      >
        <ChevronRight className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-90')} />
      </button>
      {/* `dir` comes from the AutoTextDirection global attribute. A React
          NodeView doesn't forward node attrs to the DOM automatically, so we
          apply it here — otherwise a Hebrew heading would inherit the doc's
          LTR base direction and render left-aligned. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <NodeViewContent as={Tag as any} dir={String(node.attrs.dir ?? 'auto')} />
    </NodeViewWrapper>
  );
}

// ─── Collapse decorations plugin ─────────────────────────────────────────

const collapsePluginKey = new PluginKey('collapsible-heading-decorations');

/**
 * Walks the top-level children of the doc and, whenever it hits a heading
 * flagged `collapsed`, adds a `hidden-by-collapse` class decoration to
 * every following sibling until it encounters another heading of the
 * same-or-higher level. The class hides the block via globals.css so the
 * document structure stays intact.
 */
function buildCollapseDecorationsPlugin() {
  return new Plugin({
    key: collapsePluginKey,
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const doc = state.doc;

        doc.forEach((child, offset, index) => {
          if (!isCollapsedHeading(child)) return;
          const collapsedLevel = Number(child.attrs.level ?? 1);

          // Walk forward siblings until the next heading of level <= collapsedLevel.
          let cursor = offset + child.nodeSize;
          for (let i = index + 1; i < doc.childCount; i++) {
            const sibling = doc.child(i);
            const siblingLevel =
              sibling.type.name === 'heading' ? Number(sibling.attrs.level ?? 6) : Infinity;
            if (sibling.type.name === 'heading' && siblingLevel <= collapsedLevel) break;
            decorations.push(
              Decoration.node(cursor, cursor + sibling.nodeSize, {
                class: 'hidden-by-collapse',
              })
            );
            cursor += sibling.nodeSize;
          }
        });

        return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
      },
    },
  });
}

function isCollapsedHeading(node: PMNode): boolean {
  return node.type.name === 'heading' && Boolean(node.attrs.collapsed);
}
