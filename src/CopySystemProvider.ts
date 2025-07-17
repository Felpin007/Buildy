import * as vscode from 'vscode';
import { getHtmlForWebview } from './webview/htmlContent';
import { getWorkspaceTree } from './services/fileSystemService';
import { WebviewCommands } from './webview/webviewCommands';
/**
 * Provedor do sistema de cópia de arquivos da extensão Buildy.
 * Gerencia a interface que permite ao usuário navegar na estrutura de arquivos,
 * selecionar arquivos e copiar seus conteúdos para a área de transferência.
 */
export class CopySystemProvider implements vscode.WebviewViewProvider {
    /**
     * Identificador único da visualização utilizado para registro no VS Code
     */
    public static readonly viewType = 'copySystemView';
    private _view?: vscode.WebviewView;
    private _currentWorkspaceRoot?: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _isVSCodeDetected: boolean = false;
    private _notificationMethod: 'vscode' | 'console' = 'console';

    /**
     * Cria uma nova instância do provedor do sistema de cópia
     * @param _extensionUri URI da extensão para carregar recursos locais
     * @param context Contexto da extensão para armazenar estado e registrar listeners
     */
    constructor(
        private readonly _extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this.detectVSCode();
        this.setupNotificationMethod();
        this._context = context;
        this._currentWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
            const rootChanged = this._currentWorkspaceRoot?.fsPath !== newRoot?.fsPath;
            this._currentWorkspaceRoot = newRoot;
            console.log(`[CopySystemProvider] Pastas do workspace alteradas. Nova raiz: ${this._currentWorkspaceRoot?.fsPath ?? 'Nenhuma'}`);
            if (this._view?.visible) {
                this._view?.webview.postMessage({ command: WebviewCommands.WORKSPACE_CHANGED });
                if (rootChanged && this._currentWorkspaceRoot) {
                    console.log("[CopySystemProvider] Raiz alterada, atualizando árvore.");
                    this.refreshFileTree();
                } else if (!this._currentWorkspaceRoot) {
                     console.log("[CopySystemProvider] Workspace fechado, visualização notificada.");
                     this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                }
            }
        });
        this._context.subscriptions.push(workspaceChangeListener);
    }

    /**
     * Detecta se está rodando no VS Code oficial
     */
    private detectVSCode(): void {
        try {
            // Verifica se é VS Code oficial através de múltiplos indicadores
            const isVSCode = vscode.env.appName === 'Visual Studio Code' &&
                           vscode.env.uriScheme === 'vscode' &&
                           !vscode.env.appName.includes('Insiders') &&
                           !vscode.env.appName.includes('OSS');
            
            this._isVSCodeDetected = isVSCode;
            console.log(`[CopySystemProvider] VS Code detectado: ${isVSCode}, App: ${vscode.env.appName}, Scheme: ${vscode.env.uriScheme}`);
        } catch (error) {
            console.error('[CopySystemProvider] Erro ao detectar VS Code:', error);
            this._isVSCodeDetected = false;
        }
    }

    /**
     * Configura o método de notificação baseado na detecção do VS Code
     */
    private setupNotificationMethod(): void {
        this._notificationMethod = this._isVSCodeDetected ? 'vscode' : 'console';
        console.log(`[CopySystemProvider] Método de notificação configurado: ${this._notificationMethod}`);
    }

    /**
     * Exibe notificação usando o método apropriado
     */
    private showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        if (this._notificationMethod === 'vscode') {
            // Usar notificações nativas do VS Code
            switch (type) {
                case 'info':
                    vscode.window.showInformationMessage(message);
                    break;
                case 'warning':
                    vscode.window.showWarningMessage(message);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message);
                    break;
            }
        } else {
            // Usar notificações internas no webview
            this._view?.webview.postMessage({
                command: WebviewCommands.SHOW_INTERNAL_NOTIFICATION,
                message: message,
                type: type
            });
            console.log(`[CopySystemProvider] Notificação interna: [${type.toUpperCase()}] ${message}`);
        }
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
        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri, 'copySystem');
        webviewView.webview.onDidReceiveMessage(
            async (message: any) => {
                console.log(`[CopySystemProvider] Mensagem recebida: ${message.command}`);
                switch (message.command) {
                    case WebviewCommands.GET_STRUCTURE:
                        if (this._currentWorkspaceRoot) {
                            await this.refreshFileTree();
                        } else {
                             if (this._view?.visible) {
                                 this.showNotification('No workspace folder open.', 'warning');
                             }
                             this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                        }
                        return;
                    case WebviewCommands.COPY_SELECTED_FILES_CONTENT:
                         console.log("[CopySystemProvider] Recebido 'copySelectedFilesContent', executando comando...");
                         try {
                             await vscode.commands.executeCommand('buildy.copySelectedFilesContent', message.paths);
                             // Enviar notificação de sucesso para o webview
                             this.showNotification(`Content from ${message.paths?.length || 0} file(s) copied to clipboard.`, 'info');
                         } catch (error) {
                             console.error('[CopySystemProvider] Erro ao executar copySelectedFilesContent:', error);
                             this.showNotification('Failed to copy selected files content.', 'error');
                         }
                        return;
                    case WebviewCommands.OPEN_FILE:
                        if (message.path && this._currentWorkspaceRoot) {
                            try {
                                const fileUri = vscode.Uri.joinPath(this._currentWorkspaceRoot, message.path.replace(/\\/g, '/'));
                                console.log(`[CopySystemProvider] Abrindo arquivo: ${fileUri.fsPath}`);
                                vscode.workspace.openTextDocument(fileUri).then((doc: vscode.TextDocument) => {
                                    vscode.window.showTextDocument(doc, { preview: false });
                                }, (err: any) => {
                                     console.error(`[CopySystemProvider] Falha ao abrir documento ${fileUri.fsPath}:`, err);
                                     this.showNotification(`Could not open document: ${message.path}`, 'error');
                                });
                            } catch (error) {
                                console.error(`[CopySystemProvider] Erro ao construir URI ou abrir arquivo ${message.path}:`, error);
                                this.showNotification(`Error trying to open file: ${message.path}`, 'error');
                            }
                        } else {
                             console.warn(`[CopySystemProvider] Mensagem 'openFile' recebida sem caminho ou raiz do workspace.`);
                             this.showNotification('Could not determine the file to open.', 'warning');
                        }
                        return;
                    case WebviewCommands.SHOW_ERROR:
                        this.showNotification(message.text, 'error');
                        return;
                    case WebviewCommands.SHOW_INFO:
                         this.showNotification(message.text, 'info');
                         return;
                    case WebviewCommands.WEBVIEW_READY:
                        console.log("[CopySystemProvider] Webview está pronto. Verificando workspace...");
                        if (this._currentWorkspaceRoot) {
                             console.log("[CopySystemProvider] Workspace encontrado, solicitando estrutura inicial.");
                            this.refreshFileTree();
                        } else {
                            console.log("[CopySystemProvider] Nenhum workspace encontrado ao iniciar webview.");
                            this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
                        }
                        return;
                    case WebviewCommands.COPY_FILES_TO_CLIPBOARD:
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
                                        combinedContent += `/${relPath}\n\n`;
                                        
                                        // Verificar se é arquivo binário/mídia
                                        const ext = path.extname(filePath).toLowerCase();
                                        const binaryExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov', '.wav', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.exe', '.dll', '.so', '.dylib'];
                                        
                                        if (binaryExtensions.includes(ext)) {
                                            // Para arquivos binários, mostrar apenas o nome
                                            combinedContent += `  1 [Arquivo binário: ${path.basename(filePath)}]\n\n`;
                                        } else {
                                            try {
                                                const content = fs.readFileSync(filePath, 'utf8');
                                                
                                                // Adicionar numeração de linhas
                                                const lines = content.split('\n');
                                                const numberedContent = lines.map((line: string, index: number) => {
                                                    const lineNumber = (index + 1).toString().padStart(3, ' ');
                                                    return `${lineNumber} ${line}`;
                                                }).join('\n');
                                                
                                                combinedContent += numberedContent + '\n\n';
                                            } catch (error) {
                                                // Se falhar ao ler como texto, tratar como binário
                                                combinedContent += `  1 [Arquivo binário: ${path.basename(filePath)}]\n\n`;
                                            }
                                        }
                                    }
                                }
                                if (!combinedContent) {
                                    this.showNotification('No file content could be read or copied.', 'warning');
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
                                        this.showNotification('Failed to copy combined file to clipboard: ' + err.message, 'error');
                                    } else {
                                        this.showNotification('Combined file copied to clipboard!', 'info');
                                    }
                                });
                            } catch (e) {
                                console.error('[CopySystemProvider] Falha ao copiar arquivo combinado:', e);
                                this.showNotification('Failed to copy combined file: ' + (e instanceof Error ? e.message : String(e)), 'error');
                            }
                        } else {
                            this.showNotification('No files selected for copying to clipboard.', 'warning');
                        }
                        return;
                    case WebviewCommands.COPY_DIFF_TO_CLIPBOARD:
                        console.log('[CopySystemProvider] Recebido comando para copiar diff para clipboard');
                        await this.copyDiffToClipboard();
                        return;
                    case WebviewCommands.CREATE_SOLUTION_FILE:
                        console.log('[CopySystemProvider] Recebido comando para criar arquivo solucao.txt');
                        await this.createSolutionFile(message.content);
                        return;
                    case WebviewCommands.DELETE_SOLUTION_FILE:
                        console.log('[CopySystemProvider] Recebido comando para excluir arquivo solucao.txt');
                        await this.deleteSolutionFile();
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
                 this._view?.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             } else {
                 console.log("[CopySystemProvider] Visualização ficou oculta.");
             }
        });
        this._context.subscriptions.push(visibilityChangeListener);
    }
    /**
     * Copia o diff das mudanças não commitadas para o clipboard como arquivo diff.txt
     */
    private async copyDiffToClipboard(): Promise<void> {
        if (!this._currentWorkspaceRoot) {
            this.showNotification('No workspace folder open.', 'warning');
            return;
        }

        try {
            const cp = require('child_process');
            const os = require('os');
            const path = require('path');
            const fs = require('fs');

            // Executar git diff para obter as mudanças não commitadas
            const gitDiffCommand = 'git diff HEAD';
            
            cp.exec(gitDiffCommand, { cwd: this._currentWorkspaceRoot.fsPath }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    console.error('[CopySystemProvider] Erro ao executar git diff:', error);
                    this.showNotification(`Error getting diff: ${error.message}`, 'error');
                    return;
                }

                if (!stdout || stdout.trim() === '') {
                    this.showNotification('No uncommitted changes to copy.', 'info');
                    return;
                }

                try {
                    // Criar arquivo temporário diff.txt
                    const tmpDir = os.tmpdir();
                    const diffFile = path.join(tmpDir, 'diff.txt');
                    fs.writeFileSync(diffFile, stdout, 'utf8');

                    // Script PowerShell para copiar o arquivo para o clipboard
                    const script = `
$ErrorActionPreference = 'Stop'
$files = @('${diffFile.replace(/'/g, "''")}')
Add-Type -AssemblyName System.Windows.Forms
$fileDropList = New-Object System.Collections.Specialized.StringCollection
$fileDropList.AddRange($files)
[System.Windows.Forms.Clipboard]::SetFileDropList($fileDropList)
Start-Sleep -Milliseconds 200
`;
                    
                    const utf16leBuffer = Buffer.from(script, 'utf16le');
                    const base64Command = utf16leBuffer.toString('base64');
                    const command = `powershell -NoProfile -Sta -ExecutionPolicy Bypass -EncodedCommand ${base64Command}`;

                    cp.exec(command, (psError: any, psStdout: string, psStderr: string) => {
                        if (psError) {
                            console.error('[CopySystemProvider] Erro ao copiar diff para clipboard:', psError);
                            this.showNotification('Failed to copy diff.txt to clipboard: ' + psError.message, 'error');
                        } else {
                            // Contar o número de linhas no diff
                            const lines = stdout.split('\n').length;
                            this.showNotification(`diff.txt file copied to clipboard successfully! Total lines: ${lines}`, 'info');
                        }
                    });
                } catch (fileError) {
                    console.error('[CopySystemProvider] Erro ao criar arquivo diff.txt:', fileError);
                    this.showNotification('Failed to create diff.txt file: ' + (fileError instanceof Error ? fileError.message : String(fileError)), 'error');
                }
            });
        } catch (error) {
            console.error('[CopySystemProvider] Erro geral ao copiar diff:', error);
            this.showNotification('Error copying diff: ' + (error instanceof Error ? error.message : String(error)), 'error');
        }
    }

    /**
     * Cria o arquivo solucao.txt no workspace com o conteúdo fornecido
     */
    private async createSolutionFile(content: string): Promise<void> {
        if (!this._currentWorkspaceRoot) {
            this.showNotification('No workspace folder open.', 'warning');
            return;
        }

        try {
            const fs = require('fs');
            const path = require('path');
            
            const solutionFilePath = path.join(this._currentWorkspaceRoot.fsPath, 'solucao.txt');
            fs.writeFileSync(solutionFilePath, content, 'utf8');
            
            // Contar o número de linhas
            const lines = content.split('\n').length;
            
            this.showNotification(`solucao.txt file created successfully! Total lines: ${lines}`, 'info');
            
            // Atualizar a árvore de arquivos para mostrar o novo arquivo
            this.refreshFileTree();
        } catch (error) {
            console.error('[CopySystemProvider] Erro ao criar arquivo solucao.txt:', error);
            this.showNotification('Failed to create solucao.txt file: ' + (error instanceof Error ? error.message : String(error)), 'error');
        }
    }

    /**
     * Exclui o arquivo solucao.txt do workspace
     */
    private async deleteSolutionFile(): Promise<void> {
        if (!this._currentWorkspaceRoot) {
            this.showNotification('No workspace folder open.', 'warning');
            return;
        }

        try {
            const fs = require('fs');
            const path = require('path');
            
            const solutionFilePath = path.join(this._currentWorkspaceRoot.fsPath, 'solucao.txt');
            
            if (!fs.existsSync(solutionFilePath)) {
                this.showNotification('solucao.txt file not found.', 'warning');
                return;
            }
            
            fs.unlinkSync(solutionFilePath);
            this.showNotification('solucao.txt file deleted successfully!', 'info');
            
            // Atualizar a árvore de arquivos para remover o arquivo da visualização
            this.refreshFileTree();
        } catch (error) {
            console.error('[CopySystemProvider] Erro ao excluir arquivo solucao.txt:', error);
            this.showNotification('Failed to delete solucao.txt file: ' + (error instanceof Error ? error.message : String(error)), 'error');
        }
    }

    /**
     * Atualiza a árvore de arquivos do workspace e envia para o webview
     * Usado quando o workspace muda ou quando a visualização fica visível
     */
    public async refreshFileTree() {
         if (!this._view) {
             console.log("[CopySystemProvider.refreshFileTree] Visualização não disponível para atualização.");
             return;
         }
         if (!this._currentWorkspaceRoot) {
             console.log("[CopySystemProvider.refreshFileTree] Nenhum workspace aberto, enviando sinal de limpeza.");
             this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             return;
         };
         console.log(`[CopySystemProvider.refreshFileTree] INICIANDO Atualização para: ${this._currentWorkspaceRoot.fsPath}`);
         this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: true });
         console.log(`[CopySystemProvider.refreshFileTree] Enviado setLoading: true`);
         try {
             console.log(`[CopySystemProvider.refreshFileTree] Chamando getWorkspaceTree para raiz...`);
             const treeData = await getWorkspaceTree(this._currentWorkspaceRoot, '');
             console.log(`[CopySystemProvider.refreshFileTree] getWorkspaceTree retornou. Dados da árvore obtidos, enviando para webview.`);
             this._view.webview.postMessage({
                 command: WebviewCommands.STRUCTURE_DATA,
                 data: treeData,
                 workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name,
                 workspaceFolderPath: this._currentWorkspaceRoot?.fsPath,
             });
         } catch (error) {
             console.error("[CopySystemProvider.refreshFileTree] Bloco CATCH: Erro ao obter árvore do workspace:", error);
             if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound' && this._currentWorkspaceRoot && error.message.includes(this._currentWorkspaceRoot.fsPath)) {
                 console.warn("[CopySystemProvider.refreshFileTree] CATCH block: Workspace root likely removed during refresh.");
                 this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'No workspace open' });
             } else {
                 this.showNotification(`Error reading workspace structure: ${error instanceof Error ? error.message : String(error)}`, 'error');
                 this._view.webview.postMessage({ command: WebviewCommands.STRUCTURE_DATA, data: null, error: 'Failed to read workspace' });
             }
         } finally {
             console.log(`[CopySystemProvider.refreshFileTree] FINALLY block: Posting setLoading: false`);
             this._view.webview.postMessage({ command: WebviewCommands.SET_LOADING, isLoading: false });
             console.log(`[CopySystemProvider.refreshFileTree] FINALLY block: Posted setLoading: false`);
         }
    }
}

