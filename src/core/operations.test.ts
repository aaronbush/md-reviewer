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
