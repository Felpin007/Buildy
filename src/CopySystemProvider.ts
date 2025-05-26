import * as vscode from 'vscode';
import { getHtmlForWebview } from './webview/htmlContent';
import { getWorkspaceTree } from './services/fileSystemService';
export class CopySystemProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copySystemView';
    private _view?: vscode.WebviewView;
    private _currentWorkspaceRoot?: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    constructor(
        private readonly _extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._context = context;
        this._currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
            const rootChanged = this._currentWorkspaceRoot?.fsPath !== newRoot?.fsPath;
            this._currentWorkspaceRoot = newRoot;
            console.log(`[CopySystemProvider] Pastas do workspace alteradas. Nova raiz: ${this._currentWorkspaceRoot?.fsPath ?? 'Nenhuma'}`);
            if (this._view?.visible) {
                this._view?.webview.postMessage({ command: 'workspaceChanged' });
                if (rootChanged && this._currentWorkspaceRoot) {
                    console.log("[CopySystemProvider] Raiz alterada, atualizando árvore.");
                    this.refreshFileTree();
                } else if (!this._currentWorkspaceRoot) {
                     console.log("[CopySystemProvider] Workspace fechado, visualização notificada.");
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
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons')
            ]
        };
        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri, 'copySystem');
        webviewView.webview.onDidReceiveMessage(
            async (message: any) => {
                console.log(`[CopySystemProvider] Mensagem recebida: ${message.command}`);
                switch (message.command) {
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
                         console.log("[CopySystemProvider] Recebido 'copySelectedFilesContent', executando comando...");
                         vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                        return;
                    case 'openFile':
                        if (message.path && this._currentWorkspaceRoot) {
                            try {
                                const fileUri = vscode.Uri.joinPath(this._currentWorkspaceRoot, message.path.replace(/\\/g, '/'));
                                console.log(`[CopySystemProvider] Abrindo arquivo: ${fileUri.fsPath}`);
                                vscode.workspace.openTextDocument(fileUri).then((doc: vscode.TextDocument) => {
                                    vscode.window.showTextDocument(doc, { preview: false });
                                }, (err: any) => {
                                     console.error(`[CopySystemProvider] Falha ao abrir documento ${fileUri.fsPath}:`, err);
                                     vscode.window.showErrorMessage(`Não foi possível abrir o documento: ${message.path}`);
                                });
                            } catch (error) {
                                console.error(`[CopySystemProvider] Erro ao construir URI ou abrir arquivo ${message.path}:`, error);
                                vscode.window.showErrorMessage(`Erro ao tentar abrir o arquivo: ${message.path}`);
                            }
                        } else {
                             console.warn(`[CopySystemProvider] Mensagem 'openFile' recebida sem caminho ou raiz do workspace.`);
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
                        console.log("[CopySystemProvider] Webview está pronto. Verificando workspace...");
                        if (this._currentWorkspaceRoot) {
                             console.log("[CopySystemProvider] Workspace encontrado, solicitando estrutura inicial.");
                            this.refreshFileTree();
                        } else {
                            console.log("[CopySystemProvider] Nenhum workspace encontrado ao iniciar webview.");
                            this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
                        }
                        return;
                    case 'copyFilesToClipboard':
                        if (this._currentWorkspaceRoot && Array.isArray(message.paths) && message.paths.length > 0) {
                            try {
                                const absPaths = message.paths.map((relPath: string) =>
                                    vscode.Uri.joinPath(this._currentWorkspaceRoot!, relPath.replace(/\\/g, '/')).fsPath
                                );
                                console.log('[CopySystemProvider] copyFilesToClipboard caminhos absolutos:', absPaths);
                                const fs = require('fs');
                                const os = require('os');
                                const path = require('path');
                                let combinedContent = '';
                                for (const filePath of absPaths) {
                                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
                                const tmpDir = os.tmpdir();
                                const tmpFile = path.join(tmpDir, 'Combined.txt');
                                fs.writeFileSync(tmpFile, combinedContent, 'utf8');
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
                                console.log('[CopySystemProvider] copyFilesToClipboard comando PowerShell:', command);
                                const cp = require('child_process');
                                cp.exec(command, (err: Error | null, stdout: string, stderr: string) => {
                                    console.log('[CopySystemProvider] Saída do PowerShell:', stdout);
                                    console.log('[CopySystemProvider] Erro do PowerShell:', stderr);
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
            this._context.subscriptions
        );
        const visibilityChangeListener = webviewView.onDidChangeVisibility(() => {
             if (webviewView.visible && this._currentWorkspaceRoot) {
                  console.log("[CopySystemProvider] Visualização ficou visível, atualizando árvore.");
                  this.refreshFileTree();
             } else if (webviewView.visible && !this._currentWorkspaceRoot) {
                 console.log("[CopySystemProvider] Visualização ficou visível, sem workspace.");
                 this._view?.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
             } else {
                 console.log("[CopySystemProvider] Visualização ficou oculta.");
             }
        });
        this._context.subscriptions.push(visibilityChangeListener);
    }
    public async refreshFileTree() {
         if (!this._view) {
             console.log("[CopySystemProvider.refreshFileTree] Visualização não disponível para atualização.");
             return;
         }
         if (!this._currentWorkspaceRoot) {
             console.log("[CopySystemProvider.refreshFileTree] Nenhum workspace aberto, enviando sinal de limpeza.");
             this._view.webview.postMessage({ command: 'structureData', data: null, error: 'No workspace open' });
             return;
         };
         console.log(`[CopySystemProvider.refreshFileTree] INICIANDO Atualização para: ${this._currentWorkspaceRoot.fsPath}`);
         this._view.webview.postMessage({ command: 'setLoading', isLoading: true });
         console.log(`[CopySystemProvider.refreshFileTree] Enviado setLoading: true`);
         try {
             console.log(`[CopySystemProvider.refreshFileTree] Chamando getWorkspaceTree para raiz...`);
             const treeData = await getWorkspaceTree(this._currentWorkspaceRoot, '');
             console.log(`[CopySystemProvider.refreshFileTree] getWorkspaceTree retornou. Dados da árvore obtidos, enviando para webview.`);
             this._view.webview.postMessage({
                 command: 'structureData',
                 data: treeData,
                 workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name,
                 workspaceFolderPath: this._currentWorkspaceRoot?.fsPath,
             });
         } catch (error) {
             console.error("[CopySystemProvider.refreshFileTree] Bloco CATCH: Erro ao obter árvore do workspace:", error);
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
