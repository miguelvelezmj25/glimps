// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "perf-debug" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let globalModel = vscode.commands.registerCommand('globalModel.start', () => {
        // Create and show a new webview
        const panel = vscode.window.createWebviewPanel(
            'globalModel', // Identifies the type of the webview. Used internally
            'Global Model', // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in.
            {} // Webview options. More on these later.
        );
    });
    context.subscriptions.push(globalModel);

    let localModels = vscode.commands.registerCommand('localModels.start', () => {
        // Create and show a new webview
        const panel = vscode.window.createWebviewPanel(
            'localModels', // Identifies the type of the webview. Used internally
            'Local Models', // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in.
            {} // Webview options. More on these later.
        );
    });
    context.subscriptions.push(localModels);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
