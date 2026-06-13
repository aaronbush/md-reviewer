# Markdown Review Comments (md-review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VSCode extension that attaches review comments to markdown files as `rc-` prefixed footnotes, with editor decorations/hover/code-actions for managing them and Google-Docs-style gutter notes in the built-in markdown preview.

**Architecture:** Three layers. A pure core (`src/core/`) parses `[^rc-N]` markers and `[^rc-N]: 💬 …` definitions into a model and produces plain text edits for all mutations — no `vscode` imports, fully unit-tested with vitest. The editor layer (`src/editor/`) wires commands, decorations, hover, diagnostics, and code actions, converting core offsets to VSCode ranges. The preview layer (`src/preview/`) is a markdown-it plugin (reusing the same core parser) plus CSS for right-gutter notes.

**Tech Stack:** TypeScript (strict), esbuild bundling, vitest for unit tests, VSCode extension API, markdown-it plugin API. No runtime dependencies (markdown-it is provided by VSCode; it's a devDependency for tests/types only).

**Spec:** `docs/superpowers/specs/2026-06-12-md-review-comments-design.md`

**Verification note:** Command wiring is verified via the F5 manual checklists in Tasks 8, 9, 10, 11, and 13 (no `@vscode/test-electron` in v1 — the spec calls for minimal integration testing and the core logic is fully unit-tested).

## File structure

```
md-review/
├── package.json              # manifest + contributions (commands, menus, keybindings, preview)
├── tsconfig.json
├── esbuild.js                # bundles src/extension.ts → dist/extension.js
├── .gitignore
├── .vscode/
│   ├── launch.json           # F5 Extension Development Host
│   └── tasks.json
├── media/
│   └── preview.css           # gutter-note styles injected into the markdown preview
├── fixtures/
│   └── sample-review.md      # manual-testing fixture
├── src/
│   ├── extension.ts          # activate(): registers everything, returns extendMarkdownIt
│   ├── core/
│   │   ├── types.ts          # Span, TextEdit, ReviewComment, ParseResult
│   │   ├── parser.ts         # text → ParseResult (+ escape/unescape helpers)
│   │   ├── parser.test.ts
│   │   ├── operations.ts     # insert/edit/remove/strip/reanchor/… → TextEdit[]
│   │   └── operations.test.ts
│   ├── editor/
│   │   ├── commands.ts       # all mdReview.* commands + applyTextEdits + commentAt
│   │   ├── decorations.ts    # anchor tint, dimmed markers, stale underline
│   │   ├── hover.ts          # hover card with Edit/Remove/Go-to-definition links
│   │   ├── diagnostics.ts    # warnings for stale/orphaned/dangling
│   │   └── codeActions.ts    # quick fixes
│   └── preview/
│       ├── markdownItPlugin.ts
│       └── markdownItPlugin.test.ts
└── README.md                 # format spec + instructions blurb for AI agents
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.js`, `.gitignore`, `.vscode/launch.json`, `.vscode/tasks.json`, `src/extension.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "md-review",
  "displayName": "Markdown Review Comments",
  "description": "Attach lightweight review comments to markdown files as rc- footnotes.",
  "version": "0.1.0",
  "publisher": "abush",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onLanguage:markdown"],
  "main": "./dist/extension.js",
  "contributes": {},
  "scripts": {
    "build": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "test": "vitest run --passWithNoTests",
    "vscode:prepublish": "node esbuild.js --production"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.0",
    "@types/node": "^20.14.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.21.5",
    "markdown-it": "^14.1.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `esbuild.js`**

```js
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
*.vsix
```

- [ ] **Step 5: Write `.vscode/launch.json` and `.vscode/tasks.json`**

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    { "type": "npm", "script": "build", "problemMatcher": [], "label": "npm: build" }
  ]
}
```

- [ ] **Step 6: Write stub `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {}

export function deactivate() {}
```

- [ ] **Step 7: Install and verify build + empty test run**

Run: `npm install && npm run build && npm test`
Expected: install succeeds, `dist/extension.js` created, vitest reports "no test files found" and exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold md-review extension (esbuild, vitest, launch config)"
```

---

### Task 2: Core types + parser for definitions

**Files:**
- Create: `src/core/types.ts`, `src/core/parser.ts`
- Test: `src/core/parser.test.ts`

- [ ] **Step 1: Write `src/core/types.ts`**

```ts
export interface Span {
  start: number;
  end: number;
}

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

export type AnchorState = 'ok' | 'moved' | 'stale';

export interface ReviewComment {
  id: number;
  /** The [^rc-N] reference in the body. */
  marker: Span;
  /** Snapshot phrase from the definition, unescaped. Absent for block comments. */
  anchorPhrase?: string;
  /** Where the phrase was found in the body (ok/moved only). */
  anchorRange?: Span;
  state: AnchorState;
  /** Optional status word, e.g. "done". */
  status?: string;
  /** Comment text; continuation lines joined with \n. */
  text: string;
  replies: string[];
  /** The whole definition block, including continuation lines and trailing newline. */
  def: Span;
  /** 0-based line number of the definition's first line. */
  defLine: number;
}

export interface OrphanedDef {
  id: number;
  def: Span;
  defLine: number;
}

export interface DanglingMarker {
  id: number;
  marker: Span;
}

export interface ParseResult {
  comments: ReviewComment[];
  orphanedDefs: OrphanedDef[];
  danglingMarkers: DanglingMarker[];
}
```

- [ ] **Step 2: Write failing tests for definition parsing**

`src/core/parser.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { escapePhrase, parseReviewComments, unescapePhrase } from './parser';

describe('phrase escaping', () => {
  test('round-trips quotes and backslashes', () => {
    const s = 'say "hi" \\ now';
    expect(unescapePhrase(escapePhrase(s))).toBe(s);
  });
});

describe('definition parsing', () => {
  test('parses phrase-anchored definition', () => {
    const text = 'The fee is 25 feet[^rc-1] today.\n\n[^rc-1]: 💬 ("25 feet") Check this.\n';
    const r = parseReviewComments(text);
    expect(r.comments).toHaveLength(1);
    const c = r.comments[0];
    expect(c.id).toBe(1);
    expect(c.anchorPhrase).toBe('25 feet');
    expect(c.text).toBe('Check this.');
    expect(c.status).toBeUndefined();
    expect(text.slice(c.def.start, c.def.end)).toBe('[^rc-1]: 💬 ("25 feet") Check this.\n');
  });

  test('parses block definition with status', () => {
    const text = 'A paragraph.[^rc-2]\n\n[^rc-2]: 💬 (done) Rewrite this.\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.anchorPhrase).toBeUndefined();
    expect(c.status).toBe('done');
    expect(c.text).toBe('Rewrite this.');
  });

  test('parses replies and continuation lines', () => {
    const text =
      'Words here[^rc-3] ok.\n\n' +
      '[^rc-3]: 💬 ("here") First line.\n' +
      '    second line.\n' +
      '    ↩ AI: done — fixed.\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.text).toBe('First line.\nsecond line.');
    expect(c.replies).toEqual(['AI: done — fixed.']);
    expect(text.slice(c.def.start, c.def.end)).toContain('↩ AI: done');
  });

  test('unescapes quoted phrase', () => {
    const text = 'say "hi" now[^rc-4]\n\n[^rc-4]: 💬 ("say \\"hi\\" now") quoting.\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.anchorPhrase).toBe('say "hi" now');
  });

  test('ignores regular footnotes', () => {
    const text = 'Text[^1] and[^note] more.\n\n[^1]: a normal footnote\n[^note]: another\n';
    const r = parseReviewComments(text);
    expect(r.comments).toHaveLength(0);
    expect(r.orphanedDefs).toHaveLength(0);
    expect(r.danglingMarkers).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/parser.test.ts`
Expected: FAIL — cannot resolve `./parser`.

- [ ] **Step 4: Write `src/core/parser.ts`**

```ts
import {
  AnchorState,
  DanglingMarker,
  OrphanedDef,
  ParseResult,
  ReviewComment,
  Span,
} from './types';

const DEF_RE =
  /^\[\^rc-(\d+)\]: 💬(?: \(([A-Za-z][\w-]*)\))?(?: \("((?:[^"\\]|\\.)*)"\))?(?: (.*))?$/;
const MARKER_RE = /\[\^rc-(\d+)\]/g;
const CONT_RE = /^(?: {4}|\t)(.*)$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function escapePhrase(s: string): string {
  return s.replace(/[\\"]/g, (c) => '\\' + c);
}

export function unescapePhrase(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

interface Line {
  text: string;
  start: number;
  end: number; // exclusive, excludes the \n
  inFence: boolean;
}

function scanLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  let inFence = false;
  let fenceChar = '';
  for (;;) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const lineText = text.slice(start, end);
    const fm = FENCE_RE.exec(lineText.trimStart());
    let lineInFence = inFence;
    if (fm) {
      if (!inFence) {
        inFence = true;
        fenceChar = fm[1][0];
      } else if (fm[1][0] === fenceChar) {
        inFence = false;
      }
      lineInFence = true; // fence delimiter lines never hold real markers
    }
    lines.push({ text: lineText, start, end, inFence: lineInFence });
    if (end === text.length) break;
    start = end + 1;
  }
  return lines;
}

interface Def {
  id: number;
  status?: string;
  phrase?: string;
  text: string;
  replies: string[];
  span: Span;
  line: number;
}

export function parseReviewComments(text: string): ParseResult {
  if (!text.includes('[^rc-')) {
    return { comments: [], orphanedDefs: [], danglingMarkers: [] };
  }
  const lines = scanLines(text);

  const defs: Def[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.inFence) continue;
    const m = DEF_RE.exec(line.text);
    if (!m) continue;
    const def: Def = {
      id: parseInt(m[1], 10),
      status: m[2],
      phrase: m[3] !== undefined ? unescapePhrase(m[3]) : undefined,
      text: m[4] ?? '',
      replies: [],
      span: { start: line.start, end: line.end },
      line: i,
    };
    let j = i + 1;
    while (j < lines.length) {
      const cm = CONT_RE.exec(lines[j].text);
      if (!cm) break;
      const content = cm[1];
      if (content.startsWith('↩')) {
        def.replies.push(content.replace(/^↩\s*/, ''));
      } else {
        def.text += '\n' + content;
      }
      def.span.end = lines[j].end;
      j++;
    }
    if (def.span.end < text.length) def.span.end += 1; // swallow trailing \n
    defs.push(def);
    i = j - 1;
  }

  const markers: { id: number; span: Span }[] = [];
  MARKER_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MARKER_RE.exec(text))) {
    const span: Span = { start: mm.index, end: mm.index + mm[0].length };
    if (defs.some((d) => span.start >= d.span.start && span.start < d.span.end)) continue;
    const line = lines.find((l) => span.start >= l.start && span.start <= l.end);
    if (line?.inFence) continue;
    markers.push({ id: parseInt(mm[1], 10), span });
  }

  const comments: ReviewComment[] = [];
  const orphanedDefs: OrphanedDef[] = [];
  const usedMarkers = new Set<number>();
  for (const def of defs) {
    const mi = markers.findIndex((mk, idx) => mk.id === def.id && !usedMarkers.has(idx));
    if (mi === -1) {
      orphanedDefs.push({ id: def.id, def: def.span, defLine: def.line });
      continue;
    }
    usedMarkers.add(mi);
    const marker = markers[mi].span;
    comments.push({
      id: def.id,
      marker,
      anchorPhrase: def.phrase,
      status: def.status,
      text: def.text,
      replies: def.replies,
      def: def.span,
      defLine: def.line,
      ...resolveAnchor(text, lines, marker, def.phrase),
    });
  }
  const danglingMarkers: DanglingMarker[] = markers
    .filter((_, idx) => !usedMarkers.has(idx))
    .map((mk) => ({ id: mk.id, marker: mk.span }));

  return { comments, orphanedDefs, danglingMarkers };
}

function resolveAnchor(
  text: string,
  lines: Line[],
  marker: Span,
  phrase?: string
): { state: AnchorState; anchorRange?: Span } {
  if (!phrase) return { state: 'ok' };
  if (
    marker.start >= phrase.length &&
    text.slice(marker.start - phrase.length, marker.start) === phrase
  ) {
    return {
      state: 'ok',
      anchorRange: { start: marker.start - phrase.length, end: marker.start },
    };
  }
  const li = lines.findIndex((l) => marker.start >= l.start && marker.start <= l.end);
  let lo = li;
  let hi = li;
  while (lo > 0 && lines[lo - 1].text.trim() !== '') lo--;
  while (hi < lines.length - 1 && lines[hi + 1].text.trim() !== '') hi++;
  const paraStart = lines[lo].start;
  const para = text.slice(paraStart, lines[hi].end);
  const idx = para.indexOf(phrase);
  if (idx !== -1) {
    return {
      state: 'moved',
      anchorRange: { start: paraStart + idx, end: paraStart + idx + phrase.length },
    };
  }
  return { state: 'stale' };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/parser.test.ts`
Expected: PASS (all tests in this file).

- [ ] **Step 6: Commit**

```bash
git add src/core
git commit -m "feat: core types and parser for rc- footnote definitions"
```

---

### Task 3: Parser — marker matching, orphans, danglings, code fences

**Files:**
- Modify: `src/core/parser.test.ts` (add tests; parser.ts from Task 2 already implements this — these tests pin the behavior)

- [ ] **Step 1: Add tests**

Append to `src/core/parser.test.ts`:

```ts
describe('marker matching', () => {
  test('reports orphaned definition when marker is missing', () => {
    const text = 'No marker here.\n\n[^rc-7]: 💬 lost comment\n';
    const r = parseReviewComments(text);
    expect(r.comments).toHaveLength(0);
    expect(r.orphanedDefs).toEqual([
      expect.objectContaining({ id: 7 }),
    ]);
  });

  test('reports dangling marker when definition is missing', () => {
    const text = 'A marker[^rc-9] with no definition.\n';
    const r = parseReviewComments(text);
    expect(r.comments).toHaveLength(0);
    expect(r.danglingMarkers).toEqual([expect.objectContaining({ id: 9 })]);
  });

  test('ignores markers inside fenced code blocks', () => {
    const text =
      'Real one[^rc-1] here.\n\n```\nfake[^rc-2] in code\n```\n\n[^rc-1]: 💬 real\n[^rc-2]: 💬 orphan-by-fence\n';
    const r = parseReviewComments(text);
    expect(r.comments.map((c) => c.id)).toEqual([1]);
    expect(r.orphanedDefs.map((o) => o.id)).toEqual([2]);
  });

  test('marker span covers the literal [^rc-N]', () => {
    const text = 'abc[^rc-12] def\n\n[^rc-12]: 💬 x\n';
    const c = parseReviewComments(text).comments[0];
    expect(text.slice(c.marker.start, c.marker.end)).toBe('[^rc-12]');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/core/parser.test.ts`
Expected: PASS. If any fail, fix `parser.ts` (the Task 2 implementation covers these cases; failures indicate a bug to correct now).

- [ ] **Step 3: Commit**

```bash
git add src/core/parser.test.ts
git commit -m "test: pin marker matching, orphan/dangling, and code-fence behavior"
```

---

### Task 4: Parser — anchor resolution (ok / moved / stale)

**Files:**
- Modify: `src/core/parser.test.ts`

- [ ] **Step 1: Add tests**

Append to `src/core/parser.test.ts`:

```ts
describe('anchor resolution', () => {
  test('ok: phrase immediately precedes marker', () => {
    const text = 'The fee is 25 feet[^rc-1] today.\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.state).toBe('ok');
    expect(text.slice(c.anchorRange!.start, c.anchorRange!.end)).toBe('25 feet');
  });

  test('moved: phrase found elsewhere in the paragraph', () => {
    const text = 'Now 25 feet is mentioned early, marker later[^rc-1] in line.\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.state).toBe('moved');
    expect(text.slice(c.anchorRange!.start, c.anchorRange!.end)).toBe('25 feet');
  });

  test('stale: phrase not found in paragraph', () => {
    const text = 'The fee is thirty feet[^rc-1] today.\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.state).toBe('stale');
    expect(c.anchorRange).toBeUndefined();
    expect(c.anchorPhrase).toBe('25 feet'); // snapshot preserved for display
  });

  test('block comments are always ok with no range', () => {
    const text = 'A paragraph.[^rc-2]\n\n[^rc-2]: 💬 fix tone\n';
    const c = parseReviewComments(text).comments[0];
    expect(c.state).toBe('ok');
    expect(c.anchorRange).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/core/parser.test.ts`
Expected: PASS (implementation exists from Task 2; fix bugs if any test fails).

- [ ] **Step 3: Commit**

```bash
git add src/core/parser.test.ts
git commit -m "test: pin anchor resolution states ok/moved/stale"
```

---

### Task 5: Operations — applyEdits, nextId, insertComment

**Files:**
- Create: `src/core/operations.ts`
- Test: `src/core/operations.test.ts`

- [ ] **Step 1: Write failing tests**

`src/core/operations.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseReviewComments } from './parser';
import { applyEdits, insertComment, nextId } from './operations';

describe('applyEdits', () => {
  test('applies multiple edits against original offsets', () => {
    const out = applyEdits('hello world', [
      { start: 0, end: 5, newText: 'goodbye' },
      { start: 6, end: 11, newText: 'moon' },
    ]);
    expect(out).toBe('goodbye moon');
  });
});

describe('nextId', () => {
  test('is 1 for empty file and max+1 otherwise', () => {
    expect(nextId(parseReviewComments(''))).toBe(1);
    const text = 'a[^rc-3] b[^rc-8]\n\n[^rc-3]: 💬 x\n[^rc-8]: 💬 y\n';
    expect(nextId(parseReviewComments(text))).toBe(9);
  });

  test('counts orphans and danglings so ids are never reused', () => {
    const text = 'dangling[^rc-5]\n\n[^rc-2]: 💬 orphan\n';
    expect(nextId(parseReviewComments(text))).toBe(6);
  });
});

describe('insertComment', () => {
  test('selection: inserts marker after selection and quoted-phrase definition at EOF', () => {
    const text = 'The fee is 25 feet today.\n';
    const selStart = text.indexOf('25 feet');
    const selEnd = selStart + '25 feet'.length;
    const { id, edits } = insertComment(text, parseReviewComments(text), selStart, selEnd, 'Check this.');
    expect(id).toBe(1);
    const out = applyEdits(text, edits);
    expect(out).toBe('The fee is 25 feet[^rc-1] today.\n[^rc-1]: 💬 ("25 feet") Check this.\n');
    const c = parseReviewComments(out).comments[0];
    expect(c.state).toBe('ok');
  });

  test('cursor only: inserts marker at end of block', () => {
    const text = 'First paragraph line one\nline two of same block\n\nNext para.\n';
    const cursor = text.indexOf('line one');
    const { edits } = insertComment(text, parseReviewComments(text), cursor, cursor, 'Block note');
    const out = applyEdits(text, edits);
    expect(out).toContain('line two of same block[^rc-1]\n\nNext para.');
    expect(out.endsWith('[^rc-1]: 💬 Block note\n')).toBe(true);
  });

  test('escapes quotes in the snapshot', () => {
    const text = 'say "hi" now\n';
    const { edits } = insertComment(text, parseReviewComments(text), 0, 12, 'quoting');
    const out = applyEdits(text, edits);
    expect(out).toContain('[^rc-1]: 💬 ("say \\"hi\\" now") quoting');
    expect(parseReviewComments(out).comments[0].anchorPhrase).toBe('say "hi" now');
  });

  test('adds newline separator when file lacks trailing newline', () => {
    const text = 'word';
    const { edits } = insertComment(text, parseReviewComments(text), 0, 4, 'c');
    const out = applyEdits(text, edits);
    expect(out).toBe('word[^rc-1]\n[^rc-1]: 💬 ("word") c\n');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/operations.test.ts`
Expected: FAIL — cannot resolve `./operations`.

- [ ] **Step 3: Write `src/core/operations.ts`**

```ts
import { escapePhrase } from './parser';
import { ParseResult, Span, TextEdit } from './types';

export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (const e of sorted) {
    text = text.slice(0, e.start) + e.newText + text.slice(e.end);
  }
  return text;
}

const spanEdit = (s: Span): TextEdit => ({ start: s.start, end: s.end, newText: '' });

export function nextId(parse: ParseResult): number {
  const ids = [
    ...parse.comments.map((c) => c.id),
    ...parse.orphanedDefs.map((o) => o.id),
    ...parse.danglingMarkers.map((d) => d.id),
  ];
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** End offset of the block (paragraph/list item/heading) containing `offset`,
 *  with trailing whitespace excluded. */
function endOfBlock(text: string, offset: number): number {
  const len = text.length;
  let pos = text.lastIndexOf('\n', offset - 1) + 1;
  let end = pos;
  while (pos < len) {
    let nl = text.indexOf('\n', pos);
    if (nl === -1) nl = len;
    const line = text.slice(pos, nl);
    if (line.trim() === '') break;
    end = pos + line.replace(/\s+$/, '').length;
    pos = nl + 1;
  }
  return end;
}

export interface InsertResult {
  id: number;
  edits: TextEdit[];
}

export function insertComment(
  text: string,
  parse: ParseResult,
  selStart: number,
  selEnd: number,
  commentText: string
): InsertResult {
  const id = nextId(parse);
  let markerPos: number;
  let phrasePart = '';
  if (selEnd > selStart) {
    markerPos = selEnd;
    phrasePart = ` ("${escapePhrase(text.slice(selStart, selEnd))}")`;
  } else {
    markerPos = endOfBlock(text, selStart);
  }
  const defPrefix = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  return {
    id,
    edits: [
      { start: markerPos, end: markerPos, newText: `[^rc-${id}]` },
      {
        start: text.length,
        end: text.length,
        newText: `${defPrefix}[^rc-${id}]: 💬${phrasePart} ${commentText}\n`,
      },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/operations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/operations.ts src/core/operations.test.ts
git commit -m "feat: applyEdits, nextId, insertComment operations"
```

---

### Task 6: Operations — editComment, removeComment, stripAll

**Files:**
- Modify: `src/core/operations.ts`, `src/core/operations.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/core/operations.test.ts` (extend the existing imports line to include `editComment, removeComment, stripAll`):

```ts
describe('editComment', () => {
  test('replaces first-line text, preserving status, phrase, and replies', () => {
    const text =
      'fee is 25 feet[^rc-1] now\n\n' +
      '[^rc-1]: 💬 (open) ("25 feet") old text\n' +
      '    ↩ AI: noted\n';
    const out = applyEdits(text, editComment(text, parseReviewComments(text), 1, 'new text'));
    expect(out).toContain('[^rc-1]: 💬 (open) ("25 feet") new text\n    ↩ AI: noted\n');
    expect(out).not.toContain('old text');
  });
});

describe('removeComment', () => {
  test('removes marker and whole definition block', () => {
    const text =
      'fee is 25 feet[^rc-1] now\n\n[^rc-1]: 💬 ("25 feet") gone\n    ↩ reply too\n';
    const out = applyEdits(text, removeComment(text, parseReviewComments(text), 1));
    expect(out).toBe('fee is 25 feet now\n\n');
  });

  test('removes a dangling marker by id', () => {
    const text = 'dangling[^rc-5] here\n';
    const out = applyEdits(text, removeComment(text, parseReviewComments(text), 5));
    expect(out).toBe('dangling here\n');
  });

  test('removes an orphaned definition by id', () => {
    const text = 'body\n\n[^rc-2]: 💬 orphan\n';
    const out = applyEdits(text, removeComment(text, parseReviewComments(text), 2));
    expect(out).toBe('body\n\n');
  });
});

describe('stripAll', () => {
  test('removes all rc comments, orphans, and danglings; leaves regular footnotes', () => {
    const text =
      'a[^rc-1] b[^1] c[^rc-9]\n\n' +
      '[^rc-1]: 💬 one\n' +
      '[^1]: real footnote\n' +
      '[^rc-3]: 💬 orphan\n';
    const out = applyEdits(text, stripAll(parseReviewComments(text)));
    expect(out).toBe('a b[^1] c\n\n[^1]: real footnote\n');
  });

  test('single undo friendliness: returns plain edits, no comments → no edits', () => {
    expect(stripAll(parseReviewComments('plain\n'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/operations.test.ts`
Expected: FAIL — `editComment` is not exported.

- [ ] **Step 3: Implement in `src/core/operations.ts`**

Append:

```ts
function defFirstLineEnd(text: string, def: Span): number {
  const nl = text.indexOf('\n', def.start);
  return nl === -1 || nl >= def.end ? def.end : nl;
}

/** Rebuild the first definition line. `firstLineText` is the comment's first text line. */
function buildDefFirstLine(
  id: number,
  status: string | undefined,
  phrase: string | undefined,
  firstLineText: string
): string {
  const statusPart = status ? ` (${status})` : '';
  const phrasePart = phrase !== undefined ? ` ("${escapePhrase(phrase)}")` : '';
  return `[^rc-${id}]: 💬${statusPart}${phrasePart} ${firstLineText}`;
}

export function editComment(
  text: string,
  parse: ParseResult,
  id: number,
  newText: string
): TextEdit[] {
  const c = parse.comments.find((c) => c.id === id);
  if (!c) return [];
  return [
    {
      start: c.def.start,
      end: defFirstLineEnd(text, c.def),
      newText: buildDefFirstLine(id, c.status, c.anchorPhrase, newText),
    },
  ];
}

export function removeComment(text: string, parse: ParseResult, id: number): TextEdit[] {
  const edits: TextEdit[] = [];
  const c = parse.comments.find((c) => c.id === id);
  if (c) {
    edits.push(spanEdit(c.marker), spanEdit(c.def));
  }
  for (const o of parse.orphanedDefs.filter((o) => o.id === id)) edits.push(spanEdit(o.def));
  for (const d of parse.danglingMarkers.filter((d) => d.id === id)) edits.push(spanEdit(d.marker));
  return edits;
}

export function stripAll(parse: ParseResult): TextEdit[] {
  return [
    ...parse.comments.flatMap((c) => [spanEdit(c.marker), spanEdit(c.def)]),
    ...parse.orphanedDefs.map((o) => spanEdit(o.def)),
    ...parse.danglingMarkers.map((d) => spanEdit(d.marker)),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/operations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/operations.ts src/core/operations.test.ts
git commit -m "feat: editComment, removeComment, stripAll operations"
```

---

### Task 7: Operations — reanchor, convertToBlock, moveMarkerToPhrase

**Files:**
- Modify: `src/core/operations.ts`, `src/core/operations.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/core/operations.test.ts` (extend imports with `convertToBlock, moveMarkerToPhrase, reanchor`):

```ts
describe('recovery operations', () => {
  test('reanchor moves marker to selection and rewrites snapshot', () => {
    const text =
      'fee is thirty feet[^rc-1] now\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const selStart = text.indexOf('thirty feet');
    const selEnd = selStart + 'thirty feet'.length;
    const out = applyEdits(
      text,
      reanchor(text, parseReviewComments(text), 1, selStart, selEnd)
    );
    expect(out).toContain('fee is thirty feet[^rc-1] now');
    expect(out).toContain('[^rc-1]: 💬 ("thirty feet") check');
    expect(parseReviewComments(out).comments[0].state).toBe('ok');
  });

  test('convertToBlock drops the quoted phrase', () => {
    const text = 'fee is thirty feet[^rc-1] now\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const out = applyEdits(text, convertToBlock(text, parseReviewComments(text), 1));
    expect(out).toContain('[^rc-1]: 💬 check\n');
    const c = parseReviewComments(out).comments[0];
    expect(c.anchorPhrase).toBeUndefined();
    expect(c.state).toBe('ok');
  });

  test('moveMarkerToPhrase relocates marker next to the found phrase', () => {
    const text =
      'Now 25 feet is early, marker later[^rc-1] in line.\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const parse = parseReviewComments(text);
    expect(parse.comments[0].state).toBe('moved');
    const out = applyEdits(text, moveMarkerToPhrase(text, parse, 1));
    expect(out).toContain('Now 25 feet[^rc-1] is early, marker later in line.');
    expect(parseReviewComments(out).comments[0].state).toBe('ok');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/operations.test.ts`
Expected: FAIL — `reanchor` is not exported.

- [ ] **Step 3: Implement in `src/core/operations.ts`**

Append:

```ts
export function reanchor(
  text: string,
  parse: ParseResult,
  id: number,
  selStart: number,
  selEnd: number
): TextEdit[] {
  const c = parse.comments.find((c) => c.id === id);
  if (!c || selEnd <= selStart) return [];
  const phrase = text.slice(selStart, selEnd);
  return [
    spanEdit(c.marker),
    { start: selEnd, end: selEnd, newText: `[^rc-${id}]` },
    {
      start: c.def.start,
      end: defFirstLineEnd(text, c.def),
      newText: buildDefFirstLine(id, c.status, phrase, c.text.split('\n')[0]),
    },
  ];
}

export function convertToBlock(text: string, parse: ParseResult, id: number): TextEdit[] {
  const c = parse.comments.find((c) => c.id === id);
  if (!c || c.anchorPhrase === undefined) return [];
  return [
    {
      start: c.def.start,
      end: defFirstLineEnd(text, c.def),
      newText: buildDefFirstLine(id, c.status, undefined, c.text.split('\n')[0]),
    },
  ];
}

export function moveMarkerToPhrase(text: string, parse: ParseResult, id: number): TextEdit[] {
  const c = parse.comments.find((c) => c.id === id);
  if (!c || c.state !== 'moved' || !c.anchorRange) return [];
  return [
    spanEdit(c.marker),
    { start: c.anchorRange.end, end: c.anchorRange.end, newText: `[^rc-${id}]` },
  ];
}
```

- [ ] **Step 4: Run all core tests**

Run: `npx vitest run`
Expected: PASS (parser + operations suites).

- [ ] **Step 5: Commit**

```bash
git add src/core/operations.ts src/core/operations.test.ts
git commit -m "feat: reanchor, convertToBlock, moveMarkerToPhrase recovery operations"
```

---

### Task 8: Commands + manifest contributions

**Files:**
- Create: `src/editor/commands.ts`
- Modify: `src/extension.ts`, `package.json`

- [ ] **Step 1: Write `src/editor/commands.ts`**

```ts
import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import * as ops from '../core/operations';
import { ParseResult, ReviewComment, TextEdit } from '../core/types';

export async function applyTextEdits(
  editor: vscode.TextEditor,
  edits: TextEdit[]
): Promise<boolean> {
  if (edits.length === 0) return false;
  const doc = editor.document;
  return editor.edit((eb) => {
    for (const e of edits) {
      eb.replace(new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.newText);
    }
  });
}

export function activeMarkdownEditor(): vscode.TextEditor | undefined {
  const ed = vscode.window.activeTextEditor;
  return ed && ed.document.languageId === 'markdown' ? ed : undefined;
}

/** Find the comment whose marker, anchor, or definition contains the offset. */
export function commentAt(parse: ParseResult, offset: number): ReviewComment | undefined {
  return parse.comments.find(
    (c) =>
      (offset >= c.marker.start && offset <= c.marker.end) ||
      (c.anchorRange && offset >= c.anchorRange.start && offset <= c.anchorRange.end) ||
      (offset >= c.def.start && offset <= c.def.end)
  );
}

function resolveComment(
  editor: vscode.TextEditor,
  parse: ParseResult,
  id?: number
): ReviewComment | undefined {
  if (id !== undefined) return parse.comments.find((c) => c.id === id);
  return commentAt(parse, editor.document.offsetAt(editor.selection.active));
}

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('mdReview.addComment', async () => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const commentText = await vscode.window.showInputBox({
        prompt: 'Review comment',
        placeHolder: 'e.g. This contradicts section 4.2',
      });
      if (!commentText) return;
      const doc = editor.document;
      const text = doc.getText();
      const { edits } = ops.insertComment(
        text,
        parseReviewComments(text),
        doc.offsetAt(editor.selection.start),
        doc.offsetAt(editor.selection.end),
        commentText
      );
      await applyTextEdits(editor, edits);
    }),

    vscode.commands.registerCommand('mdReview.editComment', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      const parse = parseReviewComments(text);
      const c = resolveComment(editor, parse, id);
      if (!c) {
        vscode.window.showInformationMessage('No review comment at cursor.');
        return;
      }
      const newText = await vscode.window.showInputBox({
        prompt: `Edit review comment rc-${c.id}`,
        value: c.text.split('\n')[0],
      });
      if (newText === undefined) return;
      await applyTextEdits(editor, ops.editComment(text, parse, c.id, newText));
    }),

    vscode.commands.registerCommand('mdReview.removeComment', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      const parse = parseReviewComments(text);
      const target =
        id ?? resolveComment(editor, parse)?.id;
      if (target === undefined) {
        vscode.window.showInformationMessage('No review comment at cursor.');
        return;
      }
      await applyTextEdits(editor, ops.removeComment(text, parse, target));
    }),

    vscode.commands.registerCommand('mdReview.goToDefinition', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const parse = parseReviewComments(editor.document.getText());
      const c = resolveComment(editor, parse, id);
      if (!c) return;
      const pos = editor.document.positionAt(c.def.start);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }),

    vscode.commands.registerCommand('mdReview.stripAll', async () => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const parse = parseReviewComments(editor.document.getText());
      const edits = ops.stripAll(parse);
      if (edits.length === 0) {
        vscode.window.showInformationMessage('No review comments to strip.');
        return;
      }
      await applyTextEdits(editor, edits);
      const n =
        parse.comments.length + parse.orphanedDefs.length + parse.danglingMarkers.length;
      vscode.window.showInformationMessage(`Stripped ${n} review comment(s).`);
    })
  );
}
```

- [ ] **Step 2: Wire into `src/extension.ts`**

Replace the file contents:

```ts
import * as vscode from 'vscode';
import { registerCommands } from './editor/commands';

export function activate(context: vscode.ExtensionContext) {
  registerCommands(context);
}

export function deactivate() {}
```

- [ ] **Step 3: Add contributions to `package.json`**

Replace the `"contributes": {}` entry with:

```json
"contributes": {
    "commands": [
      { "command": "mdReview.addComment", "title": "Add Review Comment", "category": "MD Review" },
      { "command": "mdReview.editComment", "title": "Edit Review Comment", "category": "MD Review" },
      { "command": "mdReview.removeComment", "title": "Remove Review Comment", "category": "MD Review" },
      { "command": "mdReview.goToDefinition", "title": "Go to Review Comment Definition", "category": "MD Review" },
      { "command": "mdReview.stripAll", "title": "Strip All Review Comments", "category": "MD Review" }
    ],
    "menus": {
      "editor/context": [
        { "command": "mdReview.addComment", "when": "resourceLangId == markdown", "group": "1_modification@9" }
      ],
      "commandPalette": [
        { "command": "mdReview.addComment", "when": "editorLangId == markdown" },
        { "command": "mdReview.editComment", "when": "editorLangId == markdown" },
        { "command": "mdReview.removeComment", "when": "editorLangId == markdown" },
        { "command": "mdReview.goToDefinition", "when": "editorLangId == markdown" },
        { "command": "mdReview.stripAll", "when": "editorLangId == markdown" }
      ]
    },
    "keybindings": [
      {
        "command": "mdReview.addComment",
        "key": "ctrl+alt+m",
        "mac": "cmd+alt+m",
        "when": "editorTextFocus && editorLangId == markdown"
      }
    ]
  }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success, no TypeScript/esbuild errors.

- [ ] **Step 5: Manual verification (F5)**

Open the project in VSCode, press F5 (launches Extension Development Host). In the host window create a scratch `test.md` with a paragraph of text, then verify:
1. Select a phrase → `cmd+alt+m` → type a comment → Enter → marker `[^rc-1]` appears after selection, definition with `💬 ("…")` appears at EOF.
2. Cursor in a paragraph with no selection → right-click → "Add Review Comment" → marker at end of block, definition without quoted phrase.
3. Command palette → "MD Review: Strip All Review Comments" → both removed; single ⌘Z restores them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add/edit/remove/goto/strip commands with keybinding and context menu"
```

---

### Task 9: Decorations + document-change wiring

**Files:**
- Create: `src/editor/decorations.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Write `src/editor/decorations.ts`**

```ts
import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { Span } from '../core/types';

export class DecorationManager {
  private anchor = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  });
  private staleMarker = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline dashed',
  });
  private marker = vscode.window.createTextEditorDecorationType({
    opacity: '0.5',
  });

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(this.anchor, this.staleMarker, this.marker);
  }

  refresh(doc: vscode.TextDocument) {
    const parse = parseReviewComments(doc.getText());
    const toRange = (s: Span) =>
      new vscode.Range(doc.positionAt(s.start), doc.positionAt(s.end));
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document !== doc) continue;
      editor.setDecorations(
        this.anchor,
        parse.comments.filter((c) => c.anchorRange).map((c) => toRange(c.anchorRange!))
      );
      editor.setDecorations(
        this.staleMarker,
        parse.comments.filter((c) => c.state === 'stale').map((c) => toRange(c.marker))
      );
      editor.setDecorations(this.marker, [
        ...parse.comments.map((c) => toRange(c.marker)),
        ...parse.danglingMarkers.map((d) => toRange(d.marker)),
      ]);
    }
  }
}
```

- [ ] **Step 2: Wire refresh loop in `src/extension.ts`**

Replace the file contents:

```ts
import * as vscode from 'vscode';
import { registerCommands } from './editor/commands';
import { DecorationManager } from './editor/decorations';

export function activate(context: vscode.ExtensionContext) {
  registerCommands(context);
  const decorations = new DecorationManager(context);

  const refresh = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'markdown') return;
    decorations.refresh(doc);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const refreshSoon = (doc: vscode.TextDocument) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => refresh(doc), 200);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.window.onDidChangeActiveTextEditor((ed) => ed && refresh(ed.document)),
    vscode.workspace.onDidOpenTextDocument(refresh)
  );
  if (vscode.window.activeTextEditor) refresh(vscode.window.activeTextEditor.document);
}

export function deactivate() {}
```

- [ ] **Step 3: Build and verify manually**

Run: `npm run build`, then F5. In a markdown file with comments verify: anchored phrase has a highlight tint, `[^rc-N]` markers render dimmed, editing the anchored phrase (making it stale) switches the marker to a dashed underline within ~200ms.

- [ ] **Step 4: Commit**

```bash
git add src/editor/decorations.ts src/extension.ts
git commit -m "feat: editor decorations for anchors, markers, and stale comments"
```

---

### Task 10: Hover provider

**Files:**
- Create: `src/editor/hover.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Write `src/editor/hover.ts`**

```ts
import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { commentAt } from './commands';

export function registerHover(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'markdown' },
      {
        provideHover(doc, position) {
          const parse = parseReviewComments(doc.getText());
          const c = commentAt(parse, doc.offsetAt(position));
          if (!c) return undefined;
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          const arg = encodeURIComponent(JSON.stringify([c.id]));
          const stale = c.state === 'stale' ? ' · ⚠ stale anchor' : '';
          md.appendMarkdown(
            `💬 **rc-${c.id}**${c.status ? ` · ${c.status}` : ''}${stale}\n\n`
          );
          if (c.anchorPhrase) md.appendMarkdown(`> "${c.anchorPhrase}"\n\n`);
          md.appendMarkdown(`${c.text}\n\n`);
          for (const r of c.replies) md.appendMarkdown(`↩ ${r}\n\n`);
          md.appendMarkdown(
            `[Edit](command:mdReview.editComment?${arg}) · ` +
              `[Remove](command:mdReview.removeComment?${arg}) · ` +
              `[Go to definition](command:mdReview.goToDefinition?${arg})`
          );
          return new vscode.Hover(md);
        },
      }
    )
  );
}
```

- [ ] **Step 2: Register in `src/extension.ts`**

Add the import and call inside `activate`, after `registerCommands(context);`:

```ts
import { registerHover } from './editor/hover';
// …in activate():
registerHover(context);
```

- [ ] **Step 3: Build and verify manually**

Run: `npm run build`, then F5. Hover over a marker, an anchored phrase, and a definition line. Verify the card shows id/status/snapshot/text/replies and the **Edit**, **Remove**, **Go to definition** links work.

- [ ] **Step 4: Commit**

```bash
git add src/editor/hover.ts src/extension.ts
git commit -m "feat: hover card with edit/remove/goto links"
```

---

### Task 11: Diagnostics + code actions + recovery commands

**Files:**
- Create: `src/editor/diagnostics.ts`, `src/editor/codeActions.ts`
- Modify: `src/editor/commands.ts`, `src/extension.ts`

- [ ] **Step 1: Write `src/editor/diagnostics.ts`**

```ts
import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { Span } from '../core/types';

export class DiagnosticsManager {
  private collection = vscode.languages.createDiagnosticCollection('mdReview');

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(this.collection);
  }

  refresh(doc: vscode.TextDocument) {
    const parse = parseReviewComments(doc.getText());
    const toRange = (s: Span) =>
      new vscode.Range(doc.positionAt(s.start), doc.positionAt(s.end));
    const diags: vscode.Diagnostic[] = [];

    for (const c of parse.comments) {
      if (c.state !== 'stale') continue;
      const d = new vscode.Diagnostic(
        toRange(c.marker),
        `Review comment rc-${c.id} anchor is stale: "${c.anchorPhrase}" no longer matches the text.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-stale';
      diags.push(d);
    }
    for (const o of parse.orphanedDefs) {
      const d = new vscode.Diagnostic(
        toRange(o.def),
        `Orphaned review comment rc-${o.id}: its [^rc-${o.id}] marker is gone.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-orphan';
      diags.push(d);
    }
    for (const m of parse.danglingMarkers) {
      const d = new vscode.Diagnostic(
        toRange(m.marker),
        `Dangling review marker rc-${m.id}: no matching definition.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-dangling';
      diags.push(d);
    }
    this.collection.set(doc.uri, diags);
  }
}
```

- [ ] **Step 2: Write `src/editor/codeActions.ts`**

```ts
import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { commentAt } from './commands';

function cmdAction(title: string, command: string, args: unknown[]): vscode.CodeAction {
  const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  a.command = { title, command, arguments: args };
  return a;
}

class RcActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(doc: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const parse = parseReviewComments(doc.getText());
    const offset = doc.offsetAt(range.start);
    const actions: vscode.CodeAction[] = [];

    const c = commentAt(parse, offset);
    if (c) {
      actions.push(cmdAction(`Edit review comment rc-${c.id}`, 'mdReview.editComment', [c.id]));
      actions.push(
        cmdAction(`Remove review comment rc-${c.id}`, 'mdReview.removeComment', [c.id])
      );
      if (c.state === 'stale') {
        actions.push(
          cmdAction('Re-anchor review comment to selection', 'mdReview.reanchor', [c.id]),
          cmdAction('Convert review comment to block comment', 'mdReview.convertToBlock', [c.id])
        );
      }
      if (c.state === 'moved') {
        actions.push(cmdAction('Move marker next to phrase', 'mdReview.moveMarker', [c.id]));
      }
    }
    const dangling = parse.danglingMarkers.find(
      (d) => offset >= d.marker.start && offset <= d.marker.end
    );
    if (dangling) {
      actions.push(
        cmdAction(`Remove dangling marker rc-${dangling.id}`, 'mdReview.removeComment', [
          dangling.id,
        ])
      );
    }
    const orphan = parse.orphanedDefs.find(
      (o) => offset >= o.def.start && offset <= o.def.end
    );
    if (orphan) {
      actions.push(
        cmdAction(`Remove orphaned comment rc-${orphan.id}`, 'mdReview.removeComment', [
          orphan.id,
        ])
      );
    }
    return actions;
  }
}

export function registerCodeActions(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, new RcActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    })
  );
}
```

- [ ] **Step 3: Add recovery commands to `src/editor/commands.ts`**

Inside `registerCommands`, append to the `context.subscriptions.push(…)` list:

```ts
    vscode.commands.registerCommand('mdReview.reanchor', async (id: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      if (editor.selection.isEmpty) {
        vscode.window.showInformationMessage(
          'Select the new anchor text first, then run Re-anchor.'
        );
        return;
      }
      const doc = editor.document;
      const text = doc.getText();
      await applyTextEdits(
        editor,
        ops.reanchor(
          text,
          parseReviewComments(text),
          id,
          doc.offsetAt(editor.selection.start),
          doc.offsetAt(editor.selection.end)
        )
      );
    }),

    vscode.commands.registerCommand('mdReview.convertToBlock', async (id: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      await applyTextEdits(editor, ops.convertToBlock(text, parseReviewComments(text), id));
    }),

    vscode.commands.registerCommand('mdReview.moveMarker', async (id: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      await applyTextEdits(editor, ops.moveMarkerToPhrase(text, parseReviewComments(text), id));
    })
```

- [ ] **Step 4: Register in `src/extension.ts`**

Add imports and wire into `activate` and the `refresh` function:

```ts
import { DiagnosticsManager } from './editor/diagnostics';
import { registerCodeActions } from './editor/codeActions';
// …in activate():
const diagnostics = new DiagnosticsManager(context);
registerCodeActions(context);
// …and extend refresh():
const refresh = (doc: vscode.TextDocument) => {
  if (doc.languageId !== 'markdown') return;
  decorations.refresh(doc);
  diagnostics.refresh(doc);
};
```

- [ ] **Step 5: Build and verify manually**

Run: `npm run build`, then F5. In a test file:
1. Edit an anchored phrase so it no longer matches → warning squiggle on the marker; `cmd+.` offers Re-anchor / Convert to block; both work.
2. Delete a marker → orphan warning on the definition; quick fix removes it.
3. Delete a definition → dangling warning on the marker; quick fix removes it.

- [ ] **Step 6: Commit**

```bash
git add src/editor src/extension.ts
git commit -m "feat: diagnostics and quick fixes for stale/orphaned/dangling comments"
```

---

### Task 12: markdown-it preview plugin

**Files:**
- Create: `src/preview/markdownItPlugin.ts`
- Test: `src/preview/markdownItPlugin.test.ts`

- [ ] **Step 1: Write failing tests**

`src/preview/markdownItPlugin.test.ts`:

```ts
import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { reviewCommentsPlugin } from './markdownItPlugin';

const md = new MarkdownIt().use(reviewCommentsPlugin);

describe('reviewCommentsPlugin', () => {
  test('renders highlighted anchor, ref, and gutter note; hides definition', () => {
    const html = md.render(
      'The fee is 25 feet[^rc-1] today.\n\n[^rc-1]: 💬 ("25 feet") Check this.\n'
    );
    expect(html).toContain('<span class="rc-anchor">25 feet</span>');
    expect(html).toContain('rc-note');
    expect(html).toContain('Check this.');
    expect(html).not.toContain('[^rc-1]');
  });

  test('block comment renders note without anchor span', () => {
    const html = md.render('A paragraph.[^rc-2]\n\n[^rc-2]: 💬 (done) Rewrite.\n');
    expect(html).not.toContain('rc-anchor');
    expect(html).toContain('Rewrite.');
    expect(html).toContain('done');
  });

  test('stale comment shows warning and original snapshot', () => {
    const html = md.render('Different text now[^rc-1] here.\n\n[^rc-1]: 💬 ("old words") note\n');
    expect(html).toContain('rc-stale');
    expect(html).toContain('old words');
  });

  test('replies render in the note', () => {
    const html = md.render(
      'Text[^rc-1] here.\n\n[^rc-1]: 💬 first\n    ↩ AI: done\n'
    );
    expect(html).toContain('rc-note-reply');
    expect(html).toContain('AI: done');
  });

  test('escapes HTML in comment text', () => {
    const html = md.render('Text[^rc-1] here.\n\n[^rc-1]: 💬 use <b>bold</b>\n');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toContain('<b>bold</b>');
  });

  test('regular markdown is unaffected', () => {
    const html = md.render('# Title\n\nplain *em* text\n');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<em>em</em>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/preview/markdownItPlugin.test.ts`
Expected: FAIL — cannot resolve `./markdownItPlugin`.

- [ ] **Step 3: Write `src/preview/markdownItPlugin.ts`**

```ts
import type MarkdownIt from 'markdown-it';
import { parseReviewComments } from '../core/parser';
import { ReviewComment } from '../core/types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function reviewCommentsPlugin(md: MarkdownIt) {
  // Collect comments from the raw source, then blank out definition blocks so
  // they never reach the block parser (and thus never render at the bottom).
  md.core.ruler.after('normalize', 'rc_collect', (state: any) => {
    const parse = parseReviewComments(state.src);
    state.env.rcComments = new Map<number, ReviewComment>(
      parse.comments.map((c) => [c.id, c])
    );
    const spans = [
      ...parse.comments.map((c) => c.def),
      ...parse.orphanedDefs.map((o) => o.def),
    ].sort((a, b) => b.start - a.start);
    let src: string = state.src;
    for (const s of spans) src = src.slice(0, s.start) + src.slice(s.end);
    state.src = src;
  });

  // Inline rule: consume [^rc-N], wrap the preceding anchor phrase, emit the note.
  md.inline.ruler.before('link', 'rc_ref', (state: any, silent: boolean) => {
    const m = /^\[\^rc-(\d+)\]/.exec(state.src.slice(state.pos));
    if (!m) return false;
    if (!silent) {
      const id = parseInt(m[1], 10);
      const comment: ReviewComment | undefined = state.env.rcComments?.get(id);
      if (comment?.anchorPhrase && state.pending.endsWith(comment.anchorPhrase)) {
        state.pending = state.pending.slice(
          0,
          state.pending.length - comment.anchorPhrase.length
        );
        state.push('rc_anchor_open', 'span', 1);
        const t = state.push('text', '', 0);
        t.content = comment.anchorPhrase;
        state.push('rc_anchor_close', 'span', -1);
      }
      const ref = state.push('rc_ref', 'sup', 0);
      ref.meta = { id, comment };
    }
    state.pos += m[0].length;
    return true;
  });

  md.renderer.rules.rc_anchor_open = () => '<span class="rc-anchor">';
  md.renderer.rules.rc_anchor_close = () => '</span>';
  md.renderer.rules.rc_ref = (tokens: any[], idx: number) => {
    const { id, comment } = tokens[idx].meta as {
      id: number;
      comment?: ReviewComment;
    };
    if (!comment) return `<sup class="rc-ref">💬rc-${id}?</sup>`;
    const stale = comment.state === 'stale';
    let note = `<span class="rc-note${stale ? ' rc-stale' : ''}" data-line="${comment.defLine}">`;
    note += `<span class="rc-note-id">💬 rc-${id}`;
    if (comment.status) note += ` · ${esc(comment.status)}`;
    if (stale) note += ' · ⚠ stale';
    note += '</span>';
    if (stale && comment.anchorPhrase) {
      note += `<span class="rc-note-was">was: “${esc(comment.anchorPhrase)}”</span>`;
    }
    note += `<span class="rc-note-text">${esc(comment.text)}</span>`;
    for (const r of comment.replies) {
      note += `<span class="rc-note-reply">↩ ${esc(r)}</span>`;
    }
    note += '</span>';
    return `<sup class="rc-ref">💬</sup>${note}`;
  };
}
```

Implementation notes for the engineer:
- `state.push` on `StateInline` automatically flushes `state.pending` into a text token first — that's why trimming the phrase off `pending` before pushing `rc_anchor_open` correctly splits the text.
- Everything is `<span>`, never `<aside>`/`<div>`: the note sits inside a `<p>`, and block elements inside paragraphs get re-parented by the HTML parser, which would break the float layout.
- `data-line` points at the definition's original line so the preview's built-in double-click-to-source jumps near the definition.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/preview/markdownItPlugin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preview
git commit -m "feat: markdown-it plugin rendering rc comments as anchors and gutter notes"
```

---

### Task 13: Preview CSS, wiring, fixture, README, final verification

**Files:**
- Create: `media/preview.css`, `fixtures/sample-review.md`, `README.md`
- Modify: `src/extension.ts`, `package.json`

- [ ] **Step 1: Write `media/preview.css`**

```css
:root {
  --rc-note-width: 220px;
  --rc-accent: #e0a800;
  --rc-stale-accent: #d9534f;
}

.rc-anchor {
  background: rgba(255, 213, 79, 0.35);
  border-radius: 2px;
}

.rc-ref {
  color: var(--rc-accent);
  font-size: 0.8em;
  user-select: none;
}

.rc-note {
  display: block;
  font-size: 0.82em;
  line-height: 1.35;
  border-left: 3px solid var(--rc-accent);
  background: rgba(128, 128, 128, 0.08);
  border-radius: 4px;
  padding: 6px 8px;
  margin: 6px 0;
}

.rc-note.rc-stale {
  border-left-color: var(--rc-stale-accent);
}

.rc-note > span {
  display: block;
}

.rc-note-id {
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 2px;
}

.rc-note-was {
  font-style: italic;
  opacity: 0.7;
}

.rc-note-reply {
  margin-top: 4px;
  opacity: 0.9;
}

/* Wide panes: float notes into a right gutter, Google-Docs style. */
@media (min-width: 960px) {
  body {
    padding-right: calc(var(--rc-note-width) + 40px);
  }
  .rc-note {
    float: right;
    clear: right;
    width: var(--rc-note-width);
    margin: 0 calc(-1 * (var(--rc-note-width) + 28px)) 8px 0;
  }
}
```

- [ ] **Step 2: Wire preview into `src/extension.ts` and `package.json`**

In `src/extension.ts`, add the import and make `activate` return the markdown-it hook (final shape of the function):

```ts
import { reviewCommentsPlugin } from './preview/markdownItPlugin';
// …at the end of activate():
return {
  extendMarkdownIt(md: any) {
    return md.use(reviewCommentsPlugin);
  },
};
```

In `package.json`, add to `"contributes"`:

```json
"markdown.markdownItPlugins": true,
"markdown.previewStyles": ["./media/preview.css"]
```

- [ ] **Step 3: Write `fixtures/sample-review.md`**

```markdown
# Zoning Summary (fixture)

The minimum setback requirement is 25 feet[^rc-1] for all residential zones,
measured from the property line to the nearest wall.

Accessory structures such as sheds and detached garages may be located in the
rear yard only, and shall not exceed fifteen feet in height.[^rc-2]

The original text said something different here[^rc-3] before edits.

A dangling marker example[^rc-9] sits in this sentence.

Regular footnotes are untouched[^1].

[^rc-1]: 💬 ("25 feet") This contradicts section 4.2 — verify against the PDF.
    ↩ AI: done — section 4.2 was the stale one.
[^rc-2]: 💬 (open) Height limit seems low; check the 2024 amendment.
[^rc-3]: 💬 ("completely different words") Stale anchor demo — original phrase is gone.
[^rc-4]: 💬 Orphaned definition demo — its marker was deleted.
[^1]: A normal footnote that md-review must ignore.
```

- [ ] **Step 4: Write `README.md`**

```markdown
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
```

- [ ] **Step 5: Build and run full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all vitest suites pass.

- [ ] **Step 6: Final manual verification (F5)**

Open `fixtures/sample-review.md` in the Extension Development Host, open preview to the side (`cmd+k v`), verify:
1. Wide pane: notes float in a right gutter beside their paragraphs; narrow pane: notes appear inline as callouts.
2. `25 feet` is highlighted; rc-1's note shows the reply line.
3. rc-3's note shows ⚠ stale with "was: …" snapshot.
4. Footnote definitions for `rc-*` are absent from the preview body; `[^1]` regular footnote is untouched (renders as literal text in the built-in preview, which is its normal behavior).
5. In the editor: hover cards, quick fixes on rc-3 (stale), rc-4 (orphan), rc-9 (dangling) all work.
6. Strip All removes every `rc-` comment but leaves `[^1]` intact; one undo restores.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: preview gutter styles, fixture, and README"
```
