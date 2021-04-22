// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {DocumentSymbol, Selection, SymbolKind, TextEditorRevealType, WorkspaceFolder} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let commonSources: { [p: string]: string[] } = {};
let targetClass = "";
let target: number = -1;

let traceStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});
let hotspotStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,0,0,0.25)'});
let sourceStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(0,255,0,0.25)'});
let filesToHighlight = new Map<string, Set<string>>();

let CONFIG_TO_PROFILE: string = '';
let CONFIG_TO_COMPARE: string = '';
let METHOD_TO_PROFILE: string = '';
let OPTIONS_TO_ANALYZE: string[] = [];

let globalModelPanel: vscode.WebviewPanel | undefined = undefined;
let profilePanel: vscode.WebviewPanel | undefined = undefined;
let slicingPanel: vscode.WebviewPanel | undefined = undefined;

let NAMES_2_CONFIGS: string | undefined = undefined;
let NAMES_2_PERF_MODELS: string = '';
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
    const configDialog = vscode.commands.registerCommand('configDialog.start', () => _configDialog(context));
    const globalModel = vscode.commands.registerCommand('globalModel.start', () => _globalModel(context));
    const perfProfiles = vscode.commands.registerCommand('perfProfiles.start', () => _perfProfiles(context));
    const slicingTarget = vscode.commands.registerCommand('sliceTarget.start', () => _sliceTarget(context));
    const slicing = vscode.commands.registerCommand('slicing.start', () => _slicing(context));
    context.subscriptions.push(configDialog, globalModel, perfProfiles, slicingTarget, slicing);
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
        'configDialog', // Identifies the type of the webview. Used internally
        'Configuration Dialog', // Title of the panel displayed to the user
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
                case 'globalInfluence' :
                    CONFIG_TO_PROFILE = message.config;
                    CONFIG_TO_COMPARE = message.compare;
                    if (globalModelPanel) {
                        globalModelPanel.dispose();
                    }
                    vscode.commands.executeCommand('globalModel.start');
                    return;
                case 'profile' :
                    CONFIG_TO_PROFILE = message.config;
                    CONFIG_TO_COMPARE = message.compare;
                    if (profilePanel) {
                        profilePanel.dispose();
                    }
                    vscode.commands.executeCommand('perfProfiles.start');
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
        if (fileName.endsWith('.csv')) {
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
    const names2Configs = getNames2Configs(names2ConfigsRaw);

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
        <div style="font-size: 16px;"><b>View values selected in each configuration</b></div>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect" onchange="displayConfig()">
                ${configs}
            </select>
        </div>
        <div style="display: inline; font-size: 14px;">compare to: </div>
        <div style="display: inline;">
            <select name="compareSelect" id="compareSelect" onchange="displayConfig()">
                ${configs}
            </select>
        </div>
        <br>
        <br>
        <div id="displayConfig"></div>
        <br>
        <br>
        <div style="display: inline; padding-right: 10px;"><button id="global-influence-trigger">View Options' Influence</button></div>
        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>
        <br>
        <br>
        <br>
        <br>
        <hr>
        <br>
        <div><button id="show-save-config-trigger">Save new configuration</button></div>
        <div style="display: inline; font-size: 14px; visibility: hidden;" id="save-new-config-text"><b>Save new configuration:</b></div> 
        <input style="visibility: hidden;" type="text" id="config-name" name="config-name" placeholder="Enter name">
        <br>
        <br>
        <div id="saveConfig" style="visibility: hidden;"></div>
        <br>
        <div style="visibility: hidden;"><button id="save-config-trigger">Save configuration</button></div>
        <br>
        <script type="text/javascript">     
            const names2Configs = ${names2Configs};
                             
            const configTable = new Tabulator("#displayConfig", {
                layout: "fitColumns",
                columns: [
                    { title: "Option", field: "option", sorter: "string" }, 
                    { title: document.getElementById("configSelect").value,  field: "config1",  sorter: "string" },
                    { title: document.getElementById("compareSelect").value,  field: "config2",  sorter: "string" }
                ],
            });
                        
            function displayConfig() {
                configTable.hideColumn("config1");
                configTable.hideColumn("config2");
                
                const config = document.getElementById("configSelect").value;
                const compare = document.getElementById("compareSelect").value;
                configTable.addColumn({title:config, field: "config1",  sorter: "string" });
                configTable.addColumn({title:compare, field: "config2",  sorter: "string" });
                if(config === compare) {
                    configTable.hideColumn("config2");
                }
                
                const configValues = names2Configs[config];
                const compareValues = names2Configs[compare];
                
                const values = new Map();
                configValues.forEach(entry => {
                    values.set(entry.option, [entry.value]);
                });
                compareValues.forEach(entry => {
                    values.get(entry.option).push(entry.value);
                });
                
                let data = [];
                values.forEach((value, key) => {
                    data.push({option: key, config1: value[0], config2: value[1]});
                });
                configTable.setData(data);
                
                configTable.getRows().forEach(row => {
                    if(config !== compare && row.getData().config1 === row.getData().config2) {
                        row.getElement().style.color = '#bfbfbf';
                    }
                });
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
            
            document.getElementById("show-save-config-trigger").addEventListener("click", function () {
                document.getElementById("show-save-config-trigger").style.display = "none";
                document.getElementById("save-new-config-text").style.visibility = "visible";
                document.getElementById("config-name").style.visibility = "visible";
                document.getElementById("saveConfig").style.visibility = "visible";
                document.getElementById("save-config-trigger").style.visibility = "visible";
            });
                        
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
                        command: 'globalInfluence',
                        config: document.getElementById("configSelect").value,
                        compare: document.getElementById("compareSelect").value,
                    });
                });
                
                document.getElementById("profile-config-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'profile',
                        config: document.getElementById("configSelect").value,
                        compare: document.getElementById("compareSelect").value,
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

    const dataDir = path.join(workspaceFolders[0].uri.path, '.data');
    const methods2Lines = getMethods2Lines(dataDir);
    methods2Lines.forEach((value, key) => {
        if ((targetClass + ':' + target) === value) {
            METHOD_TO_PROFILE = key;
        }
    });

    if (slicingPanel) {
        slicingPanel.dispose();
    }
    vscode.commands.executeCommand('slicing.start');
}

function getShortSliceMethod(method: string) {
    const entries = method.split('.');
    return entries[entries.length - 2] + "." + entries[entries.length - 1] + "(...)";
}

function getSliceConnections(connections: any[], targetMethodName: string) {
    let short2Methods = new Map<string, string>();
    let sliceConnections = '';
    sliceConnections = sliceConnections.concat('"');
    sliceConnections = sliceConnections.concat(getShortSliceMethod(commonSources[OPTIONS_TO_ANALYZE[0]][0]));
    sliceConnections = sliceConnections.concat('"');
    sliceConnections = sliceConnections.concat(' [fillcolor=lawngreen style=filled] ');
    sliceConnections = sliceConnections.concat('"');
    targetMethodName = targetMethodName.substring(0, targetMethodName.indexOf("("));
    sliceConnections = sliceConnections.concat(getShortSliceMethod(targetMethodName));
    sliceConnections = sliceConnections.concat('"');
    sliceConnections = sliceConnections.concat(' [fillcolor=lightsalmon2 style=filled] ');

    connections.forEach(entry => {
        let source = entry.source;
        source = source.substring(0, source.indexOf("("));
        let target = entry.target;
        target = target.substring(0, target.indexOf("("));
        const shortSource = getShortSliceMethod(source);
        const shortTarget = getShortSliceMethod(target);
        short2Methods.set(shortSource, source);
        short2Methods.set(shortTarget, target);

        sliceConnections = sliceConnections.concat('"');
        sliceConnections = sliceConnections.concat(shortSource);
        sliceConnections = sliceConnections.concat('" -> "');
        sliceConnections = sliceConnections.concat(shortTarget);
        sliceConnections = sliceConnections.concat('" ');
    });
    return {connections: sliceConnections, key: JSON.parse(JSON.stringify([...short2Methods]))};
}

function getHotspotInfluencesRaw(dataDir: string) {
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

function getSliceSourcesRaw(dataDir: string) {
    let sources: { [key: string]: string[]; } = {};
    parse(fs.readFileSync(path.join(dataDir, 'tracing', 'sources.csv'), 'utf8')).forEach((entry: string[]) => {
        const methodEntries = entry[0].split('.');
        let shortMethod = '';
        // for (let i = 0; i < (methodEntries.length - 2); i++) {
        //     shortMethod = shortMethod.concat(methodEntries[i][0]);
        //     shortMethod = shortMethod.concat(".");
        // }
        shortMethod = shortMethod.concat(methodEntries[methodEntries.length - 2]);
        shortMethod = shortMethod.concat('.');
        shortMethod = shortMethod.concat(methodEntries[methodEntries.length - 1]);

        let shortMethodSlice = '';
        for (let i = 0; i < (methodEntries.length - 2); i++) {
            shortMethodSlice = shortMethodSlice.concat(methodEntries[i]);
            shortMethodSlice = shortMethodSlice.concat(".");
        }

        shortMethodSlice = shortMethodSlice.concat(methodEntries[methodEntries.length - 2]);
        sources[entry[1]] = [shortMethod, entry[2], shortMethodSlice];
    });
    return sources;
}

function getMethods2Options(methods2ModelsRaw: any[]) {
    const methods2Options = new Map<string, string[]>();
    methods2ModelsRaw.forEach(entry => {
        const uniqueOptions = new Set<string>();
        entry.models.models.forEach((term: any) => {
            term.terms.forEach((options: any) => {
                options.options.forEach((option: any) => {
                    uniqueOptions.add(option.option);
                });
            });
        });
        methods2Options.set(entry.method, Array.from(uniqueOptions));
    });
    return methods2Options;
}

function getMethods2Lines(dataDir: string) {
    let methods2Lines = new Map<string, string>();
    parse(fs.readFileSync(path.join(dataDir, 'tracing', 'targetMethods.csv'), 'utf8')).forEach((entry: string[]) => {
        methods2Lines.set(entry[0], entry[1]);
    });
    return methods2Lines;
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
    const methods2ModelsRaw = getMethods2ModelsRaw(dataDir);
    const methods2Options = getMethods2Options(methods2ModelsRaw);
    const methods2Lines = getMethods2Lines(dataDir);
    commonSources = getSliceSourcesRaw(dataDir);
    const legend = vscode.Uri.file(path.join(context.extensionPath, 'media', 'legend.png'));
    slicingPanel.webview.html = getSlicingContent(methods2Options, methods2Lines, slicingPanel.webview.asWebviewUri(legend));

    const sliceInfoRaw = getSliceInfoRaw(dataDir);
    const port = sliceInfoRaw.port;
    const filesRoot = workspaceFolders[0].uri.path + '/src/main/java/';
    const regex = /\./g;
    // Handle messages from the webview
    slicingPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'link': {
                    const className = message.method.substring(0, message.method.lastIndexOf('.')).replace(regex, '/');
                    const method = message.method.substring(message.method.lastIndexOf('.') + 1);
                    let uri = vscode.Uri.file(filesRoot + className + '.java');
                    openFileAndNavigate(uri, method);
                    return;
                }
                case 'slice': {
                    OPTIONS_TO_ANALYZE = message.selectedOptions;
                    if (!message.target) {
                        targetClass = "";
                        target = -1;
                        METHOD_TO_PROFILE = '';
                    } else {
                        methods2Lines.forEach((value, key) => {
                            if ((targetClass + ':' + target) === value) {
                                METHOD_TO_PROFILE = key;
                            }
                        });
                    }

                    if (!slicingPanel) {
                        return;
                    }
                    if (message.selectedOptions.length === 0 || targetClass === "" || target <= 0) {
                        filesToHighlight.clear();
                        traceStyle.dispose();
                        slicingPanel.webview.postMessage({connections: {}});
                        return;
                    }

                    let lines: number[] = [];
                    message.selectedOptions.forEach((option: string) => {
                        lines.push(+commonSources[option][1]);
                    });

                    const res = request('POST', 'http://localhost:' + port + '/slice',
                        {
                            json: {
                                sourceClass: (commonSources[message.selectedOptions[0]][2].replace(regex, '/') + '.java'),
                                sourceLines: lines,
                                targetClass: targetClass,
                                targetLines: target,
                            }
                        }
                    );
                    const response = JSON.parse(res.getBody() + "");
                    setFilesToHighlight(response.slice);
                    slicingPanel.webview.postMessage({
                        connections: getSliceConnections(response.connections, response.targetMethodName),
                        targetMethodName: response.targetMethodName
                    });

                    // const className = commonSources[message.selectedOptions[0]][2].replace(regex, '/');
                    // const method = 'main';
                    // let uri = vscode.Uri.file(filesRoot + className + '.java');
                    // openFileAndNavigate(uri, method);
                    return;
                }
                case 'globalInfluence' :
                    OPTIONS_TO_ANALYZE = message.options;
                    METHOD_TO_PROFILE = message.target.substring(0, message.target.indexOf("("));
                    if (globalModelPanel) {
                        globalModelPanel.dispose();
                    }
                    vscode.commands.executeCommand('globalModel.start');
                    return;
                case 'profile' :
                    OPTIONS_TO_ANALYZE = message.options;
                    METHOD_TO_PROFILE = message.target.substring(0, message.target.indexOf("("));
                    if (profilePanel) {
                        profilePanel.dispose();
                    }
                    vscode.commands.executeCommand('perfProfiles.start');
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    const sourcesFile = commonSources[Object.keys(commonSources)[0]][2].replace(regex, '/') + '.java';
    const hotspotInfluencesRaw = getHotspotInfluencesRaw(dataDir);
    vscode.window.onDidChangeActiveTextEditor(() => {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        const doc = vscode.window.activeTextEditor.document;
        let editorPath = doc.uri.path;
        editorPath = editorPath.replace(workspaceFolders[0].uri.path, "");
        editorPath = editorPath.replace("/src/main/java/", "");

        Object.entries(hotspotInfluencesRaw).forEach(entry => {
            if (editorPath.endsWith(entry[0])) {
                hotspotStyle.dispose();
                hotspotStyle = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,0,0,0.25)'});
                let ranges: vscode.Range[] = [];
                entry[1].forEach(entry => {
                    ranges.push(doc.lineAt((+entry - 1)).range);
                });
                if (vscode.window.activeTextEditor) {
                    vscode.window.activeTextEditor.setDecorations(hotspotStyle, ranges);
                }
            }
        });

        if (editorPath.endsWith(sourcesFile)) {
            sourceStyle.dispose();
            sourceStyle = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(0,255,0,0.25)'});
            let ranges: vscode.Range[] = [];
            OPTIONS_TO_ANALYZE.forEach(entry => {
                ranges.push(doc.lineAt(+commonSources[entry][1] - 1).range);
            });
            vscode.window.activeTextEditor.setDecorations(sourceStyle, ranges);
        }

        let lines = new Set<string>();
        filesToHighlight.forEach((value, key) => {
            if (editorPath.endsWith(key)) {
                lines = value;
            }
        });
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
        traceStyle.dispose();
        traceStyle = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});
        vscode.window.activeTextEditor.setDecorations(traceStyle, ranges);
    }, null, context.subscriptions);
}

function setFilesToHighlight(data: any[]) {
    filesToHighlight.clear();
    data.forEach(function (entry) {
        filesToHighlight.set(entry.file, entry.lines);
    });
}

function getSliceInfoRaw(dataDir: string) {
    const sliceInfo = parse(fs.readFileSync(path.join(dataDir, 'sliceInfo.csv'), 'utf8'))[0];
    return {programName: sliceInfo[0], port: sliceInfo[1]};
}

function getSlicingContent(uniqueOptions: Map<string, string[]>, methods2Lines: Map<string, string>, legend: vscode.Uri) {
    const optionsToAnalyze = new Set(OPTIONS_TO_ANALYZE);

    let sourcesToShow: { [p: string]: string[] } = {};
    // if (METHOD_TO_PROFILE.length !== 0) {
    //     const influencingOptions = uniqueOptions.get(METHOD_TO_PROFILE);
    //     Object.entries(commonSources).forEach((entry: any) => {
    //         if (influencingOptions?.includes(entry[0])) {
    //             sourcesToShow[entry[0]] = [entry[1][0], entry[1][1], entry[1][2]];
    //         }
    //     });
    // } else {
        sourcesToShow = commonSources;
    // }

    let commonSourcesSelect = '';
    Object.entries(sourcesToShow).forEach(entry => {
        commonSourcesSelect = commonSourcesSelect.concat('<div>\n');
        commonSourcesSelect = commonSourcesSelect.concat('&nbsp; <input type="checkbox" id="');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0]);
        commonSourcesSelect = commonSourcesSelect.concat('" name="source-checkbox" ');
        if (optionsToAnalyze.has(entry[0])) {
            commonSourcesSelect = commonSourcesSelect.concat(' checked');
        }
        commonSourcesSelect = commonSourcesSelect.concat('>\n');
        commonSourcesSelect = commonSourcesSelect.concat('<label for="');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0]);
        commonSourcesSelect = commonSourcesSelect.concat('">');
        commonSourcesSelect = commonSourcesSelect.concat(entry[0] + ' - ' + entry[1][0] + '(...):' + entry[1][1]);
        commonSourcesSelect = commonSourcesSelect.concat('</label>\n');
        commonSourcesSelect = commonSourcesSelect.concat('</div>\n');
    });

    let selectedTarget = '<div id="selectedTarget">';
    if (METHOD_TO_PROFILE.length !== 0) {
        selectedTarget = selectedTarget.concat('&nbsp; <input type="checkbox" id="target-checkbox" name="target-checkbox" ');
        selectedTarget = selectedTarget.concat(' checked>\n');
        selectedTarget = selectedTarget.concat('<label for="target">');
        const entries = METHOD_TO_PROFILE.split('.');
        selectedTarget = selectedTarget.concat(entries[entries.length - 2] + '.' + entries[entries.length - 1] + '(...)');
        selectedTarget = selectedTarget.concat('</label>');

        const data = methods2Lines.get(METHOD_TO_PROFILE)?.split(":");
        if (data) {
            targetClass = data[0];
            target = Number(data[1]);
        }
    } else {
        selectedTarget = selectedTarget.concat('&nbsp; Select a hotspot');
    }
    selectedTarget = selectedTarget.concat('</div>');

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
        <div style="font-size: 16px;"><b>Trace options to hotspots</b></div>
        <br>
        <div style="font-size: 14px;"><b>Select options:</b></div>
        <br>
        ${commonSourcesSelect}
        <br>
        <div style="font-size: 14px;"><b>Select hotspot:</b></div>
        <br>
        ${selectedTarget}
        <br>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Trace from Options to the Hotspot</b></div>
        <img style="display: inline; padding-left: 20px;" src="${legend}" width="400">
        <br>
        <br>
        <div id="connection-graph"></div>
        <br>
        <br>
        <hr>
        <br>
        <div style="display: inline; padding-right: 10px;"><button id="global-influence-trigger">View Options' Influence</button></div>
        <div style="display: inline;"><button id="profile-config-trigger">Profile Configurations</button></div>
        <script type="text/javascript">         
            (function () {
                const vscode = acquireVsCodeApi();
                let short2Methods = new Map();
                let targetMethod = "";
                                
                window.addEventListener('message', event => {
                    targetMethod = event.data.targetMethodName;
                    
                    short2Methods.clear();
                    if(!event.data.connections.hasOwnProperty('key') || event.data.connections.key.length === 0) {
                        d3.select("#connection-graph").graphviz()
                            .renderDot('digraph { node [shape=box fillcolor=white style=filled fontcolor=red fontsize=24] "No trace" }').zoom(false);
                        return
                    }
                    
                    event.data.connections.key.forEach(entry => {
                        short2Methods.set(entry[0], entry[1]);
                    });
                    
                    const graphData = 'digraph { ranksep=1.0 node [shape=box fillcolor=tan style=filled] concentrate=true ' + event.data.connections.connections + ' }';
                    d3.select("#connection-graph").graphviz()
                        .renderDot(graphData)
                        .on("end", interactive);
                });
                                                                
                function interactive() {
                    const nodes = d3.selectAll('.node');
                    nodes.on("click", function () {
                        const title = d3.select(this).selectAll('title').text();
                        vscode.postMessage({
                            command: 'link',
                            method: short2Methods.get(title)
                        });
                    });
                    nodes.on('mouseover', function() {
                        d3.select(this).style("fill", "#4c4cff");
                        d3.select(this).style("text-decoration", "underline");
                    })
                    nodes.on('mouseout', function() {
                        d3.select(this).style("fill", "black");
                        d3.select(this).style("text-decoration", "");
                    })
                }
                                
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
                            selectedOptions: selectOptions,
                            target: true
                        });
                    });
                });
                
                if (document.getElementById("target-checkbox")) {
                    document.getElementById("target-checkbox").addEventListener("change", function () {
                        document.getElementById("selectedTarget").innerHTML = '&nbsp; Select a hotspot';
                        let selectOptions = [];
                        document.getElementsByName("source-checkbox").forEach(element => {
                            if(element.checked) {
                                selectOptions.push(element.id);
                            }
                        })
                        vscode.postMessage({
                            command: 'slice',
                            selectedOptions: selectOptions,
                            target: false
                        });
                    });
                }
                
                if(document.getElementById("hotspot") !== undefined) {
                    let selectOptions = [];
                    document.getElementsByName("source-checkbox").forEach(element => {
                        if(element.checked) {
                            selectOptions.push(element.id);
                        }
                    })
                    vscode.postMessage({
                        command: 'slice',
                        selectedOptions: selectOptions,
                        target: true
                    });
                }
                
                document.getElementById("global-influence-trigger").addEventListener("click", function () { 
                    let selectOptions = [];
                    document.getElementsByName("source-checkbox").forEach(element => {
                        if(element.checked) {
                            selectOptions.push(element.id);
                        }
                    })
                    vscode.postMessage({
                        command: 'globalInfluence',
                        options: selectOptions,
                        target: targetMethod === undefined ? "" : targetMethod
                    });
                });
                
                document.getElementById("profile-config-trigger").addEventListener("click", function () {  
                    let selectOptions = [];
                    document.getElementsByName("source-checkbox").forEach(element => {
                        if(element.checked) {
                            selectOptions.push(element.id);
                        }
                    })
                    vscode.postMessage({
                        command: 'profile',
                        options: selectOptions,
                        target: targetMethod === undefined ? "" : targetMethod
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
    const names2ModelsRaw = require(path.join(dataDir, 'perf-models.json'));
    const allConfigsRaw = getAllConfigsRaw(dataDir);
    const names2ConfigsRaw = getNames2ConfigsRaw(dataDir);
    const methods2ModelsRaw = getMethods2ModelsRaw(dataDir);
    globalModelPanel.webview.html = getGlobalModelContent(names2ModelsRaw, allConfigsRaw, names2ConfigsRaw, methods2ModelsRaw);

    const filesRoot = workspaceFolders[0].uri.path + '/src/main/java/';

    globalModelPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'open-region' :
                    const fileData = message.method.split(".");
                    let className = '';
                    for (let i = 0; i < (fileData.length - 1); i++) {
                        className = className.concat(fileData[i]);
                        if (i < (fileData.length - 2)) {
                            className = className.concat("/");
                        }
                    }
                    const method = fileData[fileData.length - 1];
                    let uri = vscode.Uri.file(filesRoot + className + '.java');
                    openFileAndNavigate(uri, method);

                    CONFIG_TO_PROFILE = message.config;
                    CONFIG_TO_COMPARE = message.compare;
                    METHOD_TO_PROFILE = message.method;
                    OPTIONS_TO_ANALYZE = message.options;
                    if (profilePanel) {
                        profilePanel.dispose();
                    }
                    vscode.commands.executeCommand('perfProfiles.start');
                    return;
                case 'trace' :
                    OPTIONS_TO_ANALYZE = message.options;
                    if (slicingPanel) {
                        slicingPanel.dispose();
                    }
                    vscode.commands.executeCommand('slicing.start');
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

function getNames2PerfModels(names2PerfModelsRaw: any) {
    if (NAMES_2_PERF_MODELS.length === 0) {
        NAMES_2_PERF_MODELS = '{';
        names2PerfModelsRaw.models.forEach((entry: any) => {
            NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('"');
            NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(entry.name);
            NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('": [');
            for (let i = 0; i < entry.terms.length; i++) {
                const optionsRaw = entry.terms[i].options;
                if (optionsRaw.length === 0) {
                    continue;
                }
                NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('{ option : "');
                optionsRaw.forEach((option: any) => {
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(option.option);
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(" [");
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(option.from);
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(" --> ");
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(option.to);
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('],');
                });
                NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('", influence: "');
                const value = +entry.terms[i].time;
                if (value >= 0) {
                    NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('+');
                }
                NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat(value.toFixed(2));
                NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('"}, ');
            }
            NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('],');
        });
        NAMES_2_PERF_MODELS = NAMES_2_PERF_MODELS.concat('}');
    }
    return NAMES_2_PERF_MODELS;
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

function getNames2DefaultTimes(names2PerfModelsRaw: any) {
    let names2DefaultTimes = '{';
    names2PerfModelsRaw.models.forEach((entry: any) => {
        names2DefaultTimes = names2DefaultTimes.concat('"');
        names2DefaultTimes = names2DefaultTimes.concat(entry.name);
        names2DefaultTimes = names2DefaultTimes.concat('": ');
        for (let i = 0; i < entry.terms.length; i++) {
            const optionsRaw = entry.terms[i].options;
            if (optionsRaw.length !== 0) {
                continue;
            }
            names2DefaultTimes = names2DefaultTimes.concat('"');
            const value = +entry.terms[i].time;
            names2DefaultTimes = names2DefaultTimes.concat(value.toFixed(2));
            names2DefaultTimes = names2DefaultTimes.concat('", ');
        }
    });
    return names2DefaultTimes.concat('}');
}

function getGlobalModelContent(names2PerfModelsRaw: any, rawConfigs: string[], names2ConfigsRaw: any, methods2ModelsRaw: any) {
    const configs = getConfigsProfile(rawConfigs);
    const rightConfigs = getConfigsCompare(rawConfigs);
    const names2Configs = getNames2Configs(names2ConfigsRaw);
    const names2DefaultTimes = getNames2DefaultTimes(names2PerfModelsRaw);
    const names2PerfModels = getNames2PerfModels(names2PerfModelsRaw);
    const names2LocalModels = getNames2LocalModels(names2ConfigsRaw, methods2ModelsRaw);
    const optionsToAnalyze = getOptionsToAnalyze();
    const methodToProfile = getMethodToProfile();

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
        <div style="font-size: 16px;"><b>Compare influence of options between configurations</b></div>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${configs}
            </select>
        </div>
        <div style="display: inline; font-size: 14px;">compare to: </div>
        <div style="display: inline;">
            <select name="compareSelect" id="compareSelect">
                ${rightConfigs}
            </select>
        </div>
        <br>
        <br>
        <div id="selected-config-time" style="font-size: 14px;">Execution time:</div>
        <br>
        <div id="influence-table-text" style="display: inline; font-size: 14px;"></div>
        <div id="perfModel"></div>
        <br>
        <br>
        <div style="font-size: 14px;"><b>Hot spots influenced by the selected options above</b></div>
<!--        <br>-->
        <div id="localInfluence"></div>
        <br>
<!--        <hr>-->
        <br>
        <div style="display: inline;"><button id="trace-trigger">Trace Options to Hotspots</button></div>
        <script type="text/javascript">          
            (function () {    
                const vscode = acquireVsCodeApi();
                const names2DefaultTimes = ${names2DefaultTimes};
                const names2PerfModels = ${names2PerfModels};
                const names2LocalModels = ${names2LocalModels};
                const names2Configs = ${names2Configs};
                const optionsToAnalyze = ${optionsToAnalyze}.options;
                const methodToProfile = ${methodToProfile}.method;
                let selectedRow = undefined;
                
                const localInfluenceTable = new Tabulator("#localInfluence", {
                    layout: "fitColumns",
                    maxHeight:"300px",
                    columns: [
                        { title: "Influenced Hot Spot", field: "methods", sorter: "string" }, 
                        { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                        { formatter:optionsInfluenceButton, hozAlign:"center", cellClick:openFile },
                        { title: "method",  field: "method" },
                    ],
                });
                localInfluenceTable.hideColumn("method");
                 
                function optionsInfluenceButton() { 
                    return "<button>View Hot Spots</button>";
                }
                
                function openFile(e, cell){
                    localInfluenceTable.getRows().forEach(row => {
                        row.deselect();    
                    });
                    cell.getRow().select();
                    
                    const file = cell.getRow().getData().method;
                    const selectedOptions = new Set();
                    selectedRow.getData().option.split(',').forEach(optionRaw => {
                        if(optionRaw.length > 0) {
                            selectedOptions.add(optionRaw.split(' ')[0]);
                        }
                    });
                    vscode.postMessage({
                        command: 'open-region',
                        method: file,
                        config: document.getElementById("configSelect").value,
                        compare: document.getElementById("compareSelect").value,
                        options: Array.from(selectedOptions)
                    });
                }
                                      
                const perfModelTable = new Tabulator("#perfModel", {
                    layout: "fitColumns",
                    maxHeight:"300px",
                    selectable: true,
                    // groupBy:"change",
                    groupStartOpen:function(value){
                        return value === 'Actual Influencing Options Changes' || value === undefined;
                    },
                    columns: [
                        { title: "Options", field: "option", sorter: "string", formatter: customFormatter }, 
                        { title: "Influence (s)",  field: "influence",  sorter: influenceSort, hozAlign:"right" },
                        { title: "Change",  field: "change" },
                    ],
                    rowSelectionChanged:selectInfluence
                });
                perfModelTable.hideColumn('change');
                
                function selectInfluence(data, rows) {
                    if(rows.length === 0) {
                        localInfluenceTable.setData([]);
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
                    
                    let selectedOptions = new Set();
                    selectedRow.getData().option.split(',').forEach(optionRaw => {
                        if(optionRaw.length > 0) {
                            selectedOptions.add(optionRaw.split(' ')[0]);
                        }
                    });
                    selectedOptions = Array.from(selectedOptions);
                    document.getElementById("trace-trigger").innerHTML = traceButtonText(selectedOptions, '');
                    
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
                        localInfluence.push({methods: method, influence: influence, method: methodRaw});
                    });
                    localInfluenceTable.setData(localInfluence);
                    localInfluenceTable.setSort("influence", "desc");
                    
                    const methodEntries = methodToProfile.split('.');
                    const method = methodEntries[methodEntries.length - 2] + '.' + methodEntries[methodEntries.length - 1];
                    localInfluenceTable.getRows().forEach(row => {
                        if(methodToProfile.length > 0 && row.getData().method.startsWith(methodToProfile)) {
                            row.select();
                            document.getElementById("trace-trigger").innerHTML = traceButtonText(selectedOptions, method);
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
                
                function influenceSort(a, b) {
                    let one = a.replace("+","");
                    one = one.replace("-","");
                    let two = b.replace("+","");
                    two = two.replace("-","");
                    return (+one) - (+two);
                }
                
                function customFormatter(cell) {
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
                    const data = names2PerfModels[config];
                    perfModelTable.setData(data);
                    perfModelTable.setSort("influence", "desc");
                                        
                    const compare = document.getElementById("compareSelect").value;    
                    
                    if(config === compare) {
                        document.getElementById("influence-table-text").innerHTML = "<b>Influence of changing values in " + config;
                    }
                    else {
                        document.getElementById("influence-table-text").innerHTML = "<b>Influence of changing values from " + config + " ➤ " + compare + "</b>";
                    }
                    
                    if(config !== compare) {                        
                        perfModelTable.getRows().forEach(row => {
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
                                    names2PerfModels[compare].forEach(term => {
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
                            perfModelTable.addRow({option:newData, influence: row.getData().influence});
                            row.delete();
                        });
                        
                        perfModelTable.getRows().forEach(row => {
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
                    }
                    
                    const configSelected = names2Configs[config];
                    const configValues = new Map();
                    for (let i = 0; i < configSelected.length; i++) {
                        configValues.set(configSelected[i].option, configSelected[i].value);
                    }

                    let times = "<b>Execution time:</b> " + (+names2DefaultTimes[config]).toFixed(2);
                    if(config === compare) {
                        times = times.concat(" seconds");
                    }
                    else {
                        times = times.concat(" seconds vs. " + (+names2DefaultTimes[compare]).toFixed(2) + " seconds");
                    }
                    document.getElementById("selected-config-time").innerHTML = times;
                   
                    perfModelTable.getRows().forEach(row => {
                        const selectedOptions = new Set();
                        row.getData().option.split(',').forEach(optionRaw => {
                            if(optionRaw.length > 0) {
                                selectedOptions.add(optionRaw.split(' ')[0]);
                            }
                        }); 
                        if(optionsToAnalyze.sort().join(',') === Array.from(selectedOptions).sort().join(',')) {
                            row.select();
                        }
                    });
                    
                    perfModelTable.setSort("influence", "asc");
                    perfModelTable.setSort("influence", "desc");
                    // perfModelTable.setSort(
                    //      {column:"change", dir:"des"},
                    //      {column:"influence", dir:"des"},
                    // );
                }
                viewPerfModel();
                    
                document.getElementById("configSelect").addEventListener("change", () => {
                    viewPerfModel();
                });
                
                document.getElementById("compareSelect").addEventListener("change", () => {
                    viewPerfModel();
                });
            
                document.getElementById("trace-trigger").addEventListener("click", () => {                    
                    const selectedOptions = new Set();
                    perfModelTable.getRows().forEach(row => {
                        if(row.isSelected()) {
                            row.getData().option.split(',').forEach(optionRaw => {
                                if(optionRaw.length > 0) {
                                    selectedOptions.add(optionRaw.split(' ')[0]);
                                }
                            }); 
                        }
                    });
                    
                    vscode.postMessage({
                        command: 'trace',
                        options: Array.from(selectedOptions)
                    });
                });
            }())
        </script>
    </body>
    </html>`;
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