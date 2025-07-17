import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Copia o conteúdo de múltiplos arquivos para a área de transferência
 * 
 * Este comando lê o conteúdo de todos os arquivos especificados e os combina em um único texto,
 * separando cada arquivo com uma linha divisora. O texto combinado é então copiado para a área
 * de transferência do sistema.
 * 
 * @param relativePaths Array de caminhos relativos dos arquivos a serem copiados
 */
export async function copyFilesCommand(relativePaths: string[] | undefined): Promise<void> {
    if (!relativePaths || relativePaths.length === 0) {
        vscode.window.showWarningMessage('No files selected for copying.');
        return;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
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
            vscode.window.showInformationMessage(`Content from ${filesRead} file(s) copied to clipboard.`);
        } catch (clipboardError) {
            vscode.window.showErrorMessage('Failed to copy to clipboard.');
        }
    } else {
        vscode.window.showWarningMessage('No file content could be read or copied.');
    }
    if (failedReads.length > 0) {
        vscode.window.showWarningMessage(`Failed to read ${failedReads.length} file(s): ${failedReads.join(', ')}`);
    }
}
