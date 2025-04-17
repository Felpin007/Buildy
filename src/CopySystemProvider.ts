// src/CopySystemProvider.ts
import * as vscode from 'vscode';
import { getHtmlForWebview } from './webview/htmlContent'; // Import the HTML generator
import { getWorkspaceTree } from './services/fileSystemService'; // Import tree service

export class CopySystemProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copySystemView'; // New view type

    // Add necessary properties from StructureViewProvider
    private _view?: vscode.WebviewView;
    private _currentWorkspaceRoot?: vscode.Uri;
    private readonly _context: vscode.ExtensionContext; // Add context

    constructor(
        private readonly _extensionUri: vscode.Uri,
        context: vscode.ExtensionContext // Accept context
    ) {
        this._context = context; // Store context
        this._currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;

        // Listen for workspace folder changes
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
            const rootChanged = this._currentWorkspaceRoot?.fsPath !== newRoot?.fsPath;
            this._currentWorkspaceRoot = newRoot;
            console.log(`[CopySystemProvider] Workspace folders changed. New root: ${this._currentWorkspaceRoot?.fsPath ?? 'None'}`);
            if (this._view?.visible) {
                this._view?.webview.postMessage({ command: 'workspaceChanged' }); // Notify webview
                if (rootChanged && this._currentWorkspaceRoot) {
                    console.log("[CopySystemProvider] Root changed, refreshing tree.");
                    this.refreshFileTree();
                } else if (!this._currentWorkspaceRoot) {
                     console.log("[CopySystemProvider] Workspace closed, view notified.");
                     this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                }
            }
        });
        this._context.subscriptions.push(workspaceChangeListener);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView; // Store the view

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons')
            ]
        };

        // Set the HTML content using the imported function for 'copySystem' view
        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri, 'copySystem');

        // --- Add Message Handling (Copied & Adapted from StructureViewProvider) ---
        webviewView.webview.onDidReceiveMessage(
            async message => {
                console.log(`[CopySystemProvider] Received message: ${message.command}`);
                switch (message.command) {
                    // Cases relevant to the file explorer (Part 2)
                    case 'getStructure':
                        if (this._currentWorkspaceRoot) {
                            await this.refreshFileTree();
                        } else {
                             if (this._view?.visible) {
                                 vscode.window.showWarningMessage('Nenhuma pasta de workspace aberta.');
                             }
                             this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                        }
                        return;
                    case 'copySelectedFilesContent':
                         console.log("[CopySystemProvider] Received 'copySelectedFilesContent', executing command...");
                         // Execute the shared command
                         vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                        return;
                    case 'openFile':
                        if (message.path && this._currentWorkspaceRoot) {
                            try {
                                const fileUri = vscode.Uri.joinPath(this._currentWorkspaceRoot, message.path.replace(/\\/g, '/'));
                                console.log(`[CopySystemProvider] Opening file: ${fileUri.fsPath}`);
                                vscode.workspace.openTextDocument(fileUri).then(doc => {
                                    vscode.window.showTextDocument(doc, { preview: false });
                                }, err => {
                                     console.error(`[CopySystemProvider] Failed to open document ${fileUri.fsPath}:`, err);
                                     vscode.window.showErrorMessage(`Não foi possível abrir o documento: ${message.path}`);
                                });
                            } catch (error) {
                                console.error(`[CopySystemProvider] Error constructing URI or opening file ${message.path}:`, error);
                                vscode.window.showErrorMessage(`Erro ao tentar abrir o arquivo: ${message.path}`);
                            }
                        } else {
                             console.warn(`[CopySystemProvider] 'openFile' message received without path or workspace root.`);
                             vscode.window.showWarningMessage('Não foi possível determinar o arquivo a ser aberto.');
                        }
                        return;
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case 'showInfo':
                         vscode.window.showInformationMessage(message.text);
                         return;
                    case 'webviewReady':
                        console.log("[CopySystemProvider] Webview is ready. Checking for workspace...");
                        if (this._currentWorkspaceRoot) {
                             console.log("[CopySystemProvider] Workspace found, requesting initial structure.");
                            this.refreshFileTree(); // Trigger initial load
                        } else {
                            console.log("[CopySystemProvider] No workspace found on webview ready.");
                            this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                        }
                        return;
                    // NOTE: 'generateStructure' case is intentionally omitted here
                    case 'copyFilesToClipboard':
                        if (this._currentWorkspaceRoot && Array.isArray(message.paths) && message.paths.length > 0) {
                            try {
                                const absPaths = message.paths.map((relPath: string) =>
                                    vscode.Uri.joinPath(this._currentWorkspaceRoot!, relPath.replace(/\\/g, '/')).fsPath
                                );
                                console.log('[CopySystemProvider] copyFilesToClipboard absPaths:', absPaths);
                                // Lê o conteúdo de todos os arquivos e concatena
                                const fs = require('fs');
                                const os = require('os');
                                const path = require('path');
                                let combinedContent = '';
                                for (const filePath of absPaths) {
                                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                                        // Encontra o caminho relativo ao workspace root
                                        const relPath = path.relative(this._currentWorkspaceRoot.fsPath, filePath).replace(/\\/g, '/');
                                        combinedContent += `/${relPath}\n`;
                                        const content = fs.readFileSync(filePath, 'utf8');
                                        combinedContent += content + '\n\n';
                                    }
                                }
                                if (!combinedContent) {
                                    vscode.window.showWarningMessage('No file content could be read or copied.');
                                    return;
                                }
                                // Cria arquivo temporário
                                const tmpDir = os.tmpdir();
                                const tmpFile = path.join(tmpDir, 'Combined.txt');
                                fs.writeFileSync(tmpFile, combinedContent, 'utf8');
                                // Prepara script PowerShell para copiar o arquivo temporário para a clipboard como arquivo
                                const script = `
$ErrorActionPreference = 'Stop'
$files = @('${tmpFile.replace(/'/g, "''")}')
Add-Type -AssemblyName System.Windows.Forms
$fileDropList = New-Object System.Collections.Specialized.StringCollection
$fileDropList.AddRange($files)
[System.Windows.Forms.Clipboard]::SetFileDropList($fileDropList)
Start-Sleep -Milliseconds 200
`;
                                const utf16leBuffer = Buffer.from(script, 'utf16le');
                                const base64Command = utf16leBuffer.toString('base64');
                                const command = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${base64Command}`;
                                console.log('[CopySystemProvider] copyFilesToClipboard PowerShell command:', command);
                                const cp = require('child_process');
                                cp.exec(command, (err: Error | null, stdout: string, stderr: string) => {
                                    console.log('[CopySystemProvider] PowerShell stdout:', stdout);
                                    console.log('[CopySystemProvider] PowerShell stderr:', stderr);
                                    if (err) {
                                        vscode.window.showErrorMessage('Failed to copy combined file to clipboard: ' + err.message);
                                    } else {
                                        vscode.window.showInformationMessage('Combined file copied to clipboard!');
                                    }
                                });
                            } catch (e) {
                                console.error('[CopySystemProvider] Falha ao copiar arquivo combinado:', e);
                                vscode.window.showErrorMessage('Falha ao copiar arquivo combinado: ' + (e instanceof Error ? e.message : String(e)));
                            }
                        } else {
                            vscode.window.showWarningMessage('Nenhum arquivo selecionado para copiar para a área de transferência.');
                        }
                        return;
                }
            },
            undefined,
            this._context.subscriptions // Use the provider's context
        );

        // --- Add Visibility Change Listener (Copied & Adapted from StructureViewProvider) ---
        const visibilityChangeListener = webviewView.onDidChangeVisibility(() => {
             if (webviewView.visible && this._currentWorkspaceRoot) {
                  console.log("[CopySystemProvider] View became visible, refreshing tree.");
                  this.refreshFileTree();
             } else if (webviewView.visible && !this._currentWorkspaceRoot) {
                 console.log("[CopySystemProvider] View became visible, no workspace.");
                 this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
             } else {
                 console.log("[CopySystemProvider] View became hidden.");
             }
        });
        this._context.subscriptions.push(visibilityChangeListener);
    }

    // --- Add refreshFileTree Method (Copied & Adapted from StructureViewProvider) ---
    public async refreshFileTree() {
         if (!this._view) {
             console.log("[CopySystemProvider.refreshFileTree] View not available for refresh.");
             return;
         }
         if (!this._currentWorkspaceRoot) {
             console.log("[CopySystemProvider.refreshFileTree] No workspace open, sending clear signal.");
             this._view.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
             return;
         };

         console.log(`[CopySystemProvider.refreshFileTree] START Refreshing for: ${this._currentWorkspaceRoot.fsPath}`);
         this._view.webview.postMessage({ command: 'setLoading', isLoading: true });
         console.log(`[CopySystemProvider.refreshFileTree] Posted setLoading: true`);
         try {
             console.log(`[CopySystemProvider.refreshFileTree] Calling getWorkspaceTree for root...`);
             const treeData = await getWorkspaceTree(this._currentWorkspaceRoot, ''); // Use imported function
             console.log(`[CopySystemProvider.refreshFileTree] getWorkspaceTree returned. Tree data fetched, sending to webview.`);
             this._view.webview.postMessage({
                 command: 'structureData',
                 data: treeData,
                 workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name,
                 workspaceFolderPath: this._currentWorkspaceRoot?.fsPath,
             });
         } catch (error) {
             console.error("[CopySystemProvider.refreshFileTree] CATCH block: Error getting workspace tree:", error);
             if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound' && this._currentWorkspaceRoot && error.message.includes(this._currentWorkspaceRoot.fsPath)) {
                 console.warn("[CopySystemProvider.refreshFileTree] CATCH block: Workspace root likely removed during refresh.");
                 this._view.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
             } else {
                 vscode.window.showErrorMessage(`Erro ao ler a estrutura do workspace: ${error instanceof Error ? error.message : String(error)}`);
                 this._view.webview.postMessage({ command: 'structureData', data: null, error: 'Failed to read workspace' });
             }
         } finally {
             console.log(`[CopySystemProvider.refreshFileTree] FINALLY block: Posting setLoading: false`);
             this._view.webview.postMessage({ command: 'setLoading', isLoading: false });
             console.log(`[CopySystemProvider.refreshFileTree] FINALLY block: Posted setLoading: false`);
         }
    }
}