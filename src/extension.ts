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
    let globalModel = vscode.commands.registerCommand('globalModel.start', _globalModel);
    let localModels = vscode.commands.registerCommand('localModels.start', () => _localModels(context));
    context.subscriptions.push(globalModel, localModels);
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension "perf-debug"');
}

function _localModels(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'localModels', // Identifies the type of the webview. Used internally
        'Local Models', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
            enableScripts: true
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const methods2DefaultExecutionTimes = getMethods2DefaultExecutionTimes(dataDir);
    panel.webview.postMessage({methods2DefaultExecutionTimes: methods2DefaultExecutionTimes});
    panel.webview.html = getLocalModelsContent(context, panel);
}

function getMethods2DefaultExecutionTimes(dataDir: string) {
    let method2DefaultExecutionTimes: Method2DefaultExecutionTime[] = [];
    parse(fs.readFileSync(path.join(dataDir, 'methods.csv'), 'utf8')).forEach((entry: string) => {
        method2DefaultExecutionTimes.push({method: entry[0], defaultExecutionTime: entry[1]});
    });
    return method2DefaultExecutionTimes;
}

function _globalModel() {
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
    panel.webview.html = getGlobalModelContent(defaultConfig, defaultExecutionTime, perfModel);
}

function getLocalModelsContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
    const localModelsScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'localModels.js'));
    const localModelsScript = panel.webview.asWebviewUri(localModelsScriptPath);

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
        <div>
            <label for="methodSelect">Select a method to display its performance model:</label>
            <select name="methodSelect" id="methodSelect"></select>     
        </div>
        <div><button id="local-model-trigger">Get Performance Model</button></div>
        <br>
        <div id="methodName"></div>
        <br>
        <div id="defaultExecutionTime"></div>
        <br>
        <div id="example-table"></div>
        <script src="${localModelsScript}"></script>
    </body>
    </html>`;
}

function getGlobalModelContent(rawDefaultConfig: string[], defaultExecutionTime: string, rawPerfModel: string[]) {
    const defaultConfig = getDefaultConfig(rawDefaultConfig);
    const perfModel = getPerfModel(rawPerfModel);

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
            const defaultConfigData = [${defaultConfig}];        
            const defaultConfigTable = new Tabulator("#defaultConfig", {
                data: defaultConfigData,
                layout: "fitColumns",
                columns: [
                    {
                        title: "Default Configuration",
                        columns: [
                            { title: "Option", field: "option", sorter: "string" }, 
                            { title: "Value",  field: "value",  sorter: "string" }
                        ],
                    },
                ],
            });
        </script>
        <br>
        <div id="defaultExecutionTime">Default execution time: ${defaultExecutionTime}</div>
        <br>
        <div id="perfModel"></div>
        <script type="text/javascript">     
            const perfModelData = [${perfModel}];        
            const perfModelTable = new Tabulator("#perfModel", {
                data: perfModelData,
                layout: "fitColumns",
                columns: [
                    {
                        title: "Performance Model",
                        columns: [
                            { title: "Option", field: "option", sorter: "string" }, 
                            { title: "Value",  field: "value",  sorter: "string" },
                            { title: "Execution Time (s)",  field: "time",  sorter: "number", hozAlign:"right" }
                        ],
                    },
                ],
            });
        </script>
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

function getPerfModel(rawPerfModel: string[]) {
    let result = "";
    rawPerfModel.forEach((entry) => {
        result = result.concat("{ option: \"");
        result = result.concat(entry[0]);
        result = result.concat("\", value: \"");
        result = result.concat(entry[1]);
        result = result.concat("\", time: ");
        result = result.concat(entry[2]);
        result = result.concat(" }, ");
    });
    return result;
}

interface Method2DefaultExecutionTime {
    method: string
    defaultExecutionTime: string
}