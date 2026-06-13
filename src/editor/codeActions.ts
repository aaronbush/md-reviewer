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
      (o) => offset >= o.def.start && offset < o.def.end
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
