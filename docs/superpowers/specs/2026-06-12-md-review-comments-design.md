# md-review: Markdown Review Comments — Design

**Date:** 2026-06-12
**Status:** Approved by user (brainstorming session)

## Purpose

A VSCode extension for attaching review comments to markdown files. The standard
workflow: a human reviews a generated `.md` file, attaches comments quickly, and
passes the *same file* back to an AI, which acts on the comments (and may reply).
Comments are temporary — they live in the file, are tracked by normal git history,
and are stripped when the review cycle ends.

## Requirements

- Comments live **in the same `.md` file** — no sibling files, no external storage.
- Unobtrusive: text must still flow well in raw form, and rendering must degrade
  gracefully in plain renderers (GitHub, unenhanced previews).
- A simple visible indicator marks what each comment is attached to.
- Primary reading view is the **rendered preview**; comments appear as notes in a
  right gutter (Google-Docs style), with the anchored phrase highlighted.
- Add / edit / remove must be easy with **both mouse and keyboard**.
- Plain-text format an AI can read, act on, reply to, and strip without the
  extension installed.
- Lightweight lifecycle: optional status convention and inline replies; no
  heavyweight thread/workflow machinery.

## File format

A review comment is a **standard markdown footnote** with the reserved prefix
`rc-`. Footnotes render natively on GitHub and degrade to readable plain text
everywhere, satisfying the unobtrusive requirement with no custom syntax.

```markdown
The setback requirement is 25 feet[^rc-1] for all residential zones.

Some other paragraph that ends with a block-level comment.[^rc-2]

[^rc-1]: 💬 ("25 feet") This contradicts section 4.2 — verify against the PDF.
    ↩ AI: done — fixed, section 4.2 was the stale one.
[^rc-2]: 💬 (done) This whole paragraph reads like it was OCR'd twice.
```

Format rules:

- **Phrase anchor:** the marker `[^rc-N]` is inserted at the end of the user's
  selection. The definition opens with the anchored phrase quoted as `("...")` —
  a snapshot of the text at comment time. Double quotes inside the phrase are
  escaped as `\"`.
- **Block anchor:** the marker is appended to the end of the paragraph / list
  item / heading; the definition has no quoted phrase.
- **Replies:** indented continuation lines beginning with `↩` (valid footnote
  multi-line syntax, so GitHub still renders them as part of the footnote).
- **Status (optional convention):** a parenthesized word directly after the 💬,
  e.g. `💬 (done)`. No machinery depends on it; the strip command may
  optionally preserve open comments.
- **IDs:** numeric, stable. New comments use max+1 for the file; deletion never
  renumbers survivors.
- **Regular footnotes** (`[^1]`, `[^note]`, anything without the `rc-` prefix)
  are never touched by any part of the extension.

### The snapshot is two-way

The quoted phrase doubles as a record of what the text said when the comment was
made. The AI consuming the file can diff "what was commented on" vs "what's
there now," and — when it edits anchored text — **rewrite the quoted phrase** to
re-sync the anchor. The extension offers the same re-sync via the
"Re-anchor to selection" quick fix, which rewrites the snapshot.

## Interactions

| Action | Keyboard | Mouse |
|---|---|---|
| Add | Select text (or leave cursor in a block) → `cmd+alt+m` → input box → Enter | Right-click → "Add Review Comment" |
| Edit | Cursor on marker → code action ("Edit Review Comment") → prefilled input box | Hover marker → **Edit** link |
| Remove | Code action "Remove Review Comment" (deletes marker + definition) | Hover → **Remove** link |
| Strip all | Command palette: "Strip All Review Comments" | same |

Add anchors to the selection when text is selected, otherwise to the block
containing the cursor.

Raw-editor presentation: anchored phrases get a subtle background tint, markers
render dimmed, hover shows the full comment with Edit / Remove /
Go-to-definition command links.

Preview presentation: anchored phrase highlighted; comment shown as a note in a
right gutter, falling back to an inline callout when the pane is narrower than a
threshold; `rc-` footnote definitions are hidden from the preview body.

Deferred to v1.1: a sidebar tree view listing all comments (click to jump,
inline edit/delete icons).

## Anchor failure & recovery

Guiding principle: **a comment never vanishes silently and never blocks an
edit; it degrades and reports.**

| State | Detection | Behavior | Quick fixes |
|---|---|---|---|
| `ok` | Text immediately before marker matches the quoted phrase | Normal highlight + note | — |
| `moved` | Exact phrase found elsewhere in the marker's paragraph | Highlight at found location | "Move marker next to phrase" |
| `stale` | Phrase not found in paragraph | Degrade to block anchor on the marker's paragraph; ⚠ on the gutter note, which still shows the original quoted phrase | "Re-anchor to selection" (rewrites the snapshot), "Convert to block comment" |
| `orphaned` definition | `rc-` definition with no matching marker | Diagnostic squiggle on the definition | "Remove orphaned comment" |
| dangling marker | `rc-` marker with no definition | Diagnostic on the marker | "Remove marker" |

The strip command also removes orphans. Strip is applied as a single
`WorkspaceEdit`, so one undo restores everything.

## Architecture

TypeScript VSCode extension (`yo code` scaffold, esbuild). Three layers:

### Core model — `src/core/` (pure, no `vscode` imports)

- **Parser:** document text → `ReviewComment[]`:
  `{ id, markerRange, anchorPhrase?, resolvedAnchorRange?, state: ok | moved | stale | orphaned, text, replies, status?, defRange }`.
- **Operations:** `insertComment`, `editComment`, `removeComment`, `stripAll`,
  `updateSnapshot` — pure functions returning plain text edits.
- Fully unit-testable in isolation.

### Editor integration — `src/editor/`

- Commands + keybinding + editor context-menu contributions.
- Decorations (phrase tint, dimmed markers), re-derived from the parser on
  document change (debounced).
- Hover provider with command links; code action provider; diagnostics for
  stale/orphaned/dangling states.
- Applies core-model edits via `WorkspaceEdit`.

### Preview integration — `src/preview/`

- markdown-it plugin (contributed via `markdown.markdownItPlugins`): transforms
  `rc-` footnote references into highlighted spans + gutter-note elements;
  hides `rc-` definitions; passes regular footnotes through untouched.
- Preview CSS: right-gutter layout with inline-callout fallback at narrow
  widths.
- Preview is render-only in v1: the built-in preview offers no reliable
  click-handler channel back to the extension, so notes carry `data-line`
  attributes and double-clicking a note uses the preview's built-in
  jump-to-source to land on the definition, where hover/code actions take
  over. Preview-side edit/remove buttons are deferred to v1.1.

### Contributions (`package.json`)

Commands, `editor/context` menu items, keybinding (`cmd+alt+m` / `ctrl+alt+m`),
`markdown.markdownItPlugins`, `markdown.previewStyles`. Activation on
`onLanguage:markdown`.

## Edge cases

- Quotes in anchored phrase: escaped `\"`; parser matches the quoted segment
  with escape awareness, then verifies against buffer text.
- Files with no comments: parser bails on first scan if `[^rc-` is absent —
  zero ongoing cost.
- Multiple comments on overlapping/adjacent text: allowed; markers stack
  (`text[^rc-1][^rc-2]`); gutter notes stack vertically.

## Testing

- **Unit (vitest):** core model — parsing, all anchor-failure states,
  insert/edit/remove/strip/updateSnapshot round-trips, stable-ID behavior,
  "regular footnotes untouched" invariant, escaped-quote handling.
- **Fixtures:** `fixtures/` with sample reviewed markdown for manual preview
  verification.
- **Integration (`@vscode/test-electron`):** minimal — command wiring only.

## Out of scope (v1)

- Sidebar tree view of comments (v1.1).
- Preview-side edit/remove buttons on gutter notes (v1.1).
- Multi-file / workspace-wide comment aggregation.
- Any storage outside the `.md` file; any server or sync.
- Configurable syntax — the `rc-` convention is fixed.
