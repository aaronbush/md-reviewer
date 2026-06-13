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
      {
        start: text.length,
        end: text.length,
        newText: `${defPrefix}[^rc-${id}]: 💬${phrasePart} ${commentText}\n`,
      },
      { start: markerPos, end: markerPos, newText: `[^rc-${id}]` },
    ],
  };
}

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

export function removeComment(_text: string, parse: ParseResult, id: number): TextEdit[] {
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

export function reanchor(
  text: string,
  parse: ParseResult,
  id: number,
  selStart: number,
  selEnd: number
): TextEdit[] {
  const c = parse.comments.find((c) => c.id === id);
  if (!c || selEnd <= selStart) return [];
  const phrase = text.slice(selStart, selEnd).replace(/\[\^rc-\d+\]/g, '');
  if (!phrase) return [];
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
