import { describe, expect, test } from 'vitest';
import { parseReviewComments } from './parser';
import { applyEdits, convertToBlock, editComment, insertComment, moveMarkerToPhrase, nextId, reanchor, removeComment, stripAll } from './operations';

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

  test('replaces all text continuation lines, preserving only replies', () => {
    const text =
      'fee is 25 feet[^rc-1] now\n\n' +
      '[^rc-1]: 💬 (open) ("25 feet") line one\n' +
      '    line two\n' +
      '    ↩ AI: noted\n';
    const out = applyEdits(text, editComment(text, parseReviewComments(text), 1, 'replaced'));
    expect(out).toContain('[^rc-1]: 💬 (open) ("25 feet") replaced\n    ↩ AI: noted\n');
    expect(out).not.toContain('line one');
    expect(out).not.toContain('line two');
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

describe('no-op guards', () => {
  test('operations on unknown id return no edits', () => {
    const text = 'a[^rc-1] b\n\n[^rc-1]: 💬 x\n';
    const parse = parseReviewComments(text);
    expect(editComment(text, parse, 99, 'x')).toEqual([]);
    expect(removeComment(text, parse, 99)).toEqual([]);
    expect(reanchor(text, parse, 99, 0, 1)).toEqual([]);
    expect(convertToBlock(text, parse, 99)).toEqual([]);
    expect(moveMarkerToPhrase(text, parse, 99)).toEqual([]);
  });

  test('reanchor with empty selection or selection of only the marker is a no-op', () => {
    const text = 'fee is thirty feet[^rc-1] now\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const parse = parseReviewComments(text);
    expect(reanchor(text, parse, 1, 5, 5)).toEqual([]);
    const ms = text.indexOf('[^rc-1]');
    expect(reanchor(text, parse, 1, ms, ms + '[^rc-1]'.length)).toEqual([]);
  });

  test('reanchor selection overlapping the marker strips marker syntax from snapshot', () => {
    const text = 'fee is thirty feet[^rc-1] now\n\n[^rc-1]: 💬 ("25 feet") check\n';
    const parse = parseReviewComments(text);
    const selStart = text.indexOf('thirty feet');
    const selEnd = text.indexOf('[^rc-1]') + '[^rc-1]'.length;
    const out = applyEdits(text, reanchor(text, parse, 1, selStart, selEnd));
    expect(out).toContain('("thirty feet")');
    expect(out).not.toContain('("thirty feet[^rc-1]")');
  });
});
