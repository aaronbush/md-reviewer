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
