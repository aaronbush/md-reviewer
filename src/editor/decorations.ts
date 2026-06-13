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
