"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructureViewProvider = void 0;
// src/StructureViewProvider.ts
const vscode = __importStar(require("vscode"));
const htmlContent_1 = require("./webview/htmlContent");
const fileSystemService_1 = require("./services/fileSystemService"); // Restore import
const constants = __importStar(require("./constants")); // <-- Import constants
// Removed duplicate import of getWorkspaceTree
class StructureViewProvider {
    _extensionUri;
    _context;
    static viewType = 'structureView'; // Simplified view type
    _view;
    _currentWorkspaceRoot; // Restore workspace root tracking
    _activeEditorListener; // Restore active editor listener if needed later
    constructor(_extensionUri, _context) {
        this._extensionUri = _extensionUri;
        this._context = _context;
        this._currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        // Listen for workspace folder changes (Restore this logic)
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
            const rootChanged = this._currentWorkspaceRoot?.fsPath !== newRoot?.fsPath;
            this._currentWorkspaceRoot = newRoot;
            console.log(`[StructureViewProvider] Workspace folders changed. New root: ${this._currentWorkspaceRoot?.fsPath ?? 'None'}`);
            if (this._view?.visible) {
                this._view?.webview.postMessage({ command: 'workspaceChanged' });
                if (rootChanged && this._currentWorkspaceRoot) {
                    console.log("[StructureViewProvider] Root changed, refreshing tree.");
                    this.refreshFileTree();
                }
                else if (!this._currentWorkspaceRoot) {
                    console.log("[StructureViewProvider] Workspace closed, view notified.");
                }
            }
        });
        this._context.subscriptions.push(workspaceChangeListener);
        // Setup active editor listener if needed for highlighting (keep commented for now)
        // this._setupActiveEditorListener();
    }
    // --- MODIFICATION START: Add getter for the webview view ---
    getWebviewView() {
        return this._view;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Allow media folder
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons') // Allow codicons
            ]
        };
        webviewView.webview.html = (0, htmlContent_1.getHtmlForWebview)(webviewView.webview, this._extensionUri, 'structure'); // Pass viewType
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log(`[StructureViewProvider] Received message: ${message.command}`);
            switch (message.command) {
                case 'generateStructure':
                    console.log(`[StructureViewProvider] Received 'generateStructure' message from webview. Executing command...`); // <-- ADDED LOG
                    // Execute the command registered in extension.ts
                    // Pass the webview object so the command can send progress back
                    vscode.commands.executeCommand('buildy.processPastedStructure', message.text, this._view?.webview);
                    return;
                case 'showDiff': // Handle diff request from webview
                    console.log(`[StructureViewProvider] Received 'showDiff' message for path: ${message.path}, type: ${message.type}`);
                    // Pass the full arguments object to the command
                    vscode.commands.executeCommand('buildy.showDiff', {
                        relativePath: message.path,
                        type: message.type // Pass the type ('undo' or 'generation'/undefined)
                    });
                    return;
                case 'undoLastGeneration': // Handle undo request from webview
                    console.log(`[StructureViewProvider] Received 'undoLastGeneration' message.`);
                    // Execute the command. It will retrieve the last hash from workspaceState.
                    // Pass the webview instance to the undo command
                    vscode.commands.executeCommand('buildy.undoLastGeneration', undefined, this._view?.webview); // Pass undefined for hash (command will fetch), and the webview
                    return;
                // --- MODIFICATION START: Handle saving additional prompt ---
                case 'saveAdditionalPrompt':
                    if (typeof message.text === 'string') {
                        console.log(`[StructureViewProvider] Received 'saveAdditionalPrompt'. Saving text: "${message.text}"`);
                        await this._context.globalState.update(constants.ADDITIONAL_PROMPT_KEY, message.text);
                        // Optionally notify the user (can be silent)
                        // vscode.window.showInformationMessage("Additional prompt text saved.");
                    }
                    else {
                        console.warn("[StructureViewProvider] Received 'saveAdditionalPrompt' without valid text.");
                    }
                    return;
                // --- MODIFICATION END ---
                // --- MODIFICATION START: Handle request for initial additional prompt ---
                case 'requestInitialAdditionalPrompt':
                    console.log("[StructureViewProvider] Received 'requestInitialAdditionalPrompt'. Sending saved value.");
                    this.sendAdditionalPromptToWebview();
                    return;
                // --- MODIFICATION END ---
                case 'getStructure': // Add back
                    if (this._currentWorkspaceRoot) {
                        await this.refreshFileTree();
                    }
                    else {
                        if (this._view?.visible) {
                            vscode.window.showWarningMessage('No workspace folder open.');
                        }
                        this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                    }
                    return;
                case 'copySelectedFilesContent': // Add back (using new command name)
                    console.log("[StructureViewProvider] Received 'copySelectedFilesContent', executing command...");
                    vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                    return;
                case 'openFile': // Add back
                    if (message.path && this._currentWorkspaceRoot) {
                        try {
                            const fileUri = vscode.Uri.joinPath(this._currentWorkspaceRoot, message.path.replace(/\\/g, '/'));
                            console.log(`[StructureViewProvider] Opening file: ${fileUri.fsPath}`);
                            vscode.workspace.openTextDocument(fileUri).then(doc => {
                                vscode.window.showTextDocument(doc, { preview: false });
                            }, err => {
                                console.error(`[StructureViewProvider] Failed to open document ${fileUri.fsPath}:`, err);
                                vscode.window.showErrorMessage(`Could not open document: ${message.path}`);
                            });
                        }
                        catch (error) {
                            console.error(`[StructureViewProvider] Error constructing URI or opening file ${message.path}:`, error);
                            vscode.window.showErrorMessage(`Error trying to open file: ${message.path}`);
                        }
                    }
                    else {
                        console.warn(`[StructureViewProvider] 'openFile' message received without path or workspace root.`);
                        vscode.window.showWarningMessage('Could not determine the file to open.');
                    }
                    return;
                case 'showError':
                    vscode.window.showErrorMessage(message.text);
                    return;
                case 'showInfo':
                    vscode.window.showInformationMessage(message.text);
                    return;
                case 'webviewReady': // Add back
                    console.log("[StructureViewProvider] Webview is ready. Checking for workspace...");
                    if (this._currentWorkspaceRoot) {
                        console.log("[StructureViewProvider] Workspace found, requesting initial structure.");
                        this.refreshFileTree(); // Trigger initial load
                    }
                    else {
                        console.log("[StructureViewProvider] No workspace found on webview ready.");
                        this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                    }
                    // Send initial undo state when webview is ready
                    this.sendUndoState();
                    // --- MODIFICATION START: Send initial additional prompt ---
                    this.sendAdditionalPromptToWebview();
                    // --- MODIFICATION END ---
                    return;
                case 'requestInitialUndoState':
                    console.log("[StructureViewProvider] Received 'requestInitialUndoState' message.");
                    this.sendUndoState();
                    return;
            }
        }, undefined, this._context.subscriptions);
        // Refresh tree if the view becomes visible and workspace exists (Restore this)
        const visibilityChangeListener = webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log("[StructureViewProvider] View became visible.");
                // Refresh tree if workspace exists
                if (this._currentWorkspaceRoot) {
                    console.log("[StructureViewProvider] Refreshing tree on visibility.");
                    this.refreshFileTree();
                }
                else {
                    // Ensure view is cleared if no workspace on visibility change
                    this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                }
                // Always update undo state on visibility change
                this.sendUndoState();
                // --- MODIFICATION START: Send additional prompt on visibility change ---
                this.sendAdditionalPromptToWebview();
                // --- MODIFICATION END ---
            }
            else {
                console.log("[StructureViewProvider] View became hidden.");
            }
        });
        this._context.subscriptions.push(visibilityChangeListener);
        // Send initial active file if needed (keep commented for now)
        // this._sendActiveFileToWebview(vscode.window.activeTextEditor?.document.uri);
    }
    // Helper method to send the current undo state
    sendUndoState() {
        if (!this._view)
            return;
        const currentCheckpointHash = this._context.workspaceState.get(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
        console.log(`[StructureViewProvider.sendUndoState] Sending updateUndoState. Checkpoint available: ${!!currentCheckpointHash}`);
        this._view.webview.postMessage({ command: 'updateUndoState', canUndo: !!currentCheckpointHash });
    }
    // --- MODIFICATION START: Helper method to send additional prompt ---
    sendAdditionalPromptToWebview() {
        if (!this._view)
            return;
        const savedPrompt = this._context.globalState.get(constants.ADDITIONAL_PROMPT_KEY, ''); // Default to empty string
        console.log(`[StructureViewProvider.sendAdditionalPromptToWebview] Sending additional prompt: "${savedPrompt}"`);
        this._view.webview.postMessage({ command: 'updateAdditionalPrompt', text: savedPrompt });
    }
    // --- MODIFICATION END ---
    // Restore refreshFileTree method
    async refreshFileTree() {
        if (!this._view) {
            console.log("[refreshFileTree] View not available for refresh.");
            return;
        }
        if (!this._currentWorkspaceRoot) {
            console.log("[refreshFileTree] No workspace open, sending clear signal.");
            this._view.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
            return;
        }
        ;
        console.log(`[StructureViewProvider.refreshFileTree] START Refreshing for: ${this._currentWorkspaceRoot.fsPath}`);
        this._view.webview.postMessage({ command: 'setLoading', isLoading: true });
        console.log(`[StructureViewProvider.refreshFileTree] Posted setLoading: true`);
        try {
            console.log(`[StructureViewProvider.refreshFileTree] Calling getWorkspaceTree for root...`);
            const treeData = await (0, fileSystemService_1.getWorkspaceTree)(this._currentWorkspaceRoot, ''); // Use imported function
            console.log(`[StructureViewProvider.refreshFileTree] getWorkspaceTree returned. Tree data fetched, sending to webview.`);
            this._view.webview.postMessage({
                command: 'structureData',
                data: treeData,
                workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name,
                workspaceFolderPath: this._currentWorkspaceRoot?.fsPath,
                // activeFilePath: this._getRelativePath(vscode.window.activeTextEditor?.document.uri) // Send active file if highlighting is restored
            });
        }
        catch (error) {
            console.error("[StructureViewProvider.refreshFileTree] CATCH block: Error getting workspace tree:", error);
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound' && this._currentWorkspaceRoot && error.message.includes(this._currentWorkspaceRoot.fsPath)) {
                console.warn("[StructureViewProvider.refreshFileTree] CATCH block: Workspace root likely removed during refresh.");
                this._view.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
            }
            else {
                vscode.window.showErrorMessage(`Error reading workspace structure: ${error instanceof Error ? error.message : String(error)}`);
                this._view.webview.postMessage({ command: 'structureData', data: null, error: 'Failed to read workspace' });
            }
        }
        finally {
            console.log(`[StructureViewProvider.refreshFileTree] FINALLY block: Posting setLoading: false`);
            this._view.webview.postMessage({ command: 'setLoading', isLoading: false });
            console.log(`[StructureViewProvider.refreshFileTree] FINALLY block: Posted setLoading: false`);
        }
    }
    // Restore _getHtmlForWebview (it was likely removed implicitly before)
    _getHtmlForWebview(webview) {
        return (0, htmlContent_1.getHtmlForWebview)(webview, this._extensionUri, 'structure'); // Pass viewType
    }
}
exports.StructureViewProvider = StructureViewProvider;
//# sourceMappingURL=StructureViewProvider.js.map