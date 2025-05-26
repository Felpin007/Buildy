import * as vscode from 'vscode';
import * as path from 'path';
export async function copyFilesCommand(relativePaths: string[] | undefined): Promise<void> {
    if (!relativePaths || relativePaths.length === 0) {
        vscode.window.showWarningMessage('Nenhum arquivo selecionado para cópia.');
        return;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Nenhuma pasta de workspace aberta.');
        return;
    }
    const workspaceRootUri = workspaceFolders[0].uri;
    let combinedContent = '';
    let filesRead = 0;
    let failedReads: string[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Copiando conteúdo de ${relativePaths.length} arquivo(s)...`,
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < relativePaths.length; i++) {
            const relPath = relativePaths[i];
            if (typeof relPath !== 'string' || !relPath) {
                failedReads.push(`(caminho inválido no índice ${i})`);
                continue;
            }
            const fileUri = vscode.Uri.joinPath(workspaceRootUri, relPath.replace(/\\/g, '/'));
            progress.report({ increment: (100 / relativePaths.length), message: `Lendo ${relPath}...` });
            try {
                const fileStat = await vscode.workspace.fs.stat(fileUri);
                if (fileStat.type === vscode.FileType.File) {
                    const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                    const contentString = Buffer.from(contentBytes).toString('utf8');
                    if (combinedContent.length > 0) {
                        combinedContent += '\n\n---\n\n'; 
                    }
                    combinedContent += contentString;
                    filesRead++;
                } else {
                }
            } catch (error: any) {
                failedReads.push(relPath);
            }
        }
    });
    if (filesRead > 0) {
        try {
            await vscode.env.clipboard.writeText(combinedContent);
            vscode.window.showInformationMessage(`Conteúdo de ${filesRead} arquivo(s) copiado para a área de transferência.`);
        } catch (clipboardError) {
            vscode.window.showErrorMessage('Falha ao copiar para a área de transferência.');
        }
    } else {
        vscode.window.showWarningMessage('Nenhum conteúdo de arquivo pôde ser lido ou copiado.');
    }
    if (failedReads.length > 0) {
        vscode.window.showWarningMessage(`Falha ao ler ${failedReads.length} arquivo(s): ${failedReads.join(', ')}`);
    }
}
