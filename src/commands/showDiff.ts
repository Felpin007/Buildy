import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import CheckpointTracker from '../services/checkpoint/CheckpointTracker';
import * as constants from '../constants';
import { fileExistsAtPath } from '../utils/fs';

/**
 * Interface para os argumentos do comando de visualização de diferenças
 */
interface ShowDiffArgs {
    /** Caminho relativo do arquivo para mostrar a diferença */
    relativePath: string;
    /** Tipo de diferença: 'generation' para comparação entre checkpoint e estado atual,
     * ou 'undo' para comparação entre estados antes e depois de desfazer */
    type?: 'generation' | 'undo'; 
}

/**
 * Mostra a diferença entre versões de um arquivo
 * 
 * Este comando permite ao usuário visualizar as diferenças entre versões de um arquivo:
 * - Para o tipo 'generation': Compara o estado do arquivo antes da geração com o estado atual
 * - Para o tipo 'undo': Compara o estado do arquivo antes e depois da operação de desfazer
 * 
 * @param context Contexto da extensão para acessar armazenamento e estado
 * @param args Argumentos do comando, pode ser um objeto ShowDiffArgs, uma string com o caminho do arquivo, ou undefined
 */
export async function showDiffCommand(context: vscode.ExtensionContext, args: ShowDiffArgs | string | undefined): Promise<void> {
    let relativePath: string | undefined;
    let diffType: 'generation' | 'undo' = 'generation'; 
    if (typeof args === 'string') {
        relativePath = args;
    } else if (typeof args === 'object' && args !== null && args.relativePath) {
        relativePath = args.relativePath;
        diffType = args.type === 'undo' ? 'undo' : 'generation'; 
    }
	if (!relativePath) {
		vscode.window.showErrorMessage("Nenhum caminho de arquivo fornecido para mostrar a diferença."); 
		return;
	}
    console.log(`[showDiffCommand] Recebida solicitação para caminho: ${relativePath}, tipo: ${diffType}`);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("Nenhuma pasta de workspace aberta para mostrar a diferença."); 
        return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;
    const currentFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);
       let tracker: CheckpointTracker | undefined;
       const tempDir = os.tmpdir(); 
       try {
           const tempTaskId = `diff-${Date.now()}`;
           console.log(`[showDiffCommand] Tentando CheckpointTracker.create para tarefa: ${tempTaskId}`);
           tracker = await CheckpointTracker.create(tempTaskId, context.globalStorageUri.fsPath);
           console.log(`[showDiffCommand] CheckpointTracker.create retornou: ${tracker ? 'Instância' : 'indefinido'}`);
           if (!tracker) {
               vscode.window.showErrorMessage("Não foi possível inicializar o sistema de checkpoint para mostrar a diferença."); 
               return;
           }
           let leftUri: vscode.Uri;
           let rightUri: vscode.Uri;
           let diffTitle: string;
           if (diffType === 'undo') {
               console.log(`[showDiffCommand] Manipulando tipo de diff 'undo' para ${relativePath}`);
               const undoBeforeHash = context.workspaceState.get<string>(constants.LAST_UNDO_BEFORE_HASH_KEY);
               const undoAfterHash = context.workspaceState.get<string>(constants.LAST_UNDO_AFTER_HASH_KEY);
               if (!undoBeforeHash || !undoAfterHash) {
                   vscode.window.showWarningMessage("Não foi possível encontrar os checkpoints para a última operação de desfazer."); 
                   return;
               }
               const beforeShortHash = undoBeforeHash.substring(0, 7);
               const afterShortHash = undoAfterHash.substring(0, 7);
               const beforeContent = await tracker.getFileContentAtCommit(undoBeforeHash, relativePath);
               const tempBeforeFileName = `UNDO_BEFORE_${beforeShortHash}_${path.basename(relativePath)}`;
               leftUri = vscode.Uri.file(path.join(tempDir, tempBeforeFileName));
               await fs.writeFile(leftUri.fsPath, beforeContent);
               console.log(`[showDiffCommand] Escreveu conteúdo 'undo before' no arquivo temporário: ${leftUri.fsPath}`);
               const afterContent = await tracker.getFileContentAtCommit(undoAfterHash, relativePath);
               const tempAfterFileName = `UNDO_AFTER_${afterShortHash}_${path.basename(relativePath)}`;
               rightUri = vscode.Uri.file(path.join(tempDir, tempAfterFileName));
               await fs.writeFile(rightUri.fsPath, afterContent);
               console.log(`[showDiffCommand] Escreveu conteúdo 'undo after' no arquivo temporário: ${rightUri.fsPath}`);
               diffTitle = `${path.basename(relativePath)} (Undo: ${beforeShortHash} ↔ ${afterShortHash})`; 
           } else {
               console.log(`[showDiffCommand] Manipulando tipo de diff 'generation' para ${relativePath}`);
               const baselineCheckpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
               if (!baselineCheckpointHash) {
                   vscode.window.showWarningMessage("Nenhum checkpoint pré-geração encontrado para comparar."); 
                   return;
               }
               const baselineShortHash = baselineCheckpointHash.substring(0, 7);
               const beforeContent = await tracker.getFileContentAtCommit(baselineCheckpointHash, relativePath);
               const tempBeforeFileName = `GEN_BEFORE_${baselineShortHash}_${path.basename(relativePath)}`;
               leftUri = vscode.Uri.file(path.join(tempDir, tempBeforeFileName));
               await fs.writeFile(leftUri.fsPath, beforeContent);
               console.log(`[showDiffCommand] Escreveu conteúdo 'generation before' no arquivo temporário: ${leftUri.fsPath}`);
               rightUri = currentFileUri;
               const currentFileExists = await fileExistsAtPath(currentFileUri.fsPath);
               if (!currentFileExists) {
                    console.warn(`[showDiffCommand] Arquivo atual ${relativePath} não existe no workspace para diff de geração.`);
                    const tempEmptyFileName = `GEN_CURRENT_EMPTY_${path.basename(relativePath)}`;
                    rightUri = vscode.Uri.file(path.join(tempDir, tempEmptyFileName));
                    await fs.writeFile(rightUri.fsPath, ''); 
                    console.log(`[showDiffCommand] Arquivo atual ausente, usando arquivo temporário vazio para lado direito: ${rightUri.fsPath}`);
                    diffTitle = `${path.basename(relativePath)} (Checkpoint ${baselineShortHash} ↔ Missing File)`; 
               } else {
                   diffTitle = `${path.basename(relativePath)} (Checkpoint ${baselineShortHash} ↔ Current)`; 
               }
           }
           console.log(`[showDiffCommand] Abrindo visualização diff: ${leftUri.fsPath} <-> ${rightUri.fsPath}`);
           await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, diffTitle);
       } catch (error) {
           console.error(`[showDiffCommand] Erro ao mostrar diff para ${relativePath} (tipo: ${diffType}):`, error);
           vscode.window.showErrorMessage(`Falha ao mostrar a diferença para ${relativePath}: ${error instanceof Error ? error.message : String(error)}`); 
       } finally {
       }
}
