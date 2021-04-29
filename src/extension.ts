// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from 'csv-parse/lib/sync';

const request = require('sync-request');

let traceStyle: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({backgroundColor: 'rgba(255,210,127,0.2)'});

let CONFIG_TO_PROFILE: string = '';

let profilePanel: vscode.WebviewPanel | undefined = undefined;

let NAMES_2_CONFIGS: string | undefined = undefined;

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

function getModel(names2ModelsRaw: any) {
    names2ModelsRaw['models'].forEach((entry: any) => {
        if (entry['name'] === 'default') {
            return entry ['terms'];
        }
    });
    return names2ModelsRaw['models'][0]['terms'];
}

function getTime(model: any, config: string) {
    let time = 0.0;

    const configEntries = config.split('\n');
    model.forEach((term: any) => {
        let set = true;
        term['options'].forEach((option: any) => {
            configEntries.forEach(entry => {
                const items = entry.split(",");
                if (items[0] === option['option'] && items[1] === option['from']) {
                    set = false;
                }
            });

        });
        if (set) {
            time += term['time'];
        }
    });

    return time;
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

    const names2ModelsRaw = require(path.join(dataDir, 'perf-models.json'));
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'perf' :
                    let config = "";
                    message.config.forEach((entry: any) => {
                        config = config.concat(entry.option);
                        config = config.concat(",");
                        config = config.concat(entry.value);
                        config = config.concat("\n");
                    });
                    const model = getModel(names2ModelsRaw);
                    const time = getTime(model, config);
                    sleep(3000);
                    panel.webview.postMessage({time: time});
                    return;
                case 'profile' :
                    if (profilePanel) {
                        profilePanel.dispose();
                    }
                    vscode.commands.executeCommand('profiles.start');
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

function sleep(milliseconds: number) {
    const date = Date.now();
    let currentDate = null;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
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
        <div id="perfConfig"></div>
        <br>
<!--        '-->
        <div style="display: inline;"><button id="get-perf-trigger">Get execution time</button></div>
        <div id="execTime" style="display: inline; margin-left: 20px;" >Time: </div> 
        <br>
        <br>
        <br>
        <div style="display: inline;"><button id="profile-trigger">Profile configuration</button></div>
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

            const configTable = new Tabulator("#perfConfig", {
                layout: "fitColumns",
                columns: [
                    { title: "Option", field: "option", headerSort: false }, 
                    { title: "Value",  field: "value", editor:"select", editorParams: optionValues, headerSort: false }
                ],
            });
            const config = rawConfigs["config"];
            configTable.setData(names2Configs[config]);
            
            window.addEventListener('message', event => {
                document.getElementById("execTime").innerHTML = 'Time: ' +  event.data.time.toFixed(2) + ' seconds';
            });
                                    
            (function () {
                const vscode = acquireVsCodeApi();
                
                document.getElementById("get-perf-trigger").addEventListener("click", function () {
                    document.getElementById("execTime").innerHTML = 'Calculating ...';
                    vscode.postMessage({
                        command: 'perf',
                        config: configTable.getData(), 
                    });
                });
                
                document.getElementById("profile-trigger").addEventListener("click", function () {    
                    vscode.postMessage({
                        command: 'profile',
                        config: configTable.getData(), 
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
    profilePanel.webview.html = getHotspotDiffContent(allConfigsRaw);

    const sliceInfoRaw = getSliceInfoRaw(dataDir);
    const programName = sliceInfoRaw.programName;

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

function getHotspotDiffContent(rawConfigs: string[]) {
    const leftConfigs = getConfigsProfile(rawConfigs);

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
        <div style="font-size: 16px;"><b>Performance profile</b></div>
        <br>
        <div style="display: inline; font-size: 14px;"><b>Select configuration:</b></div>
        <div style="display: inline;">
            <select name="configSelect" id="configSelect">
                ${leftConfigs}
            </select>
        </div>
        <br>
        <br>
        <div id="hotspot-diff-table"></div>
        <br>
        <script type="text/javascript">                  
            (function () {
                const vscode = acquireVsCodeApi();
                                                              
                const table = new Tabulator("#hotspot-diff-table", {
                    layout:"fitData",
                    // layout:"fitColumns",
                    maxHeight:"300px",
                    dataTree:true,
                    dataTreeStartExpanded:false,
                    movableColumns: true, 
                    selectable: false,
                    rowFormatter: formatBackground,
                    columns: [
                        {title: "Hot Spot", field: "method", sorter: "string"},
                        {title: "Self time (s)", field: "config1", sorter: "number", hozAlign: "right"},
                        {title: "Self time (s)", field: "config2", sorter: "number", hozAlign: "right"},
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
                
                function compareProfiles() {
                    const configs = [];
                    configs.push(document.getElementById("configSelect").value);
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
                    const compareSelect = document.getElementById("configSelect").value;
                    
                    table.addColumn({title:"Self time (s)", field:"config1", sorter: "number", hozAlign: "right"});
                    table.addColumn({title:"Self time (s)", field:"config2", sorter: "number", hozAlign: "right"});
                    if(configToSelect === compareSelect) {
                        table.hideColumn("config2");
                    }
                    
                    const resp = event.data.response;
                    table.setData(resp);
                    table.setSort("config1", "desc");
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
