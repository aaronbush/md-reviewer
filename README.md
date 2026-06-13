# md-review — Markdown Review Comments for VSCode

Attach lightweight review comments to markdown files. Comments live in the
same file as ordinary footnotes with an `rc-` prefix, so they survive any
toolchain, render acceptably everywhere (GitHub renders them as footnotes),
and are trivially machine-readable.

## Workflow

1. Review a markdown file; select text (or just put the cursor in a paragraph)
   and hit `cmd+alt+m` (`ctrl+alt+m`) to attach a comment.
2. Hand the file to an AI (or a colleague) — the comments are plain text.
3. They act on the comments, optionally replying inline.
4. Run **MD Review: Strip All Review Comments** when the cycle is done.

## Format

```
The fee is 25 feet[^rc-1] for all zones.

[^rc-1]: 💬 (open) ("25 feet") This contradicts section 4.2.
    ↩ AI: done — fixed.
```

- `[^rc-N]` — marker placed after the anchored phrase or at the end of a block.
- `💬` opens every definition; `(status)` is optional (e.g. `open`, `done`).
- `("…")` — snapshot of the anchored phrase at comment time (quotes escaped
  as `\"`); absent for block-level comments.
- `↩ …` on indented continuation lines — replies.

## Instructions blurb for AI agents

Paste this into your prompt when handing over a reviewed file:

> Review comments in this file are footnotes named `[^rc-N]`. Each definition
> starts with 💬, optionally followed by a `(status)` and a `("quoted phrase")`
> snapshot of the text the comment was anchored to. Address each comment.
> If you change anchored text, update the quoted snapshot to match. Reply by
> appending an indented line starting with `↩ ` to the footnote definition.
> Mark handled comments `(done)` or remove the marker and definition entirely.

## Editor features

- Highlighted anchors, dimmed markers, hover cards with Edit/Remove links.
- Quick fixes for stale anchors (re-anchor, convert to block), orphaned
  definitions, and dangling markers.
- Preview: anchored phrases highlighted, comments shown as right-gutter notes.

## Development

- `npm install && npm run build` — bundle to `dist/`.
- `npm test` — vitest unit tests (core parser/operations, preview plugin).
- F5 — Extension Development Host; open `fixtures/sample-review.md`.
