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
