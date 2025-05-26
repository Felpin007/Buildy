import * as vscode from 'vscode';
import { CopySystemProvider } from './CopySystemProvider';
import { StructureViewProvider } from './StructureViewProvider';
import * as constants from './constants';
import * as commands from './commands';
/**
 * Função de ativação da extensão Buildy
 * Registra os provedores de visualização, comandos e inicializa os serviços necessários
 * @param context Contexto da extensão fornecido pelo VS Code
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Extensão "Buildy" (com Shadow Checkpoints) está ativa!');
    context.globalStorageUri.fsPath;
    console.log(`[Activate] Caminho de Armazenamento Global: ${context.globalStorageUri.fsPath}`);
    const structureProvider = new StructureViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(StructureViewProvider.viewType, structureProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
    const copySystemProvider = new CopySystemProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CopySystemProvider.viewType, copySystemProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.processPastedStructure',
            (rawInputText: string, webview?: vscode.Webview) => commands.processPastedStructureCommand(context, structureProvider, rawInputText, webview)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.undoLastGeneration',
                     (checkpointHash?: string) => {
                         const webview = structureProvider.getWebviewView()?.webview;
                         commands.undoLastGenerationCommand(context, structureProvider, checkpointHash, webview);
                     }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.showDiff',
            (relativePath: string) => commands.showDiffCommand(context, relativePath)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.copySelectedFilesContent',
            async (relativePaths: string[] | undefined) => {
                if (!relativePaths || relativePaths.length === 0) {
                    vscode.window.showInformationMessage('Nenhum arquivo selecionado para cópia.');
                    return;
                }
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('Nenhuma pasta de workspace aberta.');
                    return;
                }
                const workspaceRootUri = workspaceFolders[0].uri;
                let combinedContent = '';
                let filesCopiedCount = 0;
                let filesFailedCount = 0;
                const nonTextExtensions = new Set([
                    '.png', '.jpg', '.jpeg', '.gif',
                    '.mp3', '.wav', '.ogg', '.aac',
                    '.mp4', '.mov', '.avi', '.mkv',
                    '.zip', '.rar', '.7z', '.tar', '.gz',
                    '.pdf', '.doc', '.docx', '.xls', '.xlsx'
                ]);
                for (const relPath of relativePaths) {
                    try {
                        const fileExt = relPath.substring(relPath.lastIndexOf('.')).toLowerCase();
                        const isTextFile = !nonTextExtensions.has(fileExt);
                        if (combinedContent.length > 0) {
                            combinedContent += '\n\n---\n\n';
                        }
                        if (isTextFile) {
                            const fileUri = vscode.Uri.joinPath(workspaceRootUri, relPath);
                            const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
                            const fileContent = Buffer.from(fileContentBytes).toString('utf8');
                            combinedContent += fileContent;
                        } else {
                            combinedContent += `[Arquivo binário - ${relPath}]`;
                        }
                        filesCopiedCount++;
                    } catch (error) {
                        filesFailedCount++;
                        console.error(`[copySelectedFilesContent] Erro ao ler arquivo ${relPath}:`, error);
                        if (combinedContent.length > 0) {
                            combinedContent += '\n\n---\n\n';
                        }
                        combinedContent += `[Erro ao ler arquivo - ${relPath}]`;
                    }
                }
                if (filesCopiedCount > 0 || filesFailedCount > 0) {
                    await vscode.env.clipboard.writeText(combinedContent.trim());
                    let message = `Conteúdo copiado de ${filesCopiedCount} arquivo(s).`;
                    if (filesFailedCount > 0) {
                        message += ` Falha ao ler ${filesFailedCount} arquivo(s).`;
                        vscode.window.showWarningMessage(message);
                    } else {
                        vscode.window.showInformationMessage(message);
                    }
                } else {
                    vscode.window.showErrorMessage(`Falha ao processar os arquivos selecionados.`);
                }
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.refreshCopySystemView', () => {
            console.log("[Command: refreshCopySystemView] Disparado.");
            if (copySystemProvider) {
                copySystemProvider.refreshFileTree();
            } else {
                console.warn("[Command: refreshCopySystemView] CopySystemProvider não disponível.");
            }
        })
    );
}
/**
 * Função de desativação da extensão
 * Chamada quando a extensão é desativada
 */
export function deactivate() {
    console.log('Extensão "Buildy" desativada.');
}
