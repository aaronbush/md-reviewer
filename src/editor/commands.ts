import * as vscode from 'vscode';
import { parseReviewComments } from '../core/parser';
import * as ops from '../core/operations';
import { ParseResult, ReviewComment, TextEdit } from '../core/types';

export async function applyTextEdits(
  editor: vscode.TextEditor,
  edits: TextEdit[]
): Promise<boolean> {
  if (edits.length === 0) return false;
  const doc = editor.document;
  const ok = await editor.edit((eb) => {
    for (const e of edits) {
      eb.replace(new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.newText);
    }
  });
  if (!ok) {
    vscode.window.showWarningMessage('md-review: edit could not be applied — the document changed. Try again.');
  }
  return ok;
}

export function activeMarkdownEditor(): vscode.TextEditor | undefined {
  const ed = vscode.window.activeTextEditor;
  return ed && ed.document.languageId === 'markdown' ? ed : undefined;
}

/** Find the comment whose marker, anchor, or definition contains the offset.
 * Note: the marker check is intentionally end-inclusive — cursor sitting right after the `]` should still hit. */
export function commentAt(parse: ParseResult, offset: number): ReviewComment | undefined {
  return parse.comments.find(
    (c) =>
      (offset >= c.marker.start && offset <= c.marker.end) ||
      (c.anchorRange && offset >= c.anchorRange.start && offset < c.anchorRange.end) ||
      (offset >= c.def.start && offset < c.def.end)
  );
}

function resolveComment(
  editor: vscode.TextEditor,
  parse: ParseResult,
  id?: number
): ReviewComment | undefined {
  if (id !== undefined) return parse.comments.find((c) => c.id === id);
  return commentAt(parse, editor.document.offsetAt(editor.selection.active));
}

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('mdReview.addComment', async () => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const commentText = await vscode.window.showInputBox({
        prompt: 'Review comment',
        placeHolder: 'e.g. This contradicts section 4.2',
      });
      if (!commentText) return;
      const doc = editor.document;
      const text = doc.getText();
      const { edits } = ops.insertComment(
        text,
        parseReviewComments(text),
        doc.offsetAt(editor.selection.start),
        doc.offsetAt(editor.selection.end),
        commentText
      );
      await applyTextEdits(editor, edits);
    }),

    vscode.commands.registerCommand('mdReview.editComment', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const before = parseReviewComments(editor.document.getText());
      const c = resolveComment(editor, before, id);
      if (!c) {
        vscode.window.showInformationMessage('No review comment at cursor.');
        return;
      }
      const newText = await vscode.window.showInputBox({
        prompt: `Edit review comment rc-${c.id}`,
        value: c.text.split('\n')[0],
      });
      if (newText === undefined) return;
      const text = editor.document.getText();
      const parse = parseReviewComments(text);
      if (!parse.comments.some((x) => x.id === c.id)) {
        vscode.window.showInformationMessage(`Review comment rc-${c.id} no longer exists.`);
        return;
      }
      await applyTextEdits(editor, ops.editComment(text, parse, c.id, newText));
    }),

    vscode.commands.registerCommand('mdReview.removeComment', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      const parse = parseReviewComments(text);
      const target = id ?? resolveComment(editor, parse)?.id;
      if (target === undefined) {
        vscode.window.showInformationMessage('No review comment at cursor.');
        return;
      }
      await applyTextEdits(editor, ops.removeComment(text, parse, target));
    }),

    vscode.commands.registerCommand('mdReview.goToDefinition', async (id?: number) => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const parse = parseReviewComments(editor.document.getText());
      const c = resolveComment(editor, parse, id);
      if (!c) return;
      const pos = editor.document.positionAt(c.def.start);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }),

    vscode.commands.registerCommand('mdReview.stripAll', async () => {
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const parse = parseReviewComments(editor.document.getText());
      const edits = ops.stripAll(parse);
      if (edits.length === 0) {
        vscode.window.showInformationMessage('No review comments to strip.');
        return;
      }
      if (await applyTextEdits(editor, edits)) {
        const n =
          parse.comments.length + parse.orphanedDefs.length + parse.danglingMarkers.length;
        vscode.window.showInformationMessage(`Stripped ${n} review comment(s).`);
      }
    }),

    vscode.commands.registerCommand('mdReview.reanchor', async (id?: number) => {
      if (typeof id !== 'number') return;
      const editor = activeMarkdownEditor();
      if (!editor) return;
      if (editor.selection.isEmpty) {
        vscode.window.showInformationMessage(
          'Select the new anchor text first, then run Re-anchor.'
        );
        return;
      }
      const doc = editor.document;
      const text = doc.getText();
      await applyTextEdits(
        editor,
        ops.reanchor(
          text,
          parseReviewComments(text),
          id,
          doc.offsetAt(editor.selection.start),
          doc.offsetAt(editor.selection.end)
        )
      );
    }),

    vscode.commands.registerCommand('mdReview.convertToBlock', async (id?: number) => {
      if (typeof id !== 'number') return;
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      await applyTextEdits(editor, ops.convertToBlock(text, parseReviewComments(text), id));
    }),

    vscode.commands.registerCommand('mdReview.moveMarker', async (id?: number) => {
      if (typeof id !== 'number') return;
      const editor = activeMarkdownEditor();
      if (!editor) return;
      const text = editor.document.getText();
      await applyTextEdits(editor, ops.moveMarkerToPhrase(text, parseReviewComments(text), id));
    })
  );
}
