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

        // let hash = new Map();
        // hash.set(methods2DefaultExecutionTimes[0][0], [{time: 1, option: "Cameron Vis", value: "false"}]);
        // hash.set(methods2DefaultExecutionTimes[1][0], [{time: 2, option: "Billy Bob", value: "true"}]);

        const table = new Tabulator("#example-table", {
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
            const value = document.getElementById("methodSelect").value;
            document.getElementById("methodName").textContent = "Method Selected: " + value;
            document.getElementById("defaultExecutionTime").textContent = "Default execution time: " + methods2DefaultExecutionTimes.get(value);
            // table.setData(hash.get(value));
        });

    });
}());

function getMethods(data) {
    const dataMethods = data.methods2DefaultExecutionTimes;
    let methods2Time = new Map();
    for (let i = 0; i < dataMethods.length; i++) {
        methods2Time.set(dataMethods[i].method, dataMethods[i].defaultExecutionTime);
    }
    return methods2Time;
}