import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { commentAt } from './commands';

function safeMd(s: string): string {
  return s.replace(/[\\`*_{}\[\]()#+\-!<>]/g, (ch) => '\\' + ch);
}

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
            `💬 **rc-${c.id}**${c.status ? ` · ${safeMd(c.status)}` : ''}${stale}\n\n`
          );
          if (c.anchorPhrase) md.appendMarkdown(`> "${safeMd(c.anchorPhrase)}"\n\n`);
          md.appendMarkdown(`${safeMd(c.text)}\n\n`);
          for (const r of c.replies) md.appendMarkdown(`↩ ${safeMd(r)}\n\n`);
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
