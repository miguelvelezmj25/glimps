// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {WorkspaceFolder} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let sourceClass = "";
let sources = new Set<Number>();
let targetClass = "";
let target: number = -1;

const style: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(160,255,200,0.2)'});
let filesToHighlight = new Map<String, Set<String>>();

let slicingPanel: vscode.WebviewPanel | undefined = undefined;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "perf-debug" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const globalModel = vscode.commands.registerCommand('globalModel.start', _globalModel);
    const localModels = vscode.commands.registerCommand('localModels.start', () => _localModels(context));
    const perfProfiles = vscode.commands.registerCommand('perfProfiles.start', () => _perfProfiles(context));
    const slicingSource = vscode.commands.registerCommand('sliceSource.start', () => _sliceSource(context));
    const slicingTarget = vscode.commands.registerCommand('sliceTarget.start', () => _sliceTarget(context));
    const slicing = vscode.commands.registerCommand('slicing.start', () => _slicing(context));
    context.subscriptions.push(globalModel, localModels, perfProfiles, slicingSource, slicingTarget, slicing);
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension "perf-debug"');
    if (style !== undefined) {
        style.dispose();
    }
}

function selectForSlice(workspaceFolders: ReadonlyArray<WorkspaceFolder>) {
    if (!vscode.window.activeTextEditor) {
        vscode.window.showInformationMessage("Open a file first to toggle bookmarks");
        return {};
    }

    if (workspaceFolders.length > 1) {
        vscode.window.showInformationMessage("Workspace folders has more than 1 entry");
        return {};
    }
    const selections = vscode.window.activeTextEditor.selections;
    if (selections.length !== 1) {
        vscode.window.showInformationMessage("Selection has more than one element");
        return {};
    }

    let filePath = vscode.window.activeTextEditor.document.uri.path;
    filePath = filePath.replace(workspaceFolders[0].uri.path, "");
    filePath = filePath.replace("/src/main/java/", "");

    const selection = selections[0];
    const line = selection.start.line + 1;

    return {filePath: filePath, line: line};
}

function _sliceTarget(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    const sliceData = selectForSlice(workspaceFolders);
    if (sliceData.filePath === undefined || sliceData.line === undefined) {
        return;
    }

    targetClass = sliceData.filePath;
    target = sliceData.line;

    if (slicingPanel) {
        slicingPanel.webview.html = getSlicingContent();
    } else {
        _slicing(context);
    }
}

function _sliceSource(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    const sliceData = selectForSlice(workspaceFolders);
    if (sliceData.filePath === undefined || sliceData.line === undefined) {
        return;
    }

    if (sourceClass === "") {
        sourceClass = sliceData.filePath;
    }
    sources.add(sliceData.line);

    if (slicingPanel) {
        slicingPanel.webview.html = getSlicingContent();
    } else {
        _slicing(context);
    }
}

function _slicing(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    slicingPanel = vscode.window.createWebviewPanel(
        'slicing', // Identifies the type of the webview. Used internally
        'Program Slicing', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    slicingPanel.webview.html = getSlicingContent();

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const sliceInfo = getSliceInfo(dataDir);
    const programName = sliceInfo.programName;
    const port = sliceInfo.port;

    // Handle messages from the webview
    slicingPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'clear':
                    if (!slicingPanel) {
                        return;
                    }

                    sourceClass = "";
                    sources = new Set<Number>();
                    targetClass = "";
                    target = -1;
                    slicingPanel.webview.html = getSlicingContent();
                    return;
                case 'slice':
                    if (sourceClass === "" || sources.size === 0 || targetClass === "" || target <= 0) {
                        vscode.window.showErrorMessage("Select sources and targets to slice");
                        return;
                    }
                    const res = request('POST', 'http://localhost:' + port + '/slice',
                        {
                            json: {
                                sourceClass: sourceClass,
                                sourceLines: Array.from(sources.values()),
                                targetClass: targetClass,
                                targetLines: target,
                            }
                        }
                    );
                    const response = JSON.parse(res.getBody() + "");
                    setFilesToHighlight(response.data);
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        let editorPath = vscode.window.activeTextEditor.document.uri.path;
        editorPath = editorPath.replace(workspaceFolders[0].uri.path, "");
        editorPath = editorPath.replace("/src/main/java/", "");
        const lines = filesToHighlight.get(editorPath);
        if (!lines || lines.size === 0) {
            return;
        }

        let ranges: vscode.Range[] = [];
        for (const lineNumber of lines.values()) {
            if (+lineNumber <= 0) {
                continue;
            }
            const line = vscode.window.activeTextEditor.document.lineAt((+lineNumber - 1));
            ranges.push(line.range);
        }
        vscode.window.activeTextEditor.setDecorations(style, ranges);

    }, null, context.subscriptions);
}

function setFilesToHighlight(data: any[]) {
    filesToHighlight.clear();
    data.forEach(function (entry) {
        filesToHighlight.set(entry.file, entry.lines)
    });
}

function getSliceInfo(dataDir: string) {
    const sliceInfo = parse(fs.readFileSync(path.join(dataDir, 'sliceInfo.csv'), 'utf8'))[0];
    return {programName: sliceInfo[0], port: sliceInfo[1]};
}

function getSlicingContent() {
    const sortedSources = Array.from(sources).sort((a, b) => (a > b) ? 1 : -1);
    let sourceList = '<ul><li>Select sources</li></ul>';
    if (sources.size > 0) {
        sourceList = '';
        sortedSources.forEach(function (source) {
            sourceList += '<li>' + sourceClass + ":" + source + '</li>';
        });
        sourceList = '<ul>' + sourceList + '</ul>';
    }

    let targetList = '<ul><li>Select a target</li></ul>';
    if (target > 0) {
        targetList = '<ul><li>' + targetClass + ":" + target + '</li></ul>';
    }

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Program Slicing</title>
    </head>
    <body>
        <div>
            Sources: ${sourceList} 
            Targets: ${targetList} 
        </div>
        <br>
        <div><button id="slice-trigger">Slice</button> <button id="clear-trigger">Clear</button></div>
        <div>TODO USE JAVASCRIPT LIBRARY TO SHOW GRAPH OF SLICE BETWEEN METHODS</div>
        <script type="text/javascript">                                                   
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("clear-trigger").addEventListener("click", function () {                    
                    vscode.postMessage({
                        command: 'clear'
                    });
                });
                
                document.getElementById("slice-trigger").addEventListener("click", function () {                    
                    vscode.postMessage({
                        command: 'slice'
                    });
                });
            }())
        </script>
        
    </body>
    </html>`;
}

function _perfProfiles(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'perfProfiles', // Identifies the type of the webview. Used internally
        'Hotspot Diff', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const configs = getConfigs(dataDir);
    configs.sort();
    const options = getOptions(configs);

    panel.webview.html = getHotspotDiffContent(options, "Config1", "Config2", "{}");

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'diff' :
                    const config1 = message.config1;
                    const config2 = message.config2;
                    var res = request('POST', 'http://localhost:8001/diff',
                        {
                            json: {
                                programName: "Convert",
                                config1: "REPORT",
                                // config1: config1,
                                config2: "SKIP_UPSCALING"
                                // config2: config2
                            }
                        }
                    );
                    const response = res.getBody() + "";
                    const x = getHotspotDiffContent(options, config1, config2, response);
                    console.log(x);
                    panel.webview.html = x;
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getOptions(configs: string[]) {
    let options = "";
    for (const config of configs) {
        options = options.concat("<option value=\"");
        options = options.concat(config);
        options = options.concat("\">");
        options = options.concat(config);
        options = options.concat("</option>");
    }
    return options;
}

function getHotspotDiffContent(options: string, config1: string, config2: string, hotspotDiffData: string) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tabulator Example</title>
        <link href="https://unpkg.com/tabulator-tables@4.8.1/dist/css/tabulator_simple.min.css" rel="stylesheet">
        <script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.8.1/dist/js/tabulator.min.js"></script>
    </head>
    <body>
        <div>Select two configurations to compare their hotspot views:</div>
        <div>    
            <select name="configSelect1" id="configSelect1">
                ${options}
            </select>
            <select name="configSelect2" id="configSelect2">
                ${options}
            </select>     
        </div>
        <div><button id="hotspot-diff-trigger">Compare Hotspots</button></div>
        <br>
        <div id="hotspot-diff-table"></div>
        <script type="text/javascript">                                       
            const hotspotDiffData = [${hotspotDiffData}];      
            const table = new Tabulator("#hotspot-diff-table", {
                data: hotspotDiffData,
                dataTree:true,
                dataTreeStartExpanded:false,
                layout: "fitColumns",
                columns: [
                    {title: "Hot Spot", field: "method", sorter: "string"},
                    {title: "${config1}", field: "config1", sorter: "number", hozAlign: "right"},
                    {title: "${config2}", field: "config2", sorter: "number", hozAlign: "right"}
                ],
            }); 
            
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("hotspot-diff-trigger").addEventListener("click", function () {                    
                    const config1 = document.getElementById("configSelect1").value;
                    const config2 = document.getElementById("configSelect2").value;
                                     
                    vscode.postMessage({
                        command: 'diff',
                        config1: config1,
                        config2: config2
                    });
                });
            }())
        </script>
    </body>
    </html>`;
}

function getConfigs(dataDir: string) {
    let configs: string[] = [];
    parse(fs.readFileSync(path.join(dataDir, 'configs.txt'), 'utf8')).forEach((entry: string) => {
        configs.push(entry);
    });
    return configs;
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
        'Local Performance Models', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const methodBasicInfo = getMethodsInfo(dataDir);
    methodBasicInfo.sort((a, b) => (a.reportTime > b.reportTime) ? -1 : 1);
    const methods2Models = getMethods2Models(dataDir);
    panel.webview.postMessage({
        methodBasicInfo: methodBasicInfo,
        methods2Models: methods2Models
    });
    panel.webview.html = getLocalModelsContent(context, panel);
}

function getMethodsInfo(dataDir: string) {
    let basicMethodInfo: BasicMethodInfo[] = [];
    parse(fs.readFileSync(path.join(dataDir, 'methods.csv'), 'utf8')).forEach((entry: string) => {
        basicMethodInfo.push({method: entry[0], defaultExecutionTime: entry[1], reportTime: +entry[2]});
    });
    return basicMethodInfo;
}

function getMethods2Models(dataDir: string) {
    let method2Models: Method2Model[] = [];
    fs.readdirSync(path.join(dataDir, 'localModels')).forEach(file => {
        const method = path.parse(file).name;
        const perfModel = parse(fs.readFileSync(path.join(dataDir, 'localModels', file), 'utf8'));
        method2Models.push({method: method, model: perfModel});
    });
    return method2Models;
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
        'Global Performance Model', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
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
        <link href="https://unpkg.com/tabulator-tables@4.8.1/dist/css/tabulator_simple.min.css" rel="stylesheet">
        <script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.8.1/dist/js/tabulator.min.js"></script>
    </head>
    <body>
        <div>Methods are sorted by their execution time when running the user's configuration.</div>
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
        <div id="local-model-table"></div>
        <script src="${localModelsScript}"></script>
    </body>
    </html>`;
}

function getGlobalModelContent(rawDefaultConfig: string[], defaultExecutionTime: string, rawPerfModel: string[]) {
    // const defaultConfig = getDefaultConfig(rawDefaultConfig);
    const perfModel = getPerfModel(rawPerfModel);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tabulator Example</title>
        <link href="https://unpkg.com/tabulator-tables@4.8.1/dist/css/tabulator_simple.min.css" rel="stylesheet">
        <script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.8.1/dist/js/tabulator.min.js"></script>
    </head>
    <body>
        <div id="defaultExecutionTime">Default execution time: ${defaultExecutionTime}</div>
        <br>
        <div>
            <button id="configure">Configure</button>
            <button id="deselect-all">Deselect All</button>
        </div>
        <br>
        <div id="selected-config-time">Selected configuration time:</div>
        <br>
        <div id="perfModel"></div>
        <script type="text/javascript">     
            const perfModelData = [${perfModel}];        
            const perfModelTable = new Tabulator("#perfModel", {
                data: perfModelData,
                layout: "fitColumns",
                selectable:true,
                columns: [
                    { title: "Option", field: "option", sorter: "string", formatter: customFormatter }, 
                    { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                ],
            });
            
            document.getElementById("deselect-all").addEventListener("click", function(){
                perfModelTable.deselectRow();
            });
            
            document.getElementById("configure").addEventListener("click", function(){
                let selectedRows = perfModelTable.getRows().filter(row => row.isSelected());
                const selectedOptions = new Set();
                selectedRows.forEach(row => {
                    row.getData().option.split(",").forEach(entry => {
                       selectedOptions.add(entry.split(" ")[0]); 
                    });
                });
                                
                const rowsToSelect = perfModelTable.getRows().filter(row => {
                    const options = new Set(); 
                    row.getData().option.split(",").forEach(entry => {
                        options.add(entry.split(" ")[0]);
                    })
                    return subset(options, selectedOptions);
                });
                rowsToSelect.forEach(row => row.select());
                
                selectedRows = perfModelTable.getRows().filter(row => row.isSelected());
                let time = +document.getElementById("defaultExecutionTime").textContent.split(" ")[3];
                selectedRows.forEach(row => {
                    let influenceStr = row.getData().influence;
                    let influence = influenceStr.replace("+","");
                    influence = +influence.replace("-","");
                    console.log(influence);
                    if(influenceStr.includes('+')) {
                        time += influence;
                    }
                    else {
                        time -= influence;
                    }
                });
                document.getElementById("selected-config-time").innerHTML = "Selected configuration time: " + Math.max(0, time).toFixed(2) + " seconds";
            });
            
            function subset(subset, set) {
                for(let elem of subset) {
                    if(!set.has(elem)) {
                        return false;
                    }
                }
                return true;
            }
                           
            function influenceSort(a, b, aRow, bRow, column, dir, sorterParams) {
                let one = a.replace("+","");
                one = one.replace("-","");
                let two = b.replace("+","");
                two = two.replace("-","");
                return (+one) - (+two);
            }
            
            function customFormatter(cell, formatterParams, onRendered) {
                const val = cell.getValue();
                const entries = val.split(",");
                const cellDiv = document.createElement('div');
                for (let i = 0; i < entries.length; i++){
                    const valItemDiv = document.createElement('div');
                    valItemDiv.textContent = entries[i];
                    cellDiv.appendChild(valItemDiv);
                }
                return cellDiv;
            }
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
        result = result.concat("\", influence: \"");
        result = result.concat(entry[1]);
        result = result.concat("\" }, ");
    });
    return result;
}

interface BasicMethodInfo {
    method: string
    defaultExecutionTime: string
    reportTime: number
}

interface Method2Model {
    method: string
    model: string[]
}