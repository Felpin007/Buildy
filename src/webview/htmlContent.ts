import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce'; 

/**
 * Gera o conteúdo HTML para os webviews da extensão.
 * 
 * @param webview Instância do webview para o qual o HTML será gerado.
 * @param extensionUri URI da extensão para carregar recursos locais.
 * @param viewType Tipo de visualização a ser gerada ('structure' para o gerador de estrutura ou 'copySystem' para o explorador de arquivos).
 * @returns String contendo o HTML completo para o webview solicitado.
 * @param viewType Tipo de visualização a ser gerada ('structure' para o gerador de estrutura ou 'copySystem' para o explorador de arquivos)
 * @returns String contendo o HTML completo para o webview solicitado
 */
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
                /* Text Editor Section Styles */
                .text-editor-section {
                    padding: 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                .text-editor-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .text-editor-header h3 {
                    margin: 0;
                    color: var(--vscode-foreground);
                }
                .text-editor-actions {
                    display: flex;
                    gap: 5px;
                }
                #solutionTextarea {
                    width: 100%;
                    min-height: 300px;
                    resize: vertical;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
                /* Internal Notification System */
                .notification-container {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 1000;
                    max-width: 400px;
                }
                .notification {
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    border-left: 4px solid;
                    background-color: var(--vscode-notifications-background);
                    color: var(--vscode-notifications-foreground);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                    animation: slideIn 0.3s ease-out;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    position: relative;
                }
                .notification.info {
                    border-left-color: var(--vscode-notificationsInfoIcon-foreground, #007acc);
                }
                .notification.warning {
                    border-left-color: var(--vscode-notificationsWarningIcon-foreground, #ff8c00);
                }
                .notification.error {
                    border-left-color: var(--vscode-notificationsErrorIcon-foreground, #f14c4c);
                }
                .notification-icon {
                    flex-shrink: 0;
                }
                .notification-message {
                    flex: 1;
                    font-size: 13px;
                    line-height: 1.4;
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: var(--vscode-notifications-foreground);
                    cursor: pointer;
                    padding: 0;
                    margin: 0;
                    opacity: 0.7;
                    flex-shrink: 0;
                }
                .notification-close:hover {
                    opacity: 1;
                }
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
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
                            <button id="copyDiffButton" title="Copy Diff to Clipboard">
                                <i class="codicon codicon-diff"></i>
                            </button>
                            <button id="openTextareaButton" title="Open Text Editor">
                                <i class="codicon codicon-edit"></i>
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
                <section id="textEditorSection" class="text-editor-section" style="display: none;">
                    <div class="text-editor-header">
                        <h3>Text Editor</h3>
                        <div class="text-editor-actions">
                            <button id="createSolutionButton" title="Create solucao.txt">
                                <i class="codicon codicon-save"></i> Create
                            </button>
                            <button id="deleteSolutionButton" title="Delete solucao.txt">
                                <i class="codicon codicon-trash"></i> Delete
                            </button>
                            <button id="closeTextareaButton" title="Close Text Editor">
                                <i class="codicon codicon-close"></i>
                            </button>
                        </div>
                    </div>
                    <textarea id="solutionTextarea" placeholder="Paste your text here..." rows="20"></textarea>
                </section>
                ` : ''}
            </div>
            <!-- Internal Notification Container -->
            <div id="notificationContainer" class="notification-container"></div>
            <div id="explorerContextMenu"></div> <!-- Restore context menu container -->
            <script type="module" nonce="${nonce}" src="${scriptUri}"></script> <!-- Load main.js as module -->
        </body>
        </html>`;
}
