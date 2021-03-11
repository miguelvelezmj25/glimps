(function () {
    // Handle the message inside the webview
    window.addEventListener('message', event => {
        const methods2DefaultExecutionTimes = getMethods(event.data);
        const methods2Models = getMethods2Models(event.data);
        const names2Configs = getNames2Configs(event.data);

        const methodSelect = document.getElementById("methodSelect");
        for (const key of methods2DefaultExecutionTimes.keys()) {
            const element = document.createElement("option");
            element.textContent = key;
            element.value = key;
            methodSelect.appendChild(element);
        }

        const table = new Tabulator("#local-model-table", {
            layout: "fitColumns",
            // placeholder: "Awaiting Data, Please Load File",
            // selectable: true,
            columns: [
                {title: "Option", field: "option", sorter: "string", formatter: customFormatter},
                {title: "Influence (s)", field: "influence", sorter: influenceSort, hozAlign: "right"},
            ],
        });

        document.getElementById("slice-trigger").addEventListener("click", function () {
            acquireVsCodeApi().postMessage({
                command: 'slice'
            });
        });

        //trigger AJAX load on "Load Data via AJAX" button click
        document.getElementById("view-influence-trigger").addEventListener("click", function () {
            const selectedMethod = document.getElementById("methodSelect").value;
            const selectedConfig = document.getElementById("configSelect").value;
            document.getElementById("methodName").innerHTML = "<b>Selected method:</b> " + selectedMethod;
            document.getElementById("selected-config-name").innerHTML = "<b>Selected configuration:</b> " + selectedConfig;
            document.getElementById("defaultExecutionTime").innerHTML = "<b>Default execution time:</b> " + methods2DefaultExecutionTimes.get(selectedMethod);

            const optionsToSelect = getSelectedConfig(names2Configs.get('default'), names2Configs.get(selectedConfig));
            const model = methods2Models.get(selectedMethod);
            table.setData(model);

            if (optionsToSelect.length > 0) {
                const selectedOptions = new Set();
                optionsToSelect.forEach(entry => {
                    selectedOptions.add(entry);
                });

                const rowsToSelect = table.getRows().filter(row => {
                    const options = new Set();
                    row.getData().option.split(",").forEach(entry => {
                        options.add(entry.split(" ")[0]);
                    });
                    return subset(options, selectedOptions);
                });
                rowsToSelect.forEach(row => row.select());
            }

            let time = +document.getElementById("defaultExecutionTime").textContent.split(" ")[3];
            const selectedRows = table.getRows().filter(row => row.isSelected());
            selectedRows.forEach(row => {
                let influenceStr = row.getData().influence;
                let influence = influenceStr.replace("+", "");
                influence = +influence.replace("-", "");
                if (influenceStr.includes('+')) {
                    time += influence;
                } else {
                    time -= influence;
                }
            });
            document.getElementById("selected-config-time").innerHTML = "<b>Execution time:</b> " + Math.max(0, time).toFixed(2) + " seconds";

            table.getRows().forEach(row => {
                if (!selectedRows.includes(row)) {
                    row.delete();
                }
            });
            table.getRows().forEach(row => {
                row.deselect();
            });
        });

        function getSelectedConfig(defaultConfig, rawConfig) {
            let selected = [];
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
            return selected;
        }
    });
}());

function influenceSort(a, b, aRow, bRow, column, dir, sorterParams) {
    let one = a.replace("+", "");
    one = one.replace("-", "");
    let two = b.replace("+", "");
    two = two.replace("-", "");
    return (+one) - (+two);
}

function customFormatter(cell, formatterParams, onRendered) {
    const val = cell.getValue();
    const entries = val.split(",");
    const cellDiv = document.createElement('div');
    for (let i = 0; i < entries.length; i++) {
        const valItemDiv = document.createElement('div');
        valItemDiv.textContent = entries[i];
        cellDiv.appendChild(valItemDiv);
    }
    return cellDiv;
}

function subset(subset, set) {
    for (let elem of subset) {
        if (!set.has(elem)) {
            return false;
        }
    }
    return true;
}

function getMethods(data) {
    const methodBasicInfo = data.methodBasicInfo;
    let methods2Time = new Map();
    for (let i = 0; i < methodBasicInfo.length; i++) {
        methods2Time.set(methodBasicInfo[i].method, methodBasicInfo[i].defaultExecutionTime);
    }
    return methods2Time;
}

function getMethods2Models(data) {
    const dataMethodsToModels = data.methods2Models;
    let methods2Models = new Map();
    for (let i = 0; i < dataMethodsToModels.length; i++) {
        methods2Models.set(dataMethodsToModels[i].method, getPerfModel(dataMethodsToModels[i].model));
    }
    return methods2Models;
}

function getNames2Configs(data) {
    const dataNames2Configs = data.names2Configs;
    let names2Configs = new Map();
    for (let i = 0; i < dataNames2Configs.length; i++) {
        names2Configs.set(dataNames2Configs[i].config, dataNames2Configs[i].value);
    }
    return names2Configs;
}

function getPerfModel(rawPerfModel) {
    let model = [];
    rawPerfModel.forEach((entry) => {
        model.push({
            option: entry[0],
            influence: entry[1]
        });
    });
    return model;
}