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

  test('moved comment highlights phrase at its found location', () => {
    const html = md.render(
      'Now 25 feet is early, marker later[^rc-1] in line.\n\n[^rc-1]: 💬 ("25 feet") check\n'
    );
    expect(html).toContain('<span class="rc-anchor">25 feet</span>');
    expect(html).toContain('rc-note');
  });

  test('multi-line comment text renders newlines as <br>', () => {
    const html = md.render(
      'Text[^rc-1] here.\n\n[^rc-1]: 💬 first line\n    second line\n'
    );
    expect(html).toContain('first line<br>second line');
  });

  test('regular markdown is unaffected', () => {
    const html = md.render('# Title\n\nplain *em* text\n');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<em>em</em>');
  });
});
