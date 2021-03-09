(function () {
    // Handle the message inside the webview
    window.addEventListener('message', event => {
        const methods2DefaultExecutionTimes = getMethods(event.data);

        const methodSelect = document.getElementById("methodSelect");
        for (const key of methods2DefaultExecutionTimes.keys()) {
            const element = document.createElement("option");
            element.textContent = key;
            element.value = key;
            methodSelect.appendChild(element);
        }

        const table = new Tabulator("#local-model-table", {
            layout: "fitColumns",
            placeholder: "Awaiting Data, Please Load File",
            selectable: true,
            columns: [
                {title: "Option", field: "option", sorter: "string", formatter: customFormatter},
                {title: "Influence (s)", field: "influence", sorter: influenceSort, hozAlign: "right"},
            ],
        });

        let methods2Models = getMethods2Models(event.data);
        //trigger AJAX load on "Load Data via AJAX" button click
        document.getElementById("local-model-trigger").addEventListener("click", function () {
            const selectedMethod = document.getElementById("methodSelect").value;
            document.getElementById("methodName").textContent = "Method Selected: " + selectedMethod;
            document.getElementById("defaultExecutionTime").textContent = "Default execution time: " + methods2DefaultExecutionTimes.get(selectedMethod);
            table.setData(methods2Models.get(selectedMethod));
        });

        document.getElementById("deselect-all").addEventListener("click", function () {
            table.deselectRow();
        });

        document.getElementById("configure").addEventListener("click", function () {
            let selectedRows = table.getRows().filter(row => row.isSelected());
            const selectedOptions = new Set();
            selectedRows.forEach(row => {
                row.getData().option.split(",").forEach(entry => {
                    selectedOptions.add(entry.split(" ")[0]);
                });
            });

            const rowsToSelect = table.getRows().filter(row => {
                const options = new Set();
                row.getData().option.split(",").forEach(entry => {
                    options.add(entry.split(" ")[0]);
                });
                return subset(options, selectedOptions);
            });
            rowsToSelect.forEach(row => row.select());

            selectedRows = table.getRows().filter(row => row.isSelected());
            let time = +document.getElementById("defaultExecutionTime").textContent.split(" ")[3];
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
            document.getElementById("selected-config-time").innerHTML = "Selected configuration time: " + Math.max(0, time).toFixed(2) + " seconds";
        });

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