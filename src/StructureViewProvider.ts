import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getHtmlForWebview } from './webview/htmlContent';
import { getNonce } from './utils/nonce';
import { getWorkspaceTree } from './services/fileSystemService';
import * as constants from './constants';
import { WebviewCommands } from './webview/webviewCommands';
/**
 * Provedor da visualização principal da extensão Buildy.
 * Responsável por gerenciar a interface que permite ao usuário colar respostas da IA,
 * gerar estruturas de código, executar comandos e gerenciar o sistema de desfazer.
 */
export class StructureViewProvider implements vscode.WebviewViewProvider {
    /**
     * Identificador único da visualização utilizado para registro no VS Code
     */
    public static readonly viewType = 'structureView';
    private _view?: vscode.WebviewView;
    private _currentWorkspaceRoot?: vscode.Uri;
    private _activeEditorListener?: vscode.Disposable;
    /**
     * Cria uma nova instância do provedor de visualização da estrutura
     * @param _extensionUri URI da extensão para carregar recursos locais
     * @param _context Contexto da extensão para armazenar estado e registrar listeners
     */
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
            const rootChanged = this._currentWorkspaceRoot?.fsPath !== newRoot?.fsPath;
            this._currentWorkspaceRoot = newRoot;
            console.log(`[StructureViewProvider] Workspace folders changed. New root: ${this._currentWorkspaceRoot?.fsPath ?? 'None'}`);
            if (this._view?.visible) {
                this._view?.webview.postMessage({ command: WebviewCommands.WORKSPACE_CHANGED });
                if (rootChanged && this._currentWorkspaceRoot) {
                    console.log("[StructureViewProvider] Root changed, refreshing tree.");
                    this.refreshFileTree();
                } else if (!this._currentWorkspaceRoot) {
                    console.log("[StructureViewProvider] Workspace closed, view notified.");
                }
            }
        });
        this._context.subscriptions.push(workspaceChangeListener);
       }
    /**
     * Retorna a visualização atual do webview, se disponível
     * @returns A instância atual do webview ou undefined se não estiver inicializado
     */
    public getWebviewView(): vscode.WebviewView | undefined {
        return this._view;
    }
    /**
     * Método chamado pelo VS Code quando a visualização é inicializada ou restaurada
     * Configura o HTML, scripts e manipuladores de eventos do webview
     * @param webviewView A visualização do webview a ser configurada
     * @param context Contexto de resolução do webview
     * @param _token Token de cancelamento para operações assíncronas
     */
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
        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri, 'structure');
        webviewView.webview.onDidReceiveMessage(
            async message => {
                console.log(`[StructureViewProvider] Received message: ${message.command}`);
                switch (message.command) {
                    case WebviewCommands.GET_PROMPT_CONTENT:
                        this.sendPromptContent(message.platform);
                        return;
                    case WebviewCommands.GENERATE_STRUCTURE:
                        console.log(`[StructureViewProvider] Received 'generateStructure' message from webview. Executing command...`);
                        vscode.commands.executeCommand('buildy.processPastedStructure', message.text, this._view?.webview);
                        return;
                    case WebviewCommands.SHOW_DIFF:
                                          console.log(`[StructureViewProvider] Received 'showDiff' message for path: ${message.path}, type: ${message.type}`);
                                          vscode.commands.executeCommand('buildy.showDiff', {
                                              relativePath: message.path,
                                              type: message.type
                                          });
                                          return;
                    case WebviewCommands.UNDO_LAST_GENERATION:
                        console.log(`[StructureViewProvider] Received 'undoLastGeneration' message. skipConfirmation: ${message.skipConfirmation}`);
                                          vscode.commands.executeCommand('buildy.undoLastGeneration', undefined, this._view?.webview, message.skipConfirmation);
                        return;
                    case WebviewCommands.SAVE_ADDITIONAL_PROMPT:
                        if (typeof message.text === 'string') {
                             console.log(`[StructureViewProvider] Received 'saveAdditionalPrompt'. Saving text: "${message.text}"`);
                             await this._context.globalState.update(constants.ADDITIONAL_PROMPT_KEY, message.text);
                        } else {
                             console.warn("[StructureViewProvider] Received 'saveAdditionalPrompt' without valid text.");
                        }
                        return;
                    case WebviewCommands.REQUEST_INITIAL_ADDITIONAL_PROMPT:
                        console.log("[StructureViewProvider] Received 'requestInitialAdditionalPrompt'. Sending saved value.");
                        this.sendAdditionalPromptToWebview();
                        return;
                    case WebviewCommands.GET_STRUCTURE:
                        if (this._currentWorkspaceRoot) {
                            await this.refreshFileTree();
                        } else {
                             if (this._view?.visible) {
                                 vscode.window.showWarningMessage('No workspace folder open.');
                             }
                             this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                        }
                        return;
                    case WebviewCommands.COPY_SELECTED_FILES_CONTENT:
                         console.log("[StructureViewProvider] Received 'copySelectedFilesContent', executing command...");
                         vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                        return;
                    case WebviewCommands.OPEN_FILE:
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
                            } catch (error) {
                                console.error(`[StructureViewProvider] Error constructing URI or opening file ${message.path}:`, error);
                                vscode.window.showErrorMessage(`Error trying to open file: ${message.path}`);
                            }
                        } else {
                             console.warn(`[StructureViewProvider] 'openFile' message received without path or workspace root.`);
                             vscode.window.showWarningMessage('Could not determine the file to open.');
                        }
                        return;
                    case WebviewCommands.SHOW_ERROR:
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case WebviewCommands.SHOW_INFO:
                         vscode.window.showInformationMessage(message.text);
                         return;
                        this.sendUndoState();
                        this.sendAdditionalPromptToWebview();
                        return;
                    case WebviewCommands.REQUEST_INITIAL_UNDO_STATE:
                        console.log("[StructureViewProvider] Received 'requestInitialUndoState' message.");
                        this.sendUndoState();
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );
        const visibilityChangeListener = webviewView.onDidChangeVisibility(() => {
             if (webviewView.visible) {
                 console.log("[StructureViewProvider] View became visible.");
                 if (this._currentWorkspaceRoot) {
                     console.log("[StructureViewProvider] Refreshing tree on visibility.");
                     this.refreshFileTree();
                 } else {
                      this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                 }
                 this.sendUndoState();
                 this.sendAdditionalPromptToWebview();
             } else {
                 console.log("[StructureViewProvider] View became hidden.");
             }
        });
        this._context.subscriptions.push(visibilityChangeListener);
    }
    private sendUndoState() {
        if (!this._view) return;
        const currentCheckpointHash = this._context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
        console.log(`[StructureViewProvider.sendUndoState] Sending updateUndoState. Checkpoint available: ${!!currentCheckpointHash}`);
        this._view.webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: !!currentCheckpointHash });
    }
    private sendAdditionalPromptToWebview() {
        if (!this._view) return;
        const savedPrompt = this._context.globalState.get<string>(constants.ADDITIONAL_PROMPT_KEY, '');
        console.log(`[StructureViewProvider.sendAdditionalPromptToWebview] Sending additional prompt: "${savedPrompt}"`);
        this._view.webview.postMessage({ command: WebviewCommands.UPDATE_ADDITIONAL_PROMPT, text: savedPrompt });
    }
    
    /**
     * Carrega o conteúdo do prompt de um arquivo e envia para o webview
     * @param platform Plataforma para a qual o prompt deve ser carregado ('windows' ou 'linux')
     */
    private sendPromptContent(platform: string) {
        if (!this._view) return;
        
        try {
            const promptFilePath = path.join(
                this._extensionUri.fsPath, 
                'media', 
                'webview', 
                'prompts', 
                platform === 'windows' ? 'windows.txt' : 'linux.txt'
            );
            
            console.log(`[StructureViewProvider.sendPromptContent] Carregando prompt para ${platform} de: ${promptFilePath}`);
            
            if (fs.existsSync(promptFilePath)) {
                const content = fs.readFileSync(promptFilePath, 'utf8');
                this._view.webview.postMessage({ 
                    command: WebviewCommands.PROMPT_CONTENT, 
                    platform: platform, 
                    content: content 
                });
                console.log(`[StructureViewProvider.sendPromptContent] Prompt para ${platform} enviado com sucesso.`);
            } else {
                console.error(`[StructureViewProvider.sendPromptContent] Arquivo de prompt não encontrado: ${promptFilePath}`);
                this._view.webview.postMessage({ 
                    command: WebviewCommands.SHOW_ERROR, 
                    text: `Erro ao carregar prompt para ${platform}: arquivo não encontrado.` 
                });
            }
        } catch (error) {
            console.error(`[StructureViewProvider.sendPromptContent] Erro ao carregar prompt para ${platform}:`, error);
            this._view.webview.postMessage({ 
                command: WebviewCommands.SHOW_ERROR, 
                text: `Erro ao carregar prompt para ${platform}: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }
    /**
     * Atualiza a árvore de arquivos do workspace e envia para o webview
     * Usado quando o workspace muda ou quando solicitado explicitamente
     */
    public async refreshFileTree() {
         if (!this._view) {
             console.log("[refreshFileTree] View not available for refresh.");
             return;
         }
         if (!this._currentWorkspaceRoot) {
             console.log("[refreshFileTree] No workspace open, sending clear signal.");
             this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             return;
         };
         console.log(`[StructureViewProvider.refreshFileTree] START Refreshing for: ${this._currentWorkspaceRoot.fsPath}`);
         this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: true });
         console.log(`[StructureViewProvider.refreshFileTree] Posted setLoading: true`);
         try {
             console.log(`[StructureViewProvider.refreshFileTree] Calling getWorkspaceTree for root...`);
             const treeData = await getWorkspaceTree(this._currentWorkspaceRoot, '');
             console.log(`[StructureViewProvider.refreshFileTree] getWorkspaceTree returned. Tree data fetched, sending to webview.`);
             this._view.webview.postMessage({
                 command: WebviewCommands.STRUCTURE_DATA,
                 data: treeData,
                 workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name,
                 workspaceFolderPath: this._currentWorkspaceRoot?.fsPath,
             });
         } catch (error) {
             console.error("[StructureViewProvider.refreshFileTree] CATCH block: Error getting workspace tree:", error);
             if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound' && this._currentWorkspaceRoot && error.message.includes(this._currentWorkspaceRoot.fsPath)) {
                 console.warn("[StructureViewProvider.refreshFileTree] CATCH block: Workspace root likely removed during refresh.");
                 this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             } else {
                 vscode.window.showErrorMessage(`Error reading workspace structure: ${error instanceof Error ? error.message : String(error)}`);
                 this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'Failed to read workspace' });
             }
         } finally {
             console.log(`[StructureViewProvider.refreshFileTree] FINALLY block: Posting setLoading: false`);
             this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: false });
             console.log(`[StructureViewProvider.refreshFileTree] FINALLY block: Posted setLoading: false`);
         }
    }
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getHtmlForWebview(webview, this._extensionUri, 'structure');
    }
    /*
    private _setupActiveEditorListener() {
        this._activeEditorListener?.dispose();
        this._activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log(`[StructureViewProvider] Active editor changed: ${editor?.document.uri.fsPath ?? 'None'}`);
            this._sendActiveFileToWebview(editor?.document.uri);
        });
        this._context.subscriptions.push(this._activeEditorListener);
    }
    private _sendActiveFileToWebview(fileUri: vscode.Uri | undefined) {
        if (this._view && fileUri) {
            const relativePath = this._getRelativePath(fileUri);
            if (relativePath !== null) {
                console.log(`[StructureViewProvider] Sending setActiveFile: ${relativePath}`);
                this._view.webview.postMessage({ command: 'setActiveFile', path: relativePath });
            } else {
                 console.log(`[StructureViewProvider] Active file outside workspace, sending null path.`);
                 this._view.webview.postMessage({ command: 'setActiveFile', path: null });
            }
        } else if (this._view) {
            console.log(`[StructureViewProvider] No active file, sending null path.`);
            this._view.webview.postMessage({ command: 'setActiveFile', path: null });
        }
    }
    private _getRelativePath(fileUri: vscode.Uri | undefined): string | null {
        if (!fileUri || !this._currentWorkspaceRoot) {
            return null;
        }
        const workspacePath = this._currentWorkspaceRoot.path.replace(/\\/g, '/');
        const filePath = fileUri.path.replace(/\\/g, '/');
        if (filePath.startsWith(workspacePath + '/')) {
            return path.relative(this._currentWorkspaceRoot.fsPath, fileUri.fsPath).replace(/\\/g, '/');
        }
        return null;
    }
    */
}
