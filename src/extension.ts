// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {DocumentSymbol, Selection, SymbolKind, TextEditorRevealType, ThemeColor} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let focusStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new ThemeColor('editor.rangeHighlightBackground')
});
let traceStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});

let CONFIG_TO_PROFILE: string = '';
let CONFIG_TO_COMPARE: string = '';
let METHOD_TO_PROFILE: string = '';
let OPTIONS_TO_ANALYZE: string[] = [];

let globalModelPanel: vscode.WebviewPanel | undefined = undefined;
let profilePanel: vscode.WebviewPanel | undefined = undefined;
let slicingPanel: vscode.WebviewPanel | undefined = undefined;

let NAMES_2_CONFIGS: string | undefined = undefined;
let NAMES_2_LOCAL_MODELS: string = '';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "perf-debug" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const configDialog = vscode.commands.registerCommand('execTime.start', () => _configDialog(context));
    const perfProfiles = vscode.commands.registerCommand('profiles.start', () => _perfProfiles(context));
    context.subscriptions.push(configDialog, perfProfiles);
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension "perf-debug"');
    if (traceStyle !== undefined) {
        traceStyle.dispose();
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
        'execTime', // Identifies the type of the webview. Used internally
        'Execution Time', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const allConfigsRaw = getAllConfigsRaw(dataDir);
    const names2ConfigsRaw = getNames2ConfigsRaw(dataDir);
    const optionValuesRaw = getOptionsValuesRaw(dataDir);
    panel.webview.html = getConfigDialogContent(allConfigsRaw, names2ConfigsRaw, optionValuesRaw);

    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
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
                            vscode.window.showInformationMessage("Configuration saved");
                        }
                    });
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getAllConfigsRaw(dataDir: string) {
    let configs: string[] = [];
    fs.readdirSync(path.join(dataDir, 'configs/')).forEach(fileName => {
        if (fileName.endsWith('user.csv')) {
            fileName = fileName.replace(".csv", "");
            configs.push(fileName);
        }
    });
    return configs;
}

function getConfigsProfile(rawConfigs: string[]) {
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat('" ');
        configs = configs.concat(config === CONFIG_TO_PROFILE ? 'selected="selected"' : '');
        configs = configs.concat(">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }
    return configs;
}

function getConfigsCompare(rawConfigs: string[]) {
    let configs = "";
    for (const config of rawConfigs) {
        configs = configs.concat("<option value=\"");
        configs = configs.concat(config);
        configs = configs.concat('" ');
        let selected = '';
        if (CONFIG_TO_COMPARE.length === 0) {
            if (config !== CONFIG_TO_PROFILE) {
                selected = 'selected="selected"';
            }
        } else if (config === CONFIG_TO_COMPARE) {
            selected = 'selected="selected"';
        }
        configs = configs.concat(selected);
        configs = configs.concat(">");
        configs = configs.concat(config);
        configs = configs.concat("</option>");
    }
    return configs;
}

function getNames2Configs(names2ConfigsRaw: any) {
    if (!NAMES_2_CONFIGS) {
        NAMES_2_CONFIGS = '{';
        for (let i = 0; i < names2ConfigsRaw.length; i++) {
            NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('"');
            NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat(names2ConfigsRaw[i].config);
            NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('": [');
            for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
                NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('{ option : "');
                NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat(names2ConfigsRaw[i].value[j][0]);
                NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('", value: "');
                NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat(names2ConfigsRaw[i].value[j][1]);
                NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('"}, ');
            }
            NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('],');
        }
        NAMES_2_CONFIGS = NAMES_2_CONFIGS.concat('}');
    }
    return NAMES_2_CONFIGS;
}

function getConfigDialogContent(rawConfigs: string[], names2ConfigsRaw: any, optionValuesRaw: any[]) {
    const configs = getConfigsProfile(rawConfigs);

    const rawConfigRaw = '{config: "' + rawConfigs[0] + '"}';

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

    const names2Configs = getNames2Configs(names2ConfigsRaw);

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
        <div style="font-size: 16px;"><b>Get the execution time of a configuration</b></div>
        <br>
        <div id="saveConfig"></div>
        <br>
        <div><button id="save-config-trigger">Save configuration</button></div>
        <br>
        <script type="text/javascript">     
            const rawConfigs = ${rawConfigRaw};
            const names2Configs = ${names2Configs};
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
            const config = rawConfigs['config'];
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
            }())
        </script>
    </body>
    </html>`;
}

function getSliceInfoRaw(dataDir: string) {
    const sliceInfo = parse(fs.readFileSync(path.join(dataDir, 'sliceInfo.csv'), 'utf8'))[0];
    return {programName: sliceInfo[0], port: sliceInfo[1]};
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
        'Hot Spots', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {
            enableScripts: true,
            retainContextWhenHidden: true // Might be expensive
        } // Webview options. More on these later.
    );

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const allConfigsRaw = getAllConfigsRaw(dataDir);
    const names2ConfigsRaw = getNames2ConfigsRaw(dataDir);
    const methods2ModelsRaw = getMethods2ModelsRaw(dataDir);
    profilePanel.webview.html = getHotspotDiffContent(allConfigsRaw, names2ConfigsRaw, methods2ModelsRaw);

    const sliceInfoRaw = getSliceInfoRaw(dataDir);
    const programName = sliceInfoRaw.programName;
    const filesRoot = workspaceFolders[0].uri.path + '/src/main/java/';

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
                    const res = request('POST', 'http://localhost:8001/diff',
                        {
                            json: {
                                programName: programName,
                                config1: config1,
                                config2: config2
                            }
                        }
                    );
                    const response = JSON.parse(res.getBody() + "");
                    profilePanel.webview.postMessage({response: response.data});
                    return;
                case 'open-influence' :
                    CONFIG_TO_PROFILE = message.config;
                    CONFIG_TO_COMPARE = message.compare;
                    METHOD_TO_PROFILE = message.method;
                    OPTIONS_TO_ANALYZE = message.options;
                    if (globalModelPanel) {
                        globalModelPanel.dispose();
                    }
                    vscode.commands.executeCommand('globalModel.start');
                    return;
                case 'open-hotspot' :
                    let methodData = message.method;
                    methodData = methodData.substring(0, methodData.indexOf("("));
                    const fileData = methodData.split(".");
                    let className = '';
                    for (let i = 0; i < (fileData.length - 1); i++) {
                        className = className.concat(fileData[i]);
                        if (i < (fileData.length - 2)) {
                            className = className.concat("/");
                        }
                    }
                    if (className.indexOf("$") >= 0) {
                        className = className.substring(0, className.indexOf("$"));
                    }

                    const method = fileData[fileData.length - 1];
                    let uri = vscode.Uri.file(filesRoot + className + '.java');
                    openFileAndNavigate(uri, method);
                    return;
                case 'trace' :
                    OPTIONS_TO_ANALYZE = message.options;
                    METHOD_TO_PROFILE = message.method;
                    if (slicingPanel) {
                        slicingPanel.dispose();
                    }
                    vscode.commands.executeCommand('slicing.start');
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

function openFileAndNavigate(uri: vscode.Uri, method: string) {
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
                        editor.setDecorations(focusStyle, [symbol.range]);
                        editor.revealRange(symbol.range, TextEditorRevealType.InCenter);
                        editor.selection = new Selection(symbol.range.start, symbol.range.start);
                    });
            });
    });
}

function getHotspotDiffContent(rawConfigs: string[], names2ConfigsRaw: any, methods2ModelsRaw: any) {
    const leftConfigs = getConfigsProfile(rawConfigs);
    const rightConfigs = getConfigsCompare(rawConfigs);
    const names2LocalModels = getNames2LocalModels(names2ConfigsRaw, methods2ModelsRaw);
    const methodToProfile = getMethodToProfile();
    const optionsToAnalyze = getOptionsToAnalyze();

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
        <div style="font-size: 16px;"><b>Compare hot spot profiles between configurations</b></div>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${leftConfigs}
            </select>
        </div>
        <div style="display: inline; font-size: 14px;">compare to: </div>
        <div style="display: inline;">
            <select name="compareSelect" id="compareSelect">
                ${rightConfigs}
            </select>
        </div>
        <div style="display: inline; margin-left: 20px;">
            <input type="checkbox" id="all-hotspots" name="all-hotspots">
            <label for="all-hotspots">View all hotspots</label>
        </div>
        <br>
        <br>
        <div id="hotspot-diff-table"></div>
        <br>
        <br>
        <div id="influence-table-text" style="font-size: 14px;"></div>
<!--        <br>-->
        <div id="influencingOptions"></div>
        <br>
<!--        <hr>-->
        <br>
        <div style="display: inline;"><button id="trace-trigger">Trace Options to Hotspots</button></div>
        <script type="text/javascript">                  
            (function () {
                const vscode = acquireVsCodeApi();
                const names2LocalModels = ${names2LocalModels};
                const methodToProfile = ${methodToProfile}.method;
                const optionsToAnalyze = ${optionsToAnalyze}.options;
                let selectedRow = undefined;
                
                document.getElementById("configSelect").addEventListener("change", () => {
                    compareProfiles();
                });
                
                document.getElementById("compareSelect").addEventListener("change", () => {
                    compareProfiles();
                });
                                
                const influencingOptionsTable = new Tabulator("#influencingOptions", {
                    layout: "fitColumns",
                    maxHeight:"300px",
                    // groupBy:"change",
                    groupStartOpen:function(value){
                        return value === 'Actual Influencing Options Changes';
                    },
                    columns: [
                        { title: "Options", field: "option", sorter: "string", formatter: formatInteractions }, 
                        { title: "Influence (s)", field: "influence", sorter: influenceSort, hozAlign:"right" },
                        { formatter:optionsInfluenceButton, hozAlign:"center", cellClick:openInfluence },
                        { title: "Change",  field: "change" },
                    ],
                });
                influencingOptionsTable.hideColumn('change');            
                
                function optionsInfluenceButton() { 
                    return "<button>View Options' Influence</button>";
                }
                
                function openInfluence(e, cell){
                    influencingOptionsTable.getRows().forEach(row => {
                        row.deselect();    
                    });
                    cell.getRow().select();
                    
                    const row = cell.getRow();
                    const options = new Set();
                    row.getData().option.split(',').forEach(optionRaw => {
                       if(optionRaw.length > 0) {
                           options.add(optionRaw.split(' ')[0]);
                       } 
                    });
                    
                    let method = selectedRow.getData().methodLong;
                    method = method.substring(0, method.indexOf("("));
                    vscode.postMessage({
                        command: 'open-influence',
                        config: document.getElementById("configSelect").value,
                        compare: document.getElementById("compareSelect").value,
                        options: Array.from(options),
                        method: method
                    });
                }
                
                function influenceSort(a, b) {
                    let one = a.replace("+","");
                    one = one.replace("-","");
                    let two = b.replace("+","");
                    two = two.replace("-","");
                    return (+one) - (+two);
                }
                
                function formatInteractions(cell) {
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
                                               
                const table = new Tabulator("#hotspot-diff-table", {
                    layout:"fitData",
                    // layout:"fitColumns",
                    maxHeight:"300px",
                    dataTree:true,
                    dataTreeStartExpanded:false,
                    movableColumns: true, 
                    selectable: true,
                    rowFormatter: formatBackground,
                    rowClick:openFile,
                    rowSelectionChanged:showInfluence,
                    columns: [
                        {title: "Hot Spot", field: "method", sorter: "string"},
                        {title: document.getElementById("configSelect").value, field: "config1", sorter: "number", hozAlign: "right"},
                        {title: document.getElementById("compareSelect").value, field: "config2", sorter: "number", hozAlign: "right"},
                        {title: "hotspot", field: "hotspot"},
                        {title: "methodLong", field: "methodLong"}
                    ],
                }); 
                table.hideColumn("hotspot");
                table.hideColumn("methodLong");
                
                function formatBackground(row) {
                    const rowData = row.getData();
                    const config1 = rowData.config1;
                    const config2 = rowData.config2;
                    
                    if(config1 === "No entry" || config2 === "No entry"){
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
                
                function openFile(e, row){
                    const file = row.getData().methodLong;
                    vscode.postMessage({
                        command: 'open-hotspot',
                        method: file,
                    }); 
                }
                
                function showInfluence(data, rows) {
                    if(rows.length === 0) {
                        influencingOptionsTable.setData([]);
                        document.getElementById("trace-trigger").innerHTML = traceButtonText([], '');
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
                    
                    let method = selectedRow.getData().methodLong;
                    method = method.substring(0, method.indexOf("("));
                    const config = document.getElementById("configSelect").value;
                    const models = names2LocalModels[config];
                    let influence = [];
                    models.forEach(model => {
                        if(model.method === method) {
                            influence = model.model;
                        }
                    });
                    influencingOptionsTable.setData(influence);
                    influencingOptionsTable.setSort("influence", "desc");
                    
                    const compare = document.getElementById("compareSelect").value;
                    names2LocalModels[compare].forEach(model => {
                        if(model.method === method) {
                            influence = model.model;
                        }
                    });
                    if(config !== compare) {
                        influencingOptionsTable.getRows().forEach(row => {
                            let newData = '';
                            row.getData().option.split(',').forEach(option => {
                                if(option.length > 0) {
                                    let inversedSelection = '';
                                    const optionEntries = option.split(' ');
                                    let to = optionEntries[3];
                                    to = to.substring(0, to.length-1)
                                    let from = optionEntries[1];
                                    from = from.substring(1);
                                    inversedSelection = inversedSelection.concat(optionEntries[0] + ' [' + to + ' --> ' + from + '],');
                                    let foundTerm = false;
                                    influence.forEach(term => {
                                        if(inversedSelection === term.option) {
                                            foundTerm = true;
                                        }
                                    });
                                    if(foundTerm) {
                                        newData = newData.concat(option.replace('-->','➤'));
                                    }
                                    else {
                                        newData = newData.concat(option);
                                    }
                                    newData = newData.concat(',');
                                }
                            });
                            influencingOptionsTable.addRow({option:newData, influence: row.getData().influence});
                            row.delete();
                        });
                        
                        influencingOptionsTable.getRows().forEach(row => {
                            let wasActuallyChanged = true;
                            row.getData().option.split(',').forEach(option => {
                                if(option.length > 0) {
                                    const optionEntries = option.split(' ');
                                    if(optionEntries[2] === '-->') {
                                        wasActuallyChanged = false;
                                    }
                                }
                            });
                            if(wasActuallyChanged) {
                                // row.getElement().style.color = '#07ce00';
                                // row.update({change: 'Actual Influencing Options Changes'});
                            }
                            else {
                                // row.update({change: 'Further Possible Changes'});
                                row.delete();
                            }
                        });
                        
                        influencingOptionsTable.setSort("option", "asc");
                        influencingOptionsTable.setSort("influence", "desc");
                        // influencingOptionsTable.setSort(
                        //      {column:"change", dir:"des"},
                        //      {column:"influence", dir:"des"},
                        // );
                    }
                    
                    const methodEntries = method.split('.');
                    method = methodEntries[methodEntries.length - 2] + '.' + methodEntries[methodEntries.length - 1];
                    document.getElementById("trace-trigger").innerHTML = traceButtonText([], method);
                    
                    influencingOptionsTable.getRows().forEach(row => {
                        const selectedOptions = new Set();
                        row.getData().option.split(',').forEach(optionRaw => {
                            if(optionRaw.length > 0) {
                                selectedOptions.add(optionRaw.split(' ')[0]);
                            }
                        }); 
                        if(optionsToAnalyze.sort().join(',') === Array.from(selectedOptions).sort().join(',')) {
                            row.select();
                            document.getElementById("trace-trigger").innerHTML = traceButtonText(optionsToAnalyze, method);
                        }
                    });
                }
                
                function traceButtonText(options, method) { 
                    if(options.length === 0 && method === '') {
                        return "Trace Options to Hotspots";
                    }
                    if(options.length === 0) {
                        return 'Trace Options to ' + method + '(...)';
                    }
                    if(method === '') {
                        return 'Trace ' + options + ' to Hotspots';
                    }
                   return 'Trace ' + options + ' to ' + method + '(...)';
                }
                
                function compareProfiles() {
                    const configs = [];
                    configs.push(document.getElementById("configSelect").value);
                    configs.push(document.getElementById("compareSelect").value);
                    vscode.postMessage({
                        command: 'diff',
                        configs: configs
                    });
                }
                compareProfiles();
                
                window.addEventListener('message', event => {
                    table.hideColumn("hotspot");
                    table.hideColumn("methodLong");
                    table.hideColumn("config1");
                    table.hideColumn("config2");
                    
                    const configToSelect = document.getElementById("configSelect").value;
                    const compareSelect = document.getElementById("compareSelect").value
                    
                    if(configToSelect === compareSelect) {
                        document.getElementById("influence-table-text").innerHTML = "<b>Options and their influence when changing values in " + configToSelect + " in the selected method above";
                    }
                    else {
                        document.getElementById("influence-table-text").innerHTML = "<b>Options and their influence when changing values from " + configToSelect + " ➤ " + compareSelect + " in the selected method above</b>";
                    }
                    
                    table.addColumn({title:configToSelect, field:"config1", sorter: "number", hozAlign: "right"});
                    table.addColumn({title:compareSelect, field:"config2", sorter: "number", hozAlign: "right"});
                    if(configToSelect === compareSelect) {
                        table.hideColumn("config2");
                    }
                    
                    const resp = event.data.response;
                    table.setData(resp);
                    table.setSort("config1", "desc");
                                                            
                    table.getRows().forEach(row => {
                        if(methodToProfile.length > 0 && row.getData().methodLong.startsWith(methodToProfile)) {
                            row.select();
                        }
                        else if(!document.getElementById("all-hotspots").checked) {
                            row.delete();
                        }
                    });
                });
                
                document.getElementById("all-hotspots").addEventListener("change", () => {
                    console.l9og
                    compareProfiles();
                });
                
                document.getElementById("trace-trigger").addEventListener("click", () => {                   
                    const selectedOptions = new Set();
                    influencingOptionsTable.getRows().forEach(row => {
                        if(row.isSelected()) {
                            row.getData().option.split(',').forEach(optionRaw => {
                                if(optionRaw.length > 0) {
                                    selectedOptions.add(optionRaw.split(' ')[0]);
                                }
                            }); 
                        }
                    });
                    
                    let method = '';
                    table.getRows().forEach(row => {
                        if(row.isSelected()) {
                            method = row.getData().methodLong;
                            method = method.substring(0, method.indexOf('('));
                        }
                    });
                    
                    vscode.postMessage({
                        command: 'trace',
                        options: Array.from(selectedOptions),
                        method: method
                    });
                });
            }())
        </script>
    </body>
    </html>`;
}

function getOptionsValuesRaw(dataDir: string) {
    return parse(fs.readFileSync(dataDir + '/options.csv', 'utf8'));
}

function getNames2ConfigsRaw(dataDir: string) {
    let names2Configs: any[] = [];
    fs.readdirSync(path.join(dataDir, 'configs')).forEach(file => {
        const config = path.parse(file).name;
        const value = parse(fs.readFileSync(path.join(dataDir, 'configs/' + file), 'utf8'));
        names2Configs.push({config: config, value: value});
    });
    return names2Configs;
}

function getMethods2ModelsRaw(dataDir: string) {
    let method2Models: Method2Model[] = [];
    fs.readdirSync(path.join(dataDir, 'localModels')).forEach(file => {
        const method = path.parse(file).name;
        const perfModels = require(path.join(dataDir, 'localModels', file));
        method2Models.push({method: method, models: perfModels});
    });
    return method2Models;
}

function getNames2LocalModels(names2ConfigsRaw: any, methods2ModelsRaw: any) {
    if (NAMES_2_LOCAL_MODELS.length === 0) {
        NAMES_2_LOCAL_MODELS = '{';
        for (let i = 0; i < names2ConfigsRaw.length; i++) {
            NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('"');
            NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(names2ConfigsRaw[i].config);
            NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('": ');
            const config = new Map<string, string>();
            for (let j = 0; j < names2ConfigsRaw[i].value.length; j++) {
                config.set(names2ConfigsRaw[i].value[j][0], names2ConfigsRaw[i].value[j][1]);
            }
            NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('[');
            methods2ModelsRaw.forEach((localModelRaw: any) => {
                NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('{ method : "');
                NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(localModelRaw.method);
                NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('", model: ');

                const localModel = getPerfModel(localModelRaw.models, names2ConfigsRaw[i].config);
                const localModelEval = eval(localModel);
                NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('[');
                localModelEval.forEach((entry: any) => {
                    NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('{ option : "');
                    entry.options.forEach((option: any) => {
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(option.option);
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(" [");
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(option.from);
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(" --> ");
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(option.to);
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('],');
                    });
                    NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('", influence: "');
                    const value = +entry.influence;
                    if (value >= 0) {
                        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('+');
                    }
                    NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(value.toFixed(2));
                    NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('"}, ');
                });
                NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat(']}, ');
            });
            NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('],');
        }
        NAMES_2_LOCAL_MODELS = NAMES_2_LOCAL_MODELS.concat('}');
    }
    return NAMES_2_LOCAL_MODELS;
}

function getOptionsToAnalyze() {
    let optionsToAnalyze = '{ options: [';
    OPTIONS_TO_ANALYZE.forEach(option => {
        optionsToAnalyze = optionsToAnalyze.concat('"');
        optionsToAnalyze = optionsToAnalyze.concat(option);
        optionsToAnalyze = optionsToAnalyze.concat('", ');
    });
    optionsToAnalyze = optionsToAnalyze.concat('] }');
    return optionsToAnalyze;
}

function getMethodToProfile() {
    return '{ method: "' + METHOD_TO_PROFILE + '" }';
}

function getPerfModel(rawPerfModels: any, config: string) {
    let rawPerfModel: any[] = [];
    rawPerfModels.models.forEach((rawModel: { name: string; terms: any[]; }) => {
        if (rawModel.name === config) {
            rawPerfModel = rawModel.terms;
        }
    });
    let perfModel = "[";
    for (let i = 0; i < rawPerfModel.length; i++) {
        const optionsRaw = rawPerfModel[i].options;
        if (optionsRaw.length === 0) {
            continue;
        }
        perfModel = perfModel.concat(' { "options": [');
        for (let j = 0; j < optionsRaw.length; j++) {
            perfModel = perfModel.concat('{ "option": "');
            const optionRaw = optionsRaw[j];
            perfModel = perfModel.concat(optionRaw.option);
            perfModel = perfModel.concat('", "from": "');
            perfModel = perfModel.concat(optionRaw.from);
            perfModel = perfModel.concat('", "to": "');
            perfModel = perfModel.concat(optionRaw.to);
            perfModel = perfModel.concat('"}, ');
        }
        perfModel = perfModel.concat('], "influence": "');
        perfModel = perfModel.concat(rawPerfModel[i].time);
        perfModel = perfModel.concat('" },');
    }
    return perfModel.concat("]");
}

interface Method2Model {
    method: string
    models: string[]
}