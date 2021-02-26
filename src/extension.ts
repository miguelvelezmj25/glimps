// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "perf-debug" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let globalModel = vscode.commands.registerCommand('globalModel.start', () => _globalModel(context));
    let localModels = vscode.commands.registerCommand('localModels.start', _localModels);
    context.subscriptions.push(globalModel, localModels);
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension "perf-debug"');
}

function _localModels() {
    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'localModels', // Identifies the type of the webview. Used internally
        'Local Models', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {} // Webview options. More on these later.
    );
}

function _globalModel(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'globalModel', // Identifies the type of the webview. Used internally
        'Global Model', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
            enableScripts: true
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const defaultConfig = parse(fs.readFileSync(path.join(dataDir, 'default.csv'), 'utf8'));
    const defaultExecutionTime = fs.readFileSync(path.join(dataDir, 'default.txt'), 'utf8');
    const perfModel = parse(fs.readFileSync(path.join(dataDir, 'perf-model.csv'), 'utf8'));
    let x = getGlobalModelContent(context, panel, defaultConfig, defaultExecutionTime, perfModel);
    console.log(x);
    panel.webview.html = x;
}

function getGlobalModelContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, rawDefaultConfig: string[], defaultExecutionTime: string, rawPerfModel: string[]) {
    const defaultConfig = getDefaultConfig(rawDefaultConfig);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tabulator Example</title>
        <link href="https://unpkg.com/tabulator-tables@4.8.1/dist/css/tabulator.min.css" rel="stylesheet">
        <script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.8.1/dist/js/tabulator.min.js"></script>
    </head>
    <body>
        <div id="defaultConfig"></div>
        <script type="text/javascript">                   
            var defaultConfigData = [${defaultConfig}];        
            var table = new Tabulator("#defaultConfig", {
                data: defaultConfigData,
                layout: "fitColumns",
                columns: [
                    {
                        title: "Default Configuration",
                        columns: [
                            { title: "Option", field: "option", sorter: "string" }, 
                            { title: "Value",  field: "value",  sorter: "number" }
                        ],
                    },
                ],
            });
        </script>
        <br>
        <div id="defaultExecutionTime">Default execution time: ${defaultExecutionTime}</div>
    </body>

    </html>`;
}

function getDefaultConfig(rawDefaultConfig: string[]) {
    let result = "";
    rawDefaultConfig.forEach((entry) => {
        result = result.concat("{ option: \"");
        result = result.concat(entry[0]);
        result = result.concat("\", value: \"");
        result = result.concat(entry[1]);
        result = result.concat("\" }, ");
    });
    return result;
}

