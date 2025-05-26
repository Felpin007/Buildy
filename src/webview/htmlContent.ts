import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce'; 
export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri, viewType: 'structure' | 'copySystem'): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'main.js')); 
    const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'reset.css'));
    const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'vscode.css'));
    const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')); 
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                style-src ${webview.cspSource} 'unsafe-inline';
                font-src ${webview.cspSource};
                img-src ${webview.cspSource} https: data:;
                script-src-elem 'nonce-${nonce}';
            ">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <!-- Restore CSS Links -->
            <link href="${styleResetUri}" rel="stylesheet">
            <link href="${styleVSCodeUri}" rel="stylesheet">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleMainUri}" rel="stylesheet">
            <title>AI Structure Generator Input</title>
            <style nonce="${nonce}"> /* Basic styles directly here for simplicity */
                body, html {
                    padding: 0;
                    margin: 0;
                    height: 100%;
                    width: 100%;
                    overflow: hidden; /* Prevent scrollbars if content fits */
                }
                .content-wrapper {
                    /* padding: 15px; */ /* Padding removed */
                    height: 100%;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                }
                textarea {
                    width: 100%;
                    box-sizing: border-box;
                    margin-bottom: 10px;
                    /* Use VS Code theme variables for appearance */
                    color: var(--vscode-input-foreground);
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, transparent));
                    padding: 4px;
                }
                textarea:focus {
                    border-color: var(--vscode-focusBorder);
                    outline: none;
                }
                button {
                    /* Use VS Code theme variables */
                    color: var(--vscode-button-foreground);
                    background-color: var(--vscode-button-background);
                    border: 1px solid var(--vscode-button-border, transparent);
                    padding: 5px 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                }
                /* Ensure codicons display correctly */
                .codicon {
                    display: inline-block;
                    vertical-align: middle;
                }
            </style>
        </head>
        <body>
            <div class="content-wrapper">
                ${viewType === 'structure' ? `
                <section class="generator-section">
                    <div class="section-header">
                        <h2>Generate Structure</h2>
                        <!-- MODIFICATION START: Container for prompt buttons and settings icon -->
                        <div class="prompt-buttons-container">
                            <button id="copyWinPromptButton" class="copy-prompt-button" title="Copy Windows prompt">
                                <i class="codicon codicon-clippy"></i> Win
                            </button>
                            <button id="copyLinuxPromptButton" class="copy-prompt-button" title="Copy Linux prompt">
                                <i class="codicon codicon-clippy"></i> Linux
                            </button>
                            <button id="promptSettingsButton" class="prompt-settings-button" title="Additional Prompt Settings">
                                <i class="codicon codicon-gear"></i>
                            </button>
                        </div>
                        <!-- MODIFICATION END -->
                    </div>
                    <!-- MODIFICATION START: Settings Section -->
                    <div id="promptSettingsSection" class="prompt-settings-section">
                         <label for="additionalPromptInput">Additional prompt text (appended to base prompt):</label>
                         <input type="text" id="additionalPromptInput" placeholder="Enter additional text here...">
                         <button id="saveAdditionalPromptButton">
                             <i class="codicon codicon-save"></i> Save
                         </button>
                    </div>
                    <!-- MODIFICATION END -->
                    <textarea id="structureInput" placeholder="Paste structure text here..."></textarea>
                    <div class="action-buttons"> <!-- Wrap buttons -->
                        <button id="generateButton">
                            <i class="codicon codicon-sparkle"></i> Generate Structure
                        </button>
                        <button id="undoButton" title="Undo last generation">
                            <i class="codicon codicon-discard"></i> Undo
                        </button>
                    </div>
                </section>
                <!-- Progress container moved outside generator-section -->
                <div id="generationProgressContainer" class="progress-container" style="display: none;">
                    <h3>Generation Progress:</h3>
                    <div id="progressList" class="progress-list"></div>
                </div>
                ` : ''}
                ${viewType === 'copySystem' ? `
                <section class="explorer-section">
                    <div class="explorer-header">
                        <div class="explorer-title" id="explorerTitle">Workspace</div>
                        <div class="explorer-actions">
                            <button id="copySelectedButton" title="Copy Selected Files">
                                <i class="codicon codicon-clippy"></i>
                            </button>
                            <button id="refreshTreeButton" title="Refresh">
                                <i class="codicon codicon-refresh"></i>
                            </button>
                        </div>
                    </div>
                    <div id="fileTreeContainer" class="file-tree-container">
                        <div id="loadingIndicator" style="display: none;">
                            <i class="codicon codicon-loading codicon-modifier-spin"></i> Loading...
                        </div>
                        <p id="treePlaceholder">Loading workspace structure...</p>
                        <ul id="fileTree" class="file-tree" style="display: none;" role="tree"></ul>
                    </div>
                </section>
                ` : ''}
            </div>
            <div id="explorerContextMenu"></div> <!-- Restore context menu container -->
            <script type="module" nonce="${nonce}" src="${scriptUri}"></script> <!-- Load main.js as module -->
        </body>
        </html>`;
}
