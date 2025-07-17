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
                        if (this._view?.visible) {
                this._view?.webview.postMessage({ command: WebviewCommands.WORKSPACE_CHANGED });
                if (rootChanged && this._currentWorkspaceRoot) {
                                        this.refreshFileTree();
                } else if (!this._currentWorkspaceRoot) {
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
                                switch (message.command) {
                    case WebviewCommands.GET_PROMPT_CONTENT:
                        this.sendPromptContent(message.platform);
                        return;
                    case WebviewCommands.GENERATE_STRUCTURE:
                                                vscode.commands.executeCommand('buildy.processPastedStructure', message.text, this._view?.webview);
                        return;
                    case WebviewCommands.SHOW_DIFF:
                                                                                    vscode.commands.executeCommand('buildy.showDiff', {
                                              relativePath: message.path,
                                              type: message.type
                                          });
                                          return;
                    case WebviewCommands.UNDO_LAST_GENERATION:
                                                                  vscode.commands.executeCommand('buildy.undoLastGeneration', undefined, this._view?.webview, message.skipConfirmation);
                        return;
                    case WebviewCommands.SAVE_ADDITIONAL_PROMPT:
                        if (typeof message.text === 'string') {
                                                          await this._context.globalState.update(constants.ADDITIONAL_PROMPT_KEY, message.text);
                        } else {
                             console.warn("[StructureViewProvider] Received 'saveAdditionalPrompt' without valid text.");
                        }
                        return;
                    case WebviewCommands.REQUEST_INITIAL_ADDITIONAL_PROMPT:
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
                                                  vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                        return;
                    case WebviewCommands.OPEN_FILE:
                        if (message.path && this._currentWorkspaceRoot) {
                            try {
                                const fileUri = vscode.Uri.joinPath(this._currentWorkspaceRoot, message.path.replace(/\\/g, '/'));
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
                                                this.sendUndoState();
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );
        const visibilityChangeListener = webviewView.onDidChangeVisibility(() => {
             if (webviewView.visible) {
                                  if (this._currentWorkspaceRoot) {
                                          this.refreshFileTree();
                 } else {
                      this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                 }
                 this.sendUndoState();
                 this.sendAdditionalPromptToWebview();
             } else {
                              }
        });
        this._context.subscriptions.push(visibilityChangeListener);
    }
    private sendUndoState() {
        if (!this._view) return;
        const currentCheckpointHash = this._context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
                this._view.webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: !!currentCheckpointHash });
    }
    private sendAdditionalPromptToWebview() {
        if (!this._view) return;
        const savedPrompt = this._context.globalState.get<string>(constants.ADDITIONAL_PROMPT_KEY, '');
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
            
                        
            if (fs.existsSync(promptFilePath)) {
                const content = fs.readFileSync(promptFilePath, 'utf8');
                this._view.webview.postMessage({ 
                    command: WebviewCommands.PROMPT_CONTENT, 
                    platform: platform, 
                    content: content 
                });
                            } else {
                console.error(`[StructureViewProvider.sendPromptContent] Arquivo de prompt não encontrado: ${promptFilePath}`);
                this._view.webview.postMessage({ 
                    command: WebviewCommands.SHOW_ERROR, 
                    text: `Error loading prompt for ${platform}: file not found.` 
                });
            }
        } catch (error) {
            console.error(`[StructureViewProvider.sendPromptContent] Erro ao carregar prompt para ${platform}:`, error);
            this._view.webview.postMessage({ 
                command: WebviewCommands.SHOW_ERROR, 
                text: `Error loading prompt for ${platform}: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }
    /**
     * Atualiza a árvore de arquivos do workspace e envia para o webview
     * Usado quando o workspace muda ou quando solicitado explicitamente
     */
    public async refreshFileTree() {
         if (!this._view) {
                          return;
         }
         if (!this._currentWorkspaceRoot) {
                          this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             return;
         };
                  this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: true });
                  try {
                          const treeData = await getWorkspaceTree(this._currentWorkspaceRoot, '');
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
                          this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: false });
                      }
    }
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getHtmlForWebview(webview, this._extensionUri, 'structure');
    }
}

