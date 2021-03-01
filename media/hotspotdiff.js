(function () {
    // Handle the message inside the webview
    window.addEventListener('message', event => {
        const configs = event.data.configs;

        const configSelect1 = document.getElementById("configSelect1");
        for (const config of configs) {
            const element = document.createElement("option");
            element.textContent = config;
            element.value = config;
            configSelect1.appendChild(element);
        }

        const configSelect2 = document.getElementById("configSelect2");
        for (const config of configs) {
            const element = document.createElement("option");
            element.textContent = config;
            element.value = config;
            configSelect2.appendChild(element);
        }

        const table = new Tabulator("#hotspot-diff-table", {
            layout: "fitColumns",
            placeholder: "Awaiting Data, Please Select Configurations to Compare",
            columns: [
                {title: "Option", field: "option", sorter: "string"},
                {title: "Config 1", field: "config1", sorter: "number", hozAlign: "right"},
                {title: "Config 2", field: "config2", sorter: "number", hozAlign: "right"}
            ],
        });

        // //trigger AJAX load on "Load Data via AJAX" button click
        // document.getElementById("local-model-trigger").addEventListener("click", function () {
        //     const selectedMethod = document.getElementById("methodSelect").value;
        //     document.getElementById("methodName").textContent = "Method Selected: " + selectedMethod;
        //     document.getElementById("defaultExecutionTime").textContent = "Default execution time: " + methods2DefaultExecutionTimes.get(selectedMethod);
        //     console.log(methods2Models.get(selectedMethod));
        //     table.setData(methods2Models.get(selectedMethod));
        // });

    });
}());

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