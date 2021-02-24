// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let style: vscode.TextEditorDecorationType;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Log that the extension was correctly installed
    console.log('Congratulations, your extension "line-highlighter" is now active!');

    // Main plugin entry point
    let disposable = vscode.commands.registerCommand('extension.highlight', () => {

        let fileName: string;								// File to open
        let lineNumber: number;								// Line to highlight
        let colorCode: number;								// - Red, + Green
        let colorRGB: string;								// Calculated RGB value
        let activeEditor: vscode.TextEditor | undefined;	// The code window object

        // Gather the necessary input from the user with an input box
        vscode.window.showInputBox({
            prompt: "Enter a filename, line number and color code.",
            placeHolder: "app/models/user.rb, 72, -25"
        }).then(value => {

            if (value !== undefined) {

                // Break the arguments up into an array of strings, using comma to split
                let args: string[] = value.split(",");

                // Check that we have the 3 arguments that we require...
                if (args.length !== 3) {
                    //...if we don't then exit gracefully
                    vscode.window.showErrorMessage("Error: Please provide 3 arguments.");
                    return;
                } else {
                    //...otherwise, save the arguments into variables
                    fileName = args[0];
                    lineNumber = parseInt(args[1]) - 1;
                    colorCode = parseInt(args[2]);

                    // If the colorCode argument is valid...
                    if (colorCode >= -100 && colorCode <= 100 && colorCode !== 0) {

                        // Calculate the desired color and store the RGB value in colorRGB
                        colorRGB = calculateColor();

                        // Create a style for the code window (set the highlight color)
                        style = vscode.window.createTextEditorDecorationType(
                            {backgroundColor: colorRGB});
                    } else {
                        // Show error and exit if an invalid value is provided
                        vscode.window.showErrorMessage("Error: Color code must be between -100 and -1 or 1 and 100");
                        return;
                    }
                }

                // Attempt to open the provided file, if the file cannot be found, an error
                // message will display and execution will automatically exit. If a workspace
                // is open, then we expect a relative path, if not no workspace is open, then
                // we expect and absolute path.
                if (vscode.workspace.workspaceFolders !== undefined) {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(vscode.workspace.rootPath + '/' + fileName));
                    // We need to wait, as commands in NodeJS run asynchronously
                    // Register this one time callback method
                    let timeout: NodeJS.Timer | null = null;
                    timeout = setTimeout(updateDecorations, 500);
                } else {
                    // If no workspce is open, then treat the path an absolute path
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fileName));
                }
            }

        });

        // Set the background text color using the provided input
        function updateDecorations() {

            // Apply this highlight color (style) to the specified line (ranges)
            if (activeEditor) {
                let startLine = activeEditor.document.lineAt(lineNumber);
                let ranges: vscode.Range[] = [];
                ranges.push(startLine.range);
                activeEditor.setDecorations(style, ranges);
            }
        }

        // Calculate the highlight color: Given a number between -100 and +100, calcualte a red
        // or green value
        function calculateColor(): string {

            let r: number = 0;
            let g: number = 0;
            let b: number = 0;

            // A minus number indicates red highlighting
            if (colorCode < 0 && colorCode >= -100) {
                r = 255;
                // -100 means 100% red
                if (colorCode === -100) {
                    g = 0;
                    b = 0;
                }
                // otherwise use the colorCode as a percentage to calculate the green/blue values
                else {
                    let factor: number = 100 - (0 - colorCode);
                    g = (255 / 100) * factor;
                    b = r;
                }
            }
            // A positive number indicates green highlighting
            else if (colorCode > 0 && colorCode <= 100) {
                g = 255;
                // 100 means 100% green
                if (colorCode === 100) {
                    r = 0;
                    b = 0;
                }
                // otherwise use the colorCode as a percentage to calculate the red/blue values
                else {
                    let factor: number = 100 - colorCode;
                    r = (255 / 100) * factor;
                    b = r;
                }
            }

            // Return the final calculated RGB value as a string
            return `rgba(${r},${g},${b}, 0.8)`;
        }

        // Event Handler: This event fires when the code window changes (e.g. when file is opened)
        vscode.window.onDidChangeActiveTextEditor(editor => {
            activeEditor = editor;
            if (activeEditor) {
                // If this code window is the same file as the one specified
                if (activeEditor.document.fileName === fileName) {
                    // Refresh the window styling
                    updateDecorations();

                }
            }
        }, null, context.subscriptions);

    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
    // Remove the text highlighting when the plugin is terminated
    if (style !== undefined) {
        style.dispose();
    }
}
