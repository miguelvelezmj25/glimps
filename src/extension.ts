// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {DocumentSymbol, Selection, SymbolKind, TextEditorRevealType, WorkspaceFolder} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let sourceClass = "";
let sources = new Set<Number>();
let targetClass = "";
let target: number = -1;

const style: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});
let filesToHighlight = new Map<String, Set<String>>();
let sliceConnections = '';

let globalModelPanel: vscode.WebviewPanel | undefined = undefined;
let localModelPanel: vscode.WebviewPanel | undefined = undefined;
let profilePanel: vscode.WebviewPanel | undefined = undefined;
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
    const configDialog = vscode.commands.registerCommand('configDialog.start', () => _configDialog(context));
    const globalModel = vscode.commands.registerCommand('globalModel.start', () => _globalModel(context));
    const localModels = vscode.commands.registerCommand('localModels.start', () => _localModels(context));
    const perfProfiles = vscode.commands.registerCommand('perfProfiles.start', () => _perfProfiles(context));
    const slicingSource = vscode.commands.registerCommand('sliceSource.start', () => _sliceSource(context));
    const slicingTarget = vscode.commands.registerCommand('sliceTarget.start', () => _sliceTarget(context));
    const slicing = vscode.commands.registerCommand('slicing.start', () => _slicing(context));
    context.subscriptions.push(configDialog, globalModel, localModels, perfProfiles, slicingSource, slicingTarget, slicing);
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension "perf-debug"');
    if (style !== undefined) {
        style.dispose();
    }
}

function _configDialog(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'configDialog', // Identifies the type of the webview. Used internally
        'Configuration Dialog', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    let allConfigs = getAllConfigs(dataDir);
    panel.webview.html = getConfigDialogContent([], allConfigs, 'default');

    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'display' :
                    const config = message.config;
                    const configData = parse(fs.readFileSync(path.join(dataDir, 'configs/' + config + '.csv'), 'utf8'));
                    allConfigs = getAllConfigs(dataDir);
                    panel.webview.html = getConfigDialogContent(configData, allConfigs, config);
                    return;
                case 'globalInfluence' :
                    if (globalModelPanel) {
                        globalModelPanel.reveal();
                    } else {
                        vscode.commands.executeCommand('globalModel.start');
                    }
                    return;
                case 'profile' :
                    if (profilePanel) {
                        profilePanel.reveal();
                    } else {
                        vscode.commands.executeCommand('perfProfiles.start');
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getAllConfigs(dataDir: string) {
    let configs: string[] = [];
    fs.readdirSync(path.join(dataDir, 'configs/')).forEach(fileName => {
        if (fileName.endsWith('.csv')) {
            fileName = fileName.replace(".csv", "");
            configs.push(fileName);
        }
    });
    return configs;
}

function getConfigDialogContent(rawConfig: string[], rawConfigs: string[], rawSelectedConfigName: string) {
    const config = getConfig(rawConfig);
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

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
        <div style="display: inline;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${configs}
            </select>
        </div>
        <div style="display: inline;"><button id="display-config-trigger">Display Configuration</button></div>
        <br>
        <hr>
        <br>
        <br>
        <div id="selected-config-name"><b>Selected configuration:</b> ${rawSelectedConfigName}</div>
        <br>
        <div id="displayConfig"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="global-influence-trigger">View Global Performance Influence</button></div>
        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>
        <br>
        <br>
        <br>
        <br>
<!--        <div">Save new configuration: TODO use custom picker for values, add textbox to name the config, add button to save config, refresh view when saving configu</div>-->
        <br>
        <div id="saveConfig"></div>
        <script type="text/javascript">                   
            const configData = [${config}];        
            const configTable = new Tabulator("#displayConfig", {
                data: configData,
                layout: "fitColumns",
                columns: [
                    { title: "Option", field: "option", sorter: "string" }, 
                    { title: "Value",  field: "value",  sorter: "string" }
                ],
            });
                 
            // const saveConfigTable = new Tabulator("#saveConfig", {
            //     data: configData,
            //     layout: "fitColumns",
            //     columns: [
            //         { title: "Option", field: "option", sorter: "string" }, 
            //         { title: "Value",  field: "value",  sorter: "string", editor:"select", editorParams:{values:{"male":"Male", "female":"Female", "unknown":"Unknown"}} }
            //     ],
            // });
            
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("display-config-trigger").addEventListener("click", function () {                    
                    const config = document.getElementById("configSelect").value;                 
                    vscode.postMessage({
                        command: 'display',
                        config: config
                    });
                });
                
                document.getElementById("global-influence-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'globalInfluence'
                    });
                });
                
                document.getElementById("profile-config-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'profile'
                    });
                });
            }())
        </script>
    </body>
    </html>`;
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

function setSliceConnections(connections: any[]) {
    let result = '';
    connections.forEach(entry => {
        let source = entry.source;
        source = source.substring(0, source.indexOf("("));
        let target = entry.target;
        target = target.substring(0, target.indexOf("("));
        result = result.concat('\\\"'
            + source.substring(0, source.lastIndexOf("."))
            + "\\n"
            + source.substring(source.lastIndexOf(".") + 1)
            + '\\\" -> \\\"'
            + target.substring(0, target.lastIndexOf("."))
            + "\\n"
            + target.substring(target.lastIndexOf(".") + 1)
            + '\\\" ');
    });
    sliceConnections = result;
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
        'Option Tracing', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    slicingPanel.webview.html = getSlicingContent();

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const sliceInfo = getSliceInfo(dataDir);
    const port = sliceInfo.port;

    const filesRoot = workspaceFolders[0].uri.path + '/src/main/java/';

    // Handle messages from the webview
    slicingPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'link':
                    const className = message.method.substring(0, message.method.indexOf('\n')).replaceAll('.', '/');
                    const method = message.method.substring(message.method.indexOf('\n') + 1);
                    let uri = vscode.Uri.file(filesRoot + className + '.java');
                    vscode.workspace.openTextDocument(uri).then(doc => {
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
                            .then(editor => {
                                vscode.commands.executeCommand<DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)
                                    .then(syms => {
                                        if (!syms || syms.length === 0) {
                                            return;
                                        }

                                        let methods2Symbols = new Map<String, DocumentSymbol>();
                                        for (const sym of syms) {
                                            for (const child of sym.children) {
                                                if (child.kind !== SymbolKind.Method && child.kind !== SymbolKind.Constructor) {
                                                    continue;
                                                }

                                                let methodName = child.name;
                                                methodName = methodName.substring(0, methodName.indexOf('('));
                                                if (child.kind === SymbolKind.Constructor) {
                                                    methodName = '<init>';
                                                }
                                                methods2Symbols.set(methodName, child);
                                            }
                                        }

                                        const symbol = methods2Symbols.get(method);
                                        if (!symbol) {
                                            return;
                                        }
                                        editor.revealRange(symbol.range, TextEditorRevealType.Default);
                                        editor.selection = new Selection(symbol.range.start, symbol.range.start);
                                    });
                            });
                    });
                    return;
                case 'clear':
                    if (!slicingPanel) {
                        return;
                    }

                    sourceClass = "";
                    sources = new Set<Number>();
                    targetClass = "";
                    target = -1;
                    sliceConnections = '';
                    slicingPanel.webview.html = getSlicingContent();
                    return;
                case 'slice':
                    if (!slicingPanel) {
                        return;
                    }
                    if (sourceClass === "" || sources.size === 0 || targetClass === "" || target <= 0) {
                        vscode.window.showErrorMessage("Select options and hotspots for tracing");
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
                    setFilesToHighlight(response.slice);
                    setSliceConnections(response.connections);
                    slicingPanel.webview.html = getSlicingContent();
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
        filesToHighlight.set(entry.file, entry.lines);
    });
}

function getSliceInfo(dataDir: string) {
    const sliceInfo = parse(fs.readFileSync(path.join(dataDir, 'sliceInfo.csv'), 'utf8'))[0];
    return {programName: sliceInfo[0], port: sliceInfo[1]};
}

function getSlicingContent() {
    const sortedSources = Array.from(sources).sort((a, b) => (a > b) ? 1 : -1);
    let sourceList = '<ul><li>Select options</li></ul>';
    if (sources.size > 0) {
        sourceList = '';
        sortedSources.forEach(function (source) {
            sourceList += '<li>' + sourceClass + ":" + source + '</li>';
        });
        sourceList = '<ul>' + sourceList + '</ul>';
    }

    let targetList = '<ul><li>Select a hotspot</li></ul>';
    if (target > 0) {
        targetList = '<ul><li>' + targetClass + ":" + target + '</li></ul>';
    }

    const graphData: string = '{ data: \"digraph { node [shape=box] concentrate=true ' + sliceConnections + '}\" }';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Program Slicing</title>
    </head>
    <body>
        <script src="https://d3js.org/d3.v5.min.js"></script>
        <script src="https://unpkg.com/@hpcc-js/wasm@0.3.11/dist/index.min.js"></script>
        <script src="https://unpkg.com/d3-graphviz@3.0.5/build/d3-graphviz.js"></script>
        <div>
            <b>Options:</b> ${sourceList} 
            <b>Hotspot:</b> ${targetList} 
        </div>
        <br>
        <div><button id="slice-trigger">Trace</button> <button id="clear-trigger">Clear</button></div>
        <br>
        <hr>
        <br>
        <div><b>Paths from Options to the Hotspot:</b></div>
        <br>
        <div id="connection-graph"></div>
        <script type="text/javascript">                                                           
            (function () {
                const vscode = acquireVsCodeApi();
                
                const graphData = ${graphData}.data;
                if(graphData.length > 45) { 
                    d3.select("#connection-graph").graphviz()
                        .renderDot(graphData).zoom(false)
                        .on("end", interactive);
                }
                
                function interactive() {
                    const nodes = d3.selectAll('.node');
                    nodes.on("click", function () {
                        const title = d3.select(this).selectAll('title').text();
                        vscode.postMessage({
                            command: 'link',
                            method: title
                        });
                    });
                }
                
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
    profilePanel = vscode.window.createWebviewPanel(
        'perfProfiles', // Identifies the type of the webview. Used internally
        'Hotspot View', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const sliceInfo = getSliceInfo(dataDir);
    const programName = sliceInfo.programName;
    let allConfigs = getAllConfigs(dataDir);
    profilePanel.webview.html = getHotspotDiffContent(allConfigs, "Config1", "Config2", "{}");

    // Handle messages from the webview
    profilePanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'diff' :
                    if (!profilePanel) {
                        return;
                    }
                    const config1 = message.configs[0];
                    const config2 = message.configs[1] ? message.configs[1] : message.configs[0];
                    var res = request('POST', 'http://localhost:8001/diff',
                        {
                            json: {
                                programName: programName,
                                config1: config1,
                                config2: config2
                            }
                        }
                    );
                    const response = res.getBody() + "";
                    allConfigs = getAllConfigs(dataDir);
                    profilePanel.webview.html = getHotspotDiffContent(allConfigs, config1, config2, response);
                    return;
                case 'localInfluence' :
                    if (localModelPanel) {
                        localModelPanel.reveal();
                    } else {
                        vscode.commands.executeCommand('localModels.start');
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    profilePanel.onDidDispose(
        () => {
            profilePanel = undefined;
        },
        null,
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

function getHotspotDiffContent(rawConfigs: string[], config1: string, config2: string, hotspotDiffData: string) {
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

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
        <div ><b>Select configurations:</b></div>
        <div style="display: inline">
            <select name="config-select" id="config-select" size='2' multiple="multiple">
                ${configs}
            </select>
        </div>
        <div style="display: inline"><button id="hotspot-trigger">View Hotspots</button></div>
        <br>
        <hr>
        <br>
        <br>
        <div id="hotspot-diff-table"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="local-influence-trigger">View Local Performance Influence</button></div>
        <script type="text/javascript">                                       
            const hotspotDiffData = [${hotspotDiffData}];      
            const table = new Tabulator("#hotspot-diff-table", {
                data: hotspotDiffData,
                dataTree:true,
                dataTreeStartExpanded:false,
                movableColumns: true, 
                rowFormatter: customRowFormatter,
                columns: [
                    {title: "Hot Spot", field: "method", sorter: "string"},
                    {title: "${config1}", field: "config1", sorter: "number", hozAlign: "right"},
                    {title: "${config2}", field: "config2", sorter: "number", hozAlign: "right"}
                ],
            }); 
            
            if(table.getColumn("config1").getDefinition().title === "Config1" || table.getColumn("config2").getDefinition().title === "Config2") {
                table.getColumn("config1").delete();
                table.getColumn("config2").delete();
            }
            else if(table.getColumn("config1").getDefinition().title === table.getColumn("config2").getDefinition().title) {
                table.getColumn("config2").delete();
            }
            
            function customRowFormatter(row) {
                const rowData = row.getData();
                const config1 = rowData.config1;
                const config2 = rowData.config2;
                
                if(config1 === "Not executed" || config2 === "Not executed"){
                    for(let i = 1; i < row.getCells().length; i++) {
                        row.getCells()[i].getElement().style.backgroundColor = "#fbf9f9";
                        row.getCells()[i].getElement().style.color = "#990000";
                        row.getCells()[i].getElement().style.fontWeight = "bold";
                    }
                }
                
                if(Math.abs((+config1) - (+config2)) > 1.0){
                    for(let i = 1; i < row.getCells().length; i++) {
                        row.getCells()[i].getElement().style.backgroundColor = "#f9f9fb";
                        row.getCells()[i].getElement().style.color = "#000066";
                        row.getCells()[i].getElement().style.fontWeight = "bold";
                    }
                } 
            }       
            
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("local-influence-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'localInfluence'
                    });
                });
                
                document.getElementById("hotspot-trigger").addEventListener("click", function () {
                    const configs = [];
                    for (const option of document.getElementById('config-select').options) {
                        if (option.selected) {
                            configs.push(option.value);
                        }
                    }
                    if(configs.length === 0) {
                        return;
                    }
                    vscode.postMessage({
                        command: 'diff',
                        configs: configs
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
    localModelPanel = vscode.window.createWebviewPanel(
        'localModels', // Identifies the type of the webview. Used internally
        'Local Performance Influence', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const methodBasicInfo = getMethodsInfo(dataDir);
    const methods2Models = getMethods2Models(dataDir);
    const names2Configs = getNames2Configs(dataDir);
    localModelPanel.webview.postMessage({
        methodBasicInfo: methodBasicInfo,
        methods2Models: methods2Models,
        names2Configs: names2Configs
    });

    const allConfigs = getAllConfigs(dataDir);
    localModelPanel.webview.html = getLocalModelsContent(context, localModelPanel, allConfigs);

    // Handle messages from the webview
    localModelPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'slice' :
                    if (slicingPanel) {
                        slicingPanel.reveal();
                    } else {
                        vscode.commands.executeCommand('slicing.start');
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    localModelPanel.onDidDispose(
        () => {
            localModelPanel = undefined;
        },
        null,
        context.subscriptions
    );
}

function getMethodsInfo(dataDir: string) {
    let basicMethodInfo: BasicMethodInfo[] = [];
    parse(fs.readFileSync(path.join(dataDir, 'methods.csv'), 'utf8')).forEach((entry: string) => {
        basicMethodInfo.push({method: entry[0], defaultExecutionTime: entry[1], reportTime: +entry[2]});
    });
    return basicMethodInfo;
}

function getNames2Configs(dataDir: string) {
    let names2Configs: any[] = [];
    fs.readdirSync(path.join(dataDir, 'configs')).forEach(file => {
        const config = path.parse(file).name;
        const value = parse(fs.readFileSync(path.join(dataDir, 'configs/' + file), 'utf8'))
        names2Configs.push({config: config, value: value});
    });
    return names2Configs;
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

function _globalModel(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        deactivate();
        return;
    }

    // Create and show a new webview
    globalModelPanel = vscode.window.createWebviewPanel(
        'globalModel', // Identifies the type of the webview. Used internally
        'Global Performance Influence', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const defaultConfig = parse(fs.readFileSync(path.join(dataDir, 'configs/default.csv'), 'utf8'));
    const defaultExecutionTime = fs.readFileSync(path.join(dataDir, 'default.txt'), 'utf8');
    const perfModel = parse(fs.readFileSync(path.join(dataDir, 'perf-model.csv'), 'utf8'));
    let allConfigs = getAllConfigs(dataDir);
    globalModelPanel.webview.html = getGlobalModelContent(defaultExecutionTime, perfModel, allConfigs, defaultConfig, defaultConfig, 'default');

    globalModelPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'viewGlobalInfluence' :
                    if (!globalModelPanel) {
                        return;
                    }
                    const config = message.config;
                    const configData = parse(fs.readFileSync(path.join(dataDir, 'configs/' + config + '.csv'), 'utf8'));
                    allConfigs = getAllConfigs(dataDir);
                    globalModelPanel.webview.html = getGlobalModelContent(defaultExecutionTime, perfModel, allConfigs, defaultConfig, configData, config);
                    return;
                case 'profile' :
                    if (profilePanel) {
                        profilePanel.reveal();
                    } else {
                        vscode.commands.executeCommand('perfProfiles.start');
                    }
                    return;
                case 'localInfluence' :
                    if (localModelPanel) {
                        localModelPanel.reveal();
                    } else {
                        vscode.commands.executeCommand('localModels.start');
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    globalModelPanel.onDidDispose(
        () => {
            globalModelPanel = undefined;
        },
        null,
        context.subscriptions
    );
}

function getLocalModelsContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, rawConfigs: string[]) {
    const localModelsScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'localModels.js'));
    const localModelsScript = panel.webview.asWebviewUri(localModelsScriptPath);
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

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
        <div>
            <label for="methodSelect"><b>Select method:</b></label>
            <select name="methodSelect" id="methodSelect"></select>     
        </div>
        <div style="display: inline;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${configs}
            </select>
        </div>
        <div style="display: inline;"><button id="view-influence-trigger">View Influence</button></div>
        <br>
        <hr>
        <br>
        <br>
        <div id="methodName">&nbsp;</div>
        <div id="selected-config-name">&nbsp;</div>
        <div id="selected-config-time">&nbsp;</div>
        <br>
        <div id="defaultExecutionTime">&nbsp;</div>
        <br>
        <div id="local-model-table"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="slice-trigger">Slice Options</button></div>
        <script src="${localModelsScript}"></script>
    </body>
    </html>`;
}

function getGlobalModelContent(defaultExecutionTime: string, rawPerfModel: string[], rawConfigs: string[], defaultConfig: string[], rawConfig: string[], rawSelectedConfigName: string) {
    const selectedConfigName = "{ name: \"" + rawSelectedConfigName + "\" }";
    const perfModel = getPerfModel(rawPerfModel);
    const selectedConfig = getSelectedConfig(defaultConfig, rawConfig);
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

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
        <div style="display: inline;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${configs}
            </select>
        </div>
        <div style="display: inline;"><button id="view-influence-trigger">View Influence</button></div>
        <br>
        <hr>
        <br>
        <br>
        <div style="display: inline;"id="selected-config-name"><b>Selected configuration:</b> default</div>
        <div id="selected-config-time">Execution time:</div>
        <br>
        <div id="defaultExecutionTime"><b>Default execution time:</b> ${defaultExecutionTime}</div>
        <br>
        <div id="perfModel"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>
        <div style="display: inline;"><button id="local-influence-trigger">View Local Performance Influence</button></div>
        <script type="text/javascript">
            (function () {    
                const perfModelData = [${perfModel}];        
                const perfModelTable = new Tabulator("#perfModel", {
                    data: perfModelData,
                    layout: "fitColumns",
                    columns: [
                        { title: "Option", field: "option", sorter: "string", formatter: customFormatter }, 
                        { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                    ],
                });
                
                const optionsToSelect = [${selectedConfig}];
                if(optionsToSelect.length > 0) {
                    const selectedOptions = new Set();
                    optionsToSelect.forEach(entry => {
                        selectedOptions.add(entry.option);
                    });
                                    
                    const rowsToSelect = perfModelTable.getRows().filter(row => {
                        const options = new Set(); 
                        row.getData().option.split(",").forEach(entry => {
                            options.add(entry.split(" ")[0]);
                        })
                        return subset(options, selectedOptions);
                    });
                    rowsToSelect.forEach(row => row.select());
                }
                
                let time = +document.getElementById("defaultExecutionTime").textContent.split(" ")[3];
                const selectedRows = perfModelTable.getRows().filter(row => row.isSelected());              
                selectedRows.forEach(row => {
                    let influenceStr = row.getData().influence;
                    let influence = influenceStr.replace("+","");
                    influence = +influence.replace("-","");
                    if(influenceStr.includes('+')) {
                        time += influence;
                    }
                    else {
                        time -= influence;
                    }
                });
                document.getElementById("selected-config-name").innerHTML = "<b>Selected configuration:</b> " + ${selectedConfigName}.name;
                document.getElementById("selected-config-time").innerHTML = "<b>Execution time:</b> " + Math.max(0, time).toFixed(2) + " seconds";
                
                perfModelTable.getRows().forEach(row => {
                   if(!selectedRows.includes(row)) {
                       row.delete();
                   } 
                });
                perfModelTable.getRows().forEach(row => {
                   row.deselect();
                });
            
                const vscode = acquireVsCodeApi();
            
                document.getElementById("view-influence-trigger").addEventListener("click", function(){
                    const config = document.getElementById("configSelect").value;                 
                    vscode.postMessage({
                        command: 'viewGlobalInfluence',
                        config: config
                    });
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
                
                document.getElementById("profile-config-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'profile'
                    });
                });
                
                document.getElementById("local-influence-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'localInfluence'
                    });
                });
            }())
        </script>
    </body>
    </html>`;
}

function getConfig(rawDefaultConfig: string[]) {
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

function getSelectedConfig(defaultConfig: string[], rawConfig: string[]) {
    let selected: string[] = [];
    rawConfig.forEach((entry) => {
        const option = entry[0];
        defaultConfig.forEach((defaultEntry) => {
            if (option === defaultEntry[0]) {
                if (entry[1] !== defaultEntry[1]) {
                    selected.push(option);
                }
            }
        });
    });

    if (selected.length === 0) {
        return "";
    }

    let result = "";
    selected.forEach((entry) => {
        result = result.concat("{ option: \"");
        result = result.concat(entry);
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