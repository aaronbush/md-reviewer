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
      if (comment?.anchorPhrase) {
        const phraseIdx = state.pending.indexOf(comment.anchorPhrase);
        if (phraseIdx !== -1) {
          const after = state.pending.slice(phraseIdx + comment.anchorPhrase.length);
          state.pending = state.pending.slice(0, phraseIdx);
          state.push('rc_anchor_open', 'span', 1);
          const t = state.push('text', '', 0);
          t.content = comment.anchorPhrase;
          state.push('rc_anchor_close', 'span', -1);
          state.pending = after;
        }
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
      note += `<span class="rc-note-was">was: "${esc(comment.anchorPhrase)}"</span>`;
    }
    note += `<span class="rc-note-text">${esc(comment.text).replace(/\n/g, '<br>')}</span>`;
    for (const r of comment.replies) {
      note += `<span class="rc-note-reply">↩ ${esc(r)}</span>`;
    }
    note += '</span>';
    return `<sup class="rc-ref">💬</sup>${note}`;
  };
}
