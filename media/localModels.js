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

        let methods2Models = getMethods2Models(event.data);
        const table = new Tabulator("#local-model-table", {
            layout: "fitColumns",
            placeholder: "Awaiting Data, Please Load File",
            columns: [
                {title: "Option", field: "option", sorter: "string"},
                {title: "Value", field: "value", sorter: "string"},
                {title: "Execution Time (s)", field: "time", sorter: "number", hozAlign: "right"}
            ],
        });

        //trigger AJAX load on "Load Data via AJAX" button click
        document.getElementById("local-model-trigger").addEventListener("click", function () {
            const selectedMethod = document.getElementById("methodSelect").value;
            document.getElementById("methodName").textContent = "Method Selected: " + selectedMethod;
            document.getElementById("defaultExecutionTime").textContent = "Default execution time: " + methods2DefaultExecutionTimes.get(selectedMethod);
            table.setData(methods2Models.get(selectedMethod));
        });

    });
}());

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
            value: entry[1],
            time: entry[2]
        });
    });
    return model;
}