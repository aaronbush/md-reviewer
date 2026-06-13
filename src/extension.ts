import * as vscode from 'vscode';
import { registerCommands } from './editor/commands';
import { DecorationManager } from './editor/decorations';
import { DiagnosticsManager } from './editor/diagnostics';
import { registerHover } from './editor/hover';
import { registerCodeActions } from './editor/codeActions';

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

  let timer: ReturnType<typeof setTimeout> | undefined;
  const refreshSoon = (doc: vscode.TextDocument) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => refresh(doc), 200);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.window.onDidChangeActiveTextEditor((ed) => ed && refresh(ed.document)),
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.clear(doc)),
    new vscode.Disposable(() => timer && clearTimeout(timer))
  );
  if (vscode.window.activeTextEditor) refresh(vscode.window.activeTextEditor.document);
}

export function deactivate() {}
