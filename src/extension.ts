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
    panel.webview.html = getContent(context, panel, defaultConfig, defaultExecutionTime, perfModel);
}

function getContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, defaultConfig: string[], defaultExecutionTime: string, perfModel: string[]) {
//     // // Local path to main script run in the webview
//     const scriptPathOnDisk = vscode.Uri.file(path.join(context.extensionPath, 'media', 'somethingZ.js'));
//     // // And the uri we use to load this script in the webview
//     const scriptUri = panel.webview.asWebviewUri(scriptPathOnDisk);
//
//     // // Local path to css styles
//     // const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
//     // // const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');
//     // // Uri to load styles into webview
//     // const stylesResetUri = webview.asWebviewUri(styleResetPath);
//     // // const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
//
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
// </head>
// <body>
//     <script src="${scriptUri}"></script>
//     <div id="example-table"></div>
//     <div>Default execution time: ${defaultExecutionTime}</div>
//     <div>${perfModel}</div>
// </body>
// </html>`;

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
        <div id="players"></div>
        <script type="text/javascript">        
            var tabledata = [{
                playerid: 1,
                playername: "Virat Kohli",
                price: "17",
                team: "RCB",
                joiningdate: "01/01/2020"
            }, {
                playerid: 2,
                playername: "Rohit Sharma",
                price: "15",
                team: "MI",
                joiningdate: "02/01/2020"
            }, {
                playerid: 3,
                playername: "MS Dhoni",
                price: "15",
                team: "CSK",
                joiningdate: "03/01/2020"
            }, {
                playerid: 4,
                playername: "Shreyas Iyer",
                price: "7",
                team: "RCB",
                joiningdate: "04/01/2020"
            }, {
                playerid: 5,
                playername: "KL Rahul",
                price: "11",
                team: "KXIP",
                joiningdate: "05/01/2020"
            }, {
                playerid: 6,
                playername: "Dinesh Karthik",
                price: "7",
                team: "KKR",
                joiningdate: "06/01/2020"
            }, {
                playerid: 7,
                playername: "Steve Smith",
                price: "12",
                team: "RR",
                joiningdate: "07/01/2020"
            }, {
                playerid: 8,
                playername: "David Warner",
                price: "12",
                team: "SRH",
                joiningdate: "08/01/2020"
            }, {
                playerid: 9,
                playername: "Kane Williamson",
                price: "3",
                team: "SRH",
                joiningdate: "09/01/2020"
            }, {
                playerid: 10,
                playername: "Jofra Archer",
                price: "7",
                team: "RR",
                joiningdate: "10/01/2020"
            }, {
                playerid: 11,
                playername: "Andre Russell",
                price: "9",
                team: "KKR",
                joiningdate: "11/01/2020"
            }, {
                playerid: 12,
                playername: "Chris Gayle",
                price: "2",
                team: "KXIP",
                joiningdate: "12/01/2020"
            },
        
            ];
            
            var table = new Tabulator("#players", {
                height: 220,
                data: tabledata,
                layout: "fitColumns",
                tooltips: true,
                columns: [{
                    title: "Player Name",
                    field: "playername",
                    sorter: "string",
                    width: 150,
                    headerFilter: "input"
                }, {
                    title: "Player Price",
                    field: "price",
                    sorter: "number",
                    hozAlign: "left",
                    formatter: "progress",
                },
        
                {
                    title: "Team",
                    field: "team",
                    sorter: "string",
                    hozAlign: "center",
                    editor: "select",
                    headerFilter: true,
                    headerFilterParams: {
                        "RCB": "RCB",
                        "MI": "MI",
                        "KKR": "KKR",
                    }
                }, {
                    title: "Joining Date",
                    field: "joiningdate",
                    sorter: "date",
                    hozAlign: "center"
                },
                ],
                rowClick: function(e, row) {
                    alert("Row " + row.getData().playerid + " Clicked!!!!");
                },
            });
            
        </script>
    </body>

    </html>`;
}
