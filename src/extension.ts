import * as vscode from 'vscode';
import { registerCommands } from './editor/commands';
import { DecorationManager } from './editor/decorations';
import { DiagnosticsManager } from './editor/diagnostics';
import { registerHover } from './editor/hover';
import { registerCodeActions } from './editor/codeActions';
import { reviewCommentsPlugin } from './preview/markdownItPlugin';

export function activate(context: vscode.ExtensionContext) {
  registerCommands(context);
  registerHover(context);
  registerCodeActions(context);
  const decorations = new DecorationManager(context);
  const diagnostics = new DiagnosticsManager(context);

  const refresh = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'markdown') return;
    decorations.refresh(doc);
    diagnostics.refresh(doc);
  };

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSoon = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); refresh(doc); }, 200));
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.window.onDidChangeActiveTextEditor((ed) => ed && refresh(ed.document)),
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.clear(doc)),
    new vscode.Disposable(() => timers.forEach(clearTimeout))
  );
  if (vscode.window.activeTextEditor) refresh(vscode.window.activeTextEditor.document);
  return {
    extendMarkdownIt(md: any) {
      return md.use(reviewCommentsPlugin);
    },
  };
}

export function deactivate() {}
