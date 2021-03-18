// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {DocumentSymbol, Selection, SymbolKind, TextEditorRevealType, WorkspaceFolder} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let commonSources: { [p: string]: string[] } = {};
let selectedCommonSources = new Set<string>();
let targetClass = "";
let target: number = -1;

let style: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});
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
    const slicingTarget = vscode.commands.registerCommand('sliceTarget.start', () => _sliceTarget(context));
    const slicing = vscode.commands.registerCommand('slicing.start', () => _slicing(context));
    context.subscriptions.push(configDialog, globalModel, localModels, perfProfiles, slicingTarget, slicing);
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
    const allConfigs = getAllConfigs(dataDir);
    const names2Configs = getNames2Configs(dataDir);
    const optionValues = getOptionsValues(dataDir);
    panel.webview.html = getConfigDialogContent(allConfigs, names2Configs, optionValues);

    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
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
                case 'save' :
                    const configName = message.configName;
                    if (configName.length === 0) {
                        vscode.window.showErrorMessage("Name the configuration before saving it");
                        return;
                    }
                    let config = "";
                    message.config.forEach((entry: any) => {
                        config = config.concat(entry.option);
                        config = config.concat(",");
                        config = config.concat(entry.value);
                        config = config.concat("\n");
                    });
                    fs.writeFile(path.join(dataDir, 'configs', configName + '.csv'), config, (err) => {
                        if (err) {
                            vscode.window.showErrorMessage("Error saving configuration");
                        } else {
                            vscode.window.showErrorMessage("Configuration saved");
                        }
                    });
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

function getConfigDialogContent(rawConfigs: string[], names2ConfigsRaw: any, optionValuesRaw: any[]) {
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

    let names2Configs = '{';
    for (let i = 0; i < names2ConfigsRaw.length; i++) {
        names2Configs = names2Configs.concat('"');
        names2Configs = names2Configs.concat(names2ConfigsRaw[i].config);
        names2Configs = names2Configs.concat('": [');
        for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
            names2Configs = names2Configs.concat('{ option : "');
            names2Configs = names2Configs.concat(names2ConfigsRaw[i].value[j][0]);
            names2Configs = names2Configs.concat('", value: "');
            names2Configs = names2Configs.concat(names2ConfigsRaw[i].value[j][1]);
            names2Configs = names2Configs.concat('"}, ');
        }
        names2Configs = names2Configs.concat('],');
    }
    names2Configs = names2Configs.concat('}');

    let optionsValues = '{';
    for (let i = 0; i < optionValuesRaw.length; i++) {
        optionsValues = optionsValues.concat('"');
        optionsValues = optionsValues.concat(optionValuesRaw[i][0]);
        optionsValues = optionsValues.concat('": ["');
        optionsValues = optionsValues.concat(optionValuesRaw[i][1]);
        optionsValues = optionsValues.concat('", "');
        optionsValues = optionsValues.concat(optionValuesRaw[i][2]);
        optionsValues = optionsValues.concat('"], ');
    }
    optionsValues = optionsValues.concat('}');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tabulator Example</title>
        <link href="https://unpkg.com/tabulator-tables@4.8.1/dist/css/tabulator_simple.min.css" rel="stylesheet">
        <script type="text/javascript" src="https://unpkg.com/tabulator-tables@4.8.1/dist/js/tabulator.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.18.1/moment.min.js"></script>
    </head>
    <body>
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect" onchange="displayConfig()">
                ${configs}
            </select>
        </div>
        <br>
<!--        <hr>-->
        <br>
        <div id="displayConfig"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Save new configuration:</b></div> 
        <input type="text" id="config-name" name="config-name" placeholder="Enter name">
        <br>
        <br>
        <div id="saveConfig"></div>
        <br>
        <div><button id="save-config-trigger">Save configuration</button></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="global-influence-trigger">View Options' Influence</button></div>
<!--        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>-->
        <br>
        <br>
        <br>
        <br>
        <br>
        <script type="text/javascript">     
            const names2Configs = ${names2Configs};
                             
            const configTable = new Tabulator("#displayConfig", {
                layout: "fitColumns",
                columns: [
                    { title: "Option", field: "option", sorter: "string" }, 
                    { title: "Value",  field: "value",  sorter: "string" }
                ],
            });
                        
            function displayConfig() {                    
                const config = document.getElementById("configSelect").value;
                configTable.setData(names2Configs[config]);
            }
            displayConfig();
                        
            const optionValuesData = ${optionsValues};
            const optionValues = function(cell){
                const options = optionValuesData[cell.getRow().getData().option];
                const values = {};
                values[options[0]] = options[0];
                values[options[1]] = options[1];
                return {values:values};
            }
            
            const saveConfigTable = new Tabulator("#saveConfig", {
                layout: "fitColumns",
                columns: [
                    { title: "Option", field: "option", headerSort: false }, 
                    { title: "Value",  field: "value", editor:"select", editorParams: optionValues, headerSort: false }
                ],
            });
            const config = document.getElementById("configSelect").value;
            saveConfigTable.setData(names2Configs[config]);
                        
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("save-config-trigger").addEventListener("click", function () {
                    vscode.postMessage({
                        command: 'save',
                        configName: document.getElementById("config-name").value.trim(),
                        config: saveConfigTable.getData() 
                    });
                });
                                
                document.getElementById("global-influence-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'globalInfluence'
                    });
                });
                
                // document.getElementById("profile-config-trigger").addEventListener("click", function () {    
                //     vscode.postMessage({
                //         command: 'profile'
                //     });
                // });
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

function getHotspotInfluences(dataDir: string) {
    let hotspotInfluences: { [key: string]: string[]; } = {};
    const regex = /\./g;
    parse(fs.readFileSync(path.join(dataDir, 'tracing', 'targets.csv'), 'utf8')).forEach((entry: string[]) => {
        let file = entry[0].replace(regex, '/');
        file = file.concat('.java');
        if (!(file in hotspotInfluences)) {
            hotspotInfluences[file] = [];
        }
        hotspotInfluences[file].push(entry[1]);
    });
    return hotspotInfluences;
}

function getSliceSources(dataDir: string) {
    let sources: { [key: string]: string[]; } = {};
    parse(fs.readFileSync(path.join(dataDir, 'tracing', 'sources.csv'), 'utf8')).forEach((entry: string[]) => {
        sources[entry[1]] = [entry[0], entry[2]];
    });
    return sources;
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

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    commonSources = getSliceSources(dataDir);
    slicingPanel.webview.html = getSlicingContent();

    const sliceInfo = getSliceInfo(dataDir);
    const port = sliceInfo.port;
    const filesRoot = workspaceFolders[0].uri.path + '/src/main/java/';
    // Handle messages from the webview
    slicingPanel.webview.onDidReceiveMessage(
        message => {
            const regex = /\./g;
            switch (message.command) {
                case 'link':
                    const className = message.method.substring(0, message.method.indexOf('\n')).replace(regex, '/');
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

                    targetClass = "";
                    target = -1;
                    sliceConnections = '';
                    filesToHighlight.clear();
                    style.dispose();
                    slicingPanel.webview.html = getSlicingContent();
                    return;
                case 'slice':
                    if (!slicingPanel) {
                        return;
                    }
                    if (message.selectedOptions.length === 0 || targetClass === "" || target <= 0) {
                        vscode.window.showErrorMessage("Select options and hotspots for tracing");
                        return;
                    }

                    selectedCommonSources.clear();
                    let lines: number[] = [];
                    message.selectedOptions.forEach((option: string) => {
                        selectedCommonSources.add(option);
                        lines.push(+commonSources[option][1]);
                    });

                    const res = request('POST', 'http://localhost:' + port + '/slice',
                        {
                            json: {
                                sourceClass: (commonSources[message.selectedOptions[0]][0].replace(regex, '/') + '.java'),
                                sourceLines: lines,
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

    const hotspotInfluences = getHotspotInfluences(dataDir);
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        const doc = vscode.window.activeTextEditor.document;
        let editorPath = doc.uri.path;
        editorPath = editorPath.replace(workspaceFolders[0].uri.path, "");
        editorPath = editorPath.replace("/src/main/java/", "");

        if (editorPath in hotspotInfluences) {
            const hotspot = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,0,0,0.25)'});
            let ranges: vscode.Range[] = [];
            hotspotInfluences[editorPath].forEach(entry => {
                ranges.push(doc.lineAt((+entry - 1)).range);
            });
            vscode.window.activeTextEditor.setDecorations(hotspot, ranges);
        }

        const lines = filesToHighlight.get(editorPath);
        if (!lines || lines.size === 0) {
            return;
        }

        let ranges: vscode.Range[] = [];
        for (const lineNumber of lines.values()) {
            if (+lineNumber <= 0) {
                continue;
            }

            console.log('TODO check which is the source and the target to not highligh those');

            const line = vscode.window.activeTextEditor.document.lineAt((+lineNumber - 1));
            ranges.push(line.range);
        }
        style.dispose();
        style = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});
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
    let targetList = '<ul><li>Select a hotspot</li></ul>';
    if (target > 0) {
        targetList = '<ul><li>' + targetClass + ":" + target + '</li></ul>';
    }

    let commonSourcesSelect = '';
    Object.entries(commonSources).forEach(entry => {
        commonSourcesSelect = commonSourcesSelect.concat('<div style="font-size: 14px;">\n');
        commonSourcesSelect = commonSourcesSelect.concat('<input type="checkbox" id="');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0]);
        commonSourcesSelect = commonSourcesSelect.concat('" name="source-checkbox" ');
        if (selectedCommonSources.has(entry[0])) {
            commonSourcesSelect = commonSourcesSelect.concat(' checked');
        }
        commonSourcesSelect = commonSourcesSelect.concat('>\n');
        commonSourcesSelect = commonSourcesSelect.concat('<label for="');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0]);
        commonSourcesSelect = commonSourcesSelect.concat('">');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0] + ' - ' + entry[1][0] + '():' + entry[1][1]);
        commonSourcesSelect = commonSourcesSelect.concat('</label>\n');
        commonSourcesSelect = commonSourcesSelect.concat('</div>\n');
    });

    const graphData: string = '{ data: \"digraph { node [shape=box fillcolor=white style=filled] concentrate=true ' + sliceConnections + '}\" }';

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
        <div style="font-size: 14px;"><b>Select Options to Trace:</b></div>
        <br>
        ${commonSourcesSelect}
        <br>
        <br>
        <div>
            <b>Hotspot:</b> ${targetList} 
        </div>
        <br>
        <div><button id="slice-trigger">Trace</button> <button id="clear-trigger">Clear</button></div>
        <br>
        <hr>
        <br>
        <div style="font-size: 14px;"><b>Clickable Trace from Options to the Hotspot:</b></div>
        <br>
        <div id="connection-graph"></div>
        <script type="text/javascript"> 
        
            function slice() {
                mySlice();
            }
        
            (function () {
                const vscode = acquireVsCodeApi();
                                                
                const graphData = ${graphData}.data;
                if(graphData.length > 74) { 
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
                    nodes.on('mouseover', function() {
                        d3.select(this).style("fill", "#c769ff");
                        d3.select(this).style("text-decoration", "underline");
                    })
                    nodes.on('mouseout', function() {
                        d3.select(this).style("fill", "black");
                        d3.select(this).style("text-decoration", "");
                    })
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
                
                document.getElementsByName("source-checkbox").forEach( element => {
                    element.addEventListener("change", () => {
                        let selectOptions = [];
                        document.getElementsByName("source-checkbox").forEach(element => {
                            if(element.checked) {
                                selectOptions.push(element.id);
                            }
                        })
                        vscode.postMessage({
                            command: 'slice',
                            selectedOptions: selectOptions
                        });
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

function getOptionsValues(dataDir: string) {
    return parse(fs.readFileSync(dataDir + '/options.csv', 'utf8'));
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
        'Options\' Influence', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const defaultExecutionTime = fs.readFileSync(path.join(dataDir, 'default.txt'), 'utf8');
    const perfModel = parse(fs.readFileSync(path.join(dataDir, 'perf-model.csv'), 'utf8'));
    const allConfigs = getAllConfigs(dataDir);
    const names2Configs = getNames2Configs(dataDir);
    const methods2Models = getMethods2Models(dataDir);
    globalModelPanel.webview.html = getGlobalModelContent(defaultExecutionTime, perfModel, allConfigs, names2Configs, methods2Models);

    globalModelPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                // case 'viewGlobalInfluence' :
                //     if (!globalModelPanel) {
                //         return;
                //     }
                //     const config = message.config;
                //     const configData = parse(fs.readFileSync(path.join(dataDir, 'configs/' + config + '.csv'), 'utf8'));
                //     allConfigs = getAllConfigs(dataDir);
                //     globalModelPanel.webview.html = getGlobalModelContent(defaultExecutionTime, perfModel, allConfigs, defaultConfig, configData, config);
                //     return;
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
        <div id="methodName" style="font-size: 14px;">&nbsp;</div>
        <div id="selected-config-name" style="font-size: 14px;">&nbsp;</div>
        <div id="selected-config-time" style="font-size: 14px;">&nbsp;</div>
        <br>
        <div id="defaultExecutionTime" style="font-size: 14px;">&nbsp;</div>
        <br>
        <div id="local-model-table"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="slice-trigger">Trace Options</button></div>
        <script src="${localModelsScript}"></script>
    </body>
    </html>`;
}

function getGlobalModelContent(defaultExecutionTimeRaw: string, rawPerfModel: string[], rawConfigs: string[], names2ConfigsRaw: any, methods2ModelsRaw: any) {
    const defaultExecutionTime = '{ time : ' + (+defaultExecutionTimeRaw.split(' ')[0]) + ' }';

    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat("\">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }

    let names2Configs = '{';
    for (let i = 0; i < names2ConfigsRaw.length; i++) {
        names2Configs = names2Configs.concat('"');
        names2Configs = names2Configs.concat(names2ConfigsRaw[i].config);
        names2Configs = names2Configs.concat('": [');
        for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
            names2Configs = names2Configs.concat('{ option : "');
            names2Configs = names2Configs.concat(names2ConfigsRaw[i].value[j][0]);
            names2Configs = names2Configs.concat('", value: "');
            names2Configs = names2Configs.concat(names2ConfigsRaw[i].value[j][1]);
            names2Configs = names2Configs.concat('"}, ');
        }
        names2Configs = names2Configs.concat('],');
    }
    names2Configs = names2Configs.concat('}');

    const perfModel = getPerfModel(rawPerfModel);
    const perfModelEval = eval(perfModel);
    let names2PerfModels = '{';
    for (let i = 0; i < names2ConfigsRaw.length; i++) {
        names2PerfModels = names2PerfModels.concat('"');
        names2PerfModels = names2PerfModels.concat(names2ConfigsRaw[i].config);
        names2PerfModels = names2PerfModels.concat('": ');
        const config = new Map<string, string>();
        for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
            config.set(names2ConfigsRaw[i].value[j][0], names2ConfigsRaw[i].value[j][1]);
        }
        names2PerfModels = names2PerfModels.concat('[');
        perfModelEval.forEach((entry: any) => {
            const selections = new Map<string, any>();
            entry.options.forEach((option: any) => {
                const value = config.get(option.option);
                selections.set(option.option, value);
            });
            let sameValues = true;
            entry.options.forEach((option: any) => {
                const selection = selections.get(option.option);
                if (option.to !== selection) {
                    sameValues = false;
                }
            });
            names2PerfModels = names2PerfModels.concat('{ option : "');
            entry.options.forEach((option: any) => {
                names2PerfModels = names2PerfModels.concat(option.option);
                names2PerfModels = names2PerfModels.concat(" (");
                names2PerfModels = names2PerfModels.concat(sameValues ? option.to : option.from);
                names2PerfModels = names2PerfModels.concat(" --> ");
                names2PerfModels = names2PerfModels.concat(sameValues ? option.from : option.to);
                names2PerfModels = names2PerfModels.concat('),');
            });
            names2PerfModels = names2PerfModels.concat('", influence: "');
            names2PerfModels = names2PerfModels.concat(sameValues ? (entry.sign === '+') ? '-' : '+' : entry.sign);
            names2PerfModels = names2PerfModels.concat(entry.influence);
            names2PerfModels = names2PerfModels.concat('"}, ');
        });
        names2PerfModels = names2PerfModels.concat('],');
    }
    names2PerfModels = names2PerfModels.concat('}');

    let names2LocalModels = '{';
    for (let i = 0; i < names2ConfigsRaw.length; i++) {
        names2LocalModels = names2LocalModels.concat('"');
        names2LocalModels = names2LocalModels.concat(names2ConfigsRaw[i].config);
        names2LocalModels = names2LocalModels.concat('": ');
        const config = new Map<string, string>();
        for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
            config.set(names2ConfigsRaw[i].value[j][0], names2ConfigsRaw[i].value[j][1]);
        }
        names2LocalModels = names2LocalModels.concat('[');
        methods2ModelsRaw.forEach((localModelRaw: any) => {
            names2LocalModels = names2LocalModels.concat('{ method : "');
            names2LocalModels = names2LocalModels.concat(localModelRaw.method);
            names2LocalModels = names2LocalModels.concat('", model: ');

            const localModel = getPerfModel(localModelRaw.model);
            const localModelEval = eval(localModel);
            names2LocalModels = names2LocalModels.concat('[');
            localModelEval.forEach((entry: any) => {
                const selections = new Map<string, any>();
                entry.options.forEach((option: any) => {
                    const value = config.get(option.option);
                    selections.set(option.option, value);
                });
                let sameValues = true;
                entry.options.forEach((option: any) => {
                    const selection = selections.get(option.option);
                    if (option.to !== selection) {
                        sameValues = false;
                    }
                });
                names2LocalModels = names2LocalModels.concat('{ option : "');
                entry.options.forEach((option: any) => {
                    names2LocalModels = names2LocalModels.concat(option.option);
                    names2LocalModels = names2LocalModels.concat(" (");
                    names2LocalModels = names2LocalModels.concat(sameValues ? option.to : option.from);
                    names2LocalModels = names2LocalModels.concat(" --> ");
                    names2LocalModels = names2LocalModels.concat(sameValues ? option.from : option.to);
                    names2LocalModels = names2LocalModels.concat('),');
                });
                names2LocalModels = names2LocalModels.concat('", influence: "');
                names2LocalModels = names2LocalModels.concat(sameValues ? (entry.sign === '+') ? '-' : '+' : entry.sign);
                names2LocalModels = names2LocalModels.concat(entry.influence);
                names2LocalModels = names2LocalModels.concat('"}, ');
            });
            names2LocalModels = names2LocalModels.concat(']}, ');
        });
        names2LocalModels = names2LocalModels.concat('],');
    }
    names2LocalModels = names2LocalModels.concat('}');

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
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect" onchange="viewPerfModel()">
                ${configs}
            </select>
        </div>
        <div style="display: inline; font-size: 14px;">compare to: TODO? </div>
<!--        <div style="display: inline;">-->
<!--            <select name="compareSelect" id="compareSelect" onchange="viewPerfModel()">-->
<!--                            // {configs} -->
<!--            </select>-->
<!--        </div>-->
        <br>
        <br>
        <div id="selected-config-time" style="font-size: 14px;">Execution time:</div>
        <br>
        <div id="perfModel"></div>
        <br>
        <br>
        <div style="font-size: 14px;"><b>Options' Local Influence</b></div>
        <br>
        <div id="localInfluence"></div>
        <br>
        <hr>
        <br>
        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>
        <div style="display: inline;"><button id="local-influence-trigger">View Local Performance Influence</button></div>
        <script type="text/javascript">          
            (function () {    
                const vscode = acquireVsCodeApi();
                
                const localInfluenceTable = new Tabulator("#localInfluence", {
                    layout: "fitColumns",
                    columns: [
                        { title: "Influenced Methods", field: "methods", sorter: "string" }, 
                        { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                    ],
                    rowClick:openFile,
                });
                
                function openFile(e, row){
                    //e - the click event object
                    //row - row component
                    console.log("HELO");
                }
                
                const defaultExecutionTime = ${defaultExecutionTime}.time;
                const rawPerfModel = ${perfModel}
                const names2PerfModels = ${names2PerfModels};
                const names2LocalModels = ${names2LocalModels};
                const names2Configs = ${names2Configs};
                let selectedRow = undefined;
                      
                const perfModelTable = new Tabulator("#perfModel", {
                    layout: "fitColumns",
                    selectable: true,
                    columns: [
                        { title: "Options", field: "option", sorter: "string", formatter: customFormatter }, 
                        { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                    ],
                    rowSelectionChanged:selectInfluence
                });
                function selectInfluence(data, rows) {
                    if(rows.length === 0) {
                        localInfluenceTable.setData([]);
                        return;
                    }
                    
                    if(rows.length === 1) {
                        selectedRow = rows[0];
                    }
                    else {
                        selectedRow.deselect();
                        rows = rows.splice(rows.indexOf(selectedRow), 1);
                        selectedRow = rows[0];
                        return;
                    }
                    
                    let selectedOptions = new Set();
                    selectedRow.getData().option.split(',').forEach(optionRaw => {
                        if(optionRaw.length > 0) {
                            selectedOptions.add(optionRaw.split(' ')[0]);
                        }
                    });
                    selectedOptions = Array.from(selectedOptions);
                    
                    const influencedMethods = new Map();
                    const config = document.getElementById("configSelect").value;
                    names2LocalModels[config].forEach(localModel => {
                        localModel.model.forEach(term => {
                            let optionsInTerm = new Set();
                            term.option.split(',').forEach(optionRaw => {
                                if(optionRaw.length > 0) {
                                    optionsInTerm.add(optionRaw.split(' ')[0]);
                                }
                            });
                            optionsInTerm = Array.from(optionsInTerm);
                            
                            if(selectedOptions.sort().join(',') === optionsInTerm.sort().join(',')) {
                                influencedMethods.set(localModel.method, term.influence);
                            }
                        });
                    });
                    
                                    
                    const localInfluence = [];
                    influencedMethods.forEach((influence, methodRaw) => {
                        const entries = methodRaw.split(".");
                        const method = (entries[entries.length - 2]) + "." + (entries[entries.length - 1]) + '(...)'; 
                        localInfluence.push({methods: method, influence: influence});
                    });
                    localInfluenceTable.setData(localInfluence);
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
                                    
                function viewPerfModel() {                    
                    const config = document.getElementById("configSelect").value;
                    perfModelTable.setData(names2PerfModels[config]);
                    
                    const configSelected = names2Configs[config];
                    const configValues = new Map();
                    for (let i = 0; i < configSelected.length; i++) {
                        configValues.set(configSelected[i].option, configSelected[i].value);
                    }
                    
                    let time = defaultExecutionTime;
                    rawPerfModel.forEach(entry => {
                        const selections = new Map();
                        entry.options.forEach(option => {
                            const value = configValues.get(option.option);
                            selections.set(option.option, value);
                        });
    
                        let sameValues = true;
                        entry.options.forEach(option => {
                            const selection = selections.get(option.option);
                            if (option.to !== selection) {
                                sameValues = false;
                            }
                        });
                        if(sameValues) {
                            const influence = +entry.influence;
                            if(entry.sign === '+') {
                                time += influence;
                            }
                            else {
                                time -= influence;
                            }
                        }
                    });
                
                document.getElementById("selected-config-time").innerHTML = "<b>Execution time:</b> " + Math.max(0, time).toFixed(2) + " seconds";
            }
            viewPerfModel();
                
                
                
            //     const optionsToSelect = [{selectedConfig}];
            //     if(optionsToSelect.length > 0) {
            //         const selectedOptions = new Set();
            //         optionsToSelect.forEach(entry => {
            //             selectedOptions.add(entry.option);
            //         });
            //                        
            //         const rowsToSelect = perfModelTable.getRows().filter(row => {
            //             const options = new Set(); 
            //             row.getData().option.split(",").forEach(entry => {
            //                 options.add(entry.split(" ")[0]);
            //             })
            //             return subset(options, selectedOptions);
            //         });
            //         rowsToSelect.forEach(row => row.select());
            //     }
            //    
            //     let time = +document.getElementById("defaultExecutionTime").textContent.split(" ")[3];
            //     const selectedRows = perfModelTable.getRows().filter(row => row.isSelected());              
            //     selectedRows.forEach(row => {
            //         let influenceStr = row.getData().influence;
            //         let influence = influenceStr.replace("+","");
            //         influence = +influence.replace("-","");
            //         if(influenceStr.includes('+')) {
            //             time += influence;
            //         }
            //         else {
            //             time -= influence;
            //         }
            //     });
            //     document.getElementById("selected-config-name").innerHTML = "<b>Selected configuration:</b> " + {selectedConfigName}.name;
            //     document.getElementById("selected-config-time").innerHTML = "<b>Execution time:</b> " + Math.max(0, time).toFixed(2) + " seconds";
            //    
            //     perfModelTable.getRows().forEach(row => {
            //        if(!selectedRows.includes(row)) {
            //            row.delete();
            //        } 
            //     });
            //     perfModelTable.getRows().forEach(row => {
            //        row.deselect();
            //     });
            //
            //
            //     // document.getElementById("view-influence-trigger").addEventListener("click", function(){
            //     //     const config = document.getElementById("configSelect").value;                 
            //     //     vscode.postMessage({
            //     //         command: 'viewGlobalInfluence',
            //     //         config: config
            //     //     });
            //     // });
            //    
            //     function subset(subset, set) {
            //         for(let elem of subset) {
            //             if(!set.has(elem)) {
            //                 return false;
            //             }
            //         }
            //         return true;
            //     }
            //                                   
            //     document.getElementById("profile-config-trigger").addEventListener("click", function () {    
            //         vscode.postMessage({
            //             command: 'profile'
            //         });
            //     });
            //    
            //     document.getElementById("local-influence-trigger").addEventListener("click", function () {    
            //         vscode.postMessage({
            //             command: 'localInfluence'
            //         });
            //     });
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
    let perfModel = "[";
    for (let i = 0; i < rawPerfModel.length; i++) {
        perfModel = perfModel.concat(' { "options": [');
        const optionsRaw = rawPerfModel[i][0];
        const options = optionsRaw.split(",");
        for (let j = 0; j < options.length; j++) {
            perfModel = perfModel.concat('{ "option": "');
            const optionRaw = options[j];
            perfModel = perfModel.concat(optionRaw.substring(0, optionRaw.indexOf("(")));
            perfModel = perfModel.concat('", "from": "');
            perfModel = perfModel.concat(optionRaw.substring(optionRaw.indexOf("(") + 1, optionRaw.indexOf("-")));
            perfModel = perfModel.concat('", "to": "');
            perfModel = perfModel.concat(optionRaw.substring(optionRaw.indexOf("-") + 1, optionRaw.indexOf(")")));
            perfModel = perfModel.concat('"}, ');
        }
        perfModel = perfModel.concat('], "sign": "');
        perfModel = perfModel.concat(rawPerfModel[i][1]);
        perfModel = perfModel.concat('", "influence": "');
        perfModel = perfModel.concat(rawPerfModel[i][2]);
        perfModel = perfModel.concat('" },');
    }
    return perfModel.concat("]");
}

// function getPerfModel(rawPerfModel: string[]) {
//     let result = "";
//     rawPerfModel.forEach((entry) => {
//         result = result.concat("{ option: \"");
//         result = result.concat(entry[0]);
//         result = result.concat("\", influence: \"");
//         result = result.concat(entry[1]);
//         result = result.concat("\" }, ");
//     });
//     return result;
// }

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