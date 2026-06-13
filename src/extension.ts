import * as vscode from 'vscode';
import { registerCommands } from './editor/commands';

export function activate(context: vscode.ExtensionContext) {
  registerCommands(context);
}

export function deactivate() {}
