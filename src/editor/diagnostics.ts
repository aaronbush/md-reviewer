import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import { Span } from '../core/types';

export class DiagnosticsManager {
  private collection = vscode.languages.createDiagnosticCollection('mdReview');

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(this.collection);
  }

  refresh(doc: vscode.TextDocument) {
    const parse = parseReviewComments(doc.getText());
    const toRange = (s: Span) =>
      new vscode.Range(doc.positionAt(s.start), doc.positionAt(s.end));
    const diags: vscode.Diagnostic[] = [];

    for (const c of parse.comments) {
      if (c.state !== 'stale') continue;
      const d = new vscode.Diagnostic(
        toRange(c.marker),
        `Review comment rc-${c.id} anchor is stale: "${c.anchorPhrase}" no longer matches the text.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-stale';
      diags.push(d);
    }
    for (const o of parse.orphanedDefs) {
      const d = new vscode.Diagnostic(
        toRange(o.def),
        `Orphaned review comment rc-${o.id}: its [^rc-${o.id}] marker is gone.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-orphan';
      diags.push(d);
    }
    for (const m of parse.danglingMarkers) {
      const d = new vscode.Diagnostic(
        toRange(m.marker),
        `Dangling review marker rc-${m.id}: no matching definition.`,
        vscode.DiagnosticSeverity.Warning
      );
      d.code = 'rc-dangling';
      diags.push(d);
    }
    this.collection.set(doc.uri, diags);
  }

  clear(doc: vscode.TextDocument) {
    this.collection.delete(doc.uri);
  }
}
