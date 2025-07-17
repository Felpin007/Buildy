import * as vscode from 'vscode';
import * as constants from '../constants';
import { StructureViewProvider } from '../StructureViewProvider';
import CheckpointTracker, { DiffEntry } from '../services/checkpoint/CheckpointTracker'; 
import { WebviewCommands } from '../webview/webviewCommands';
/**
 * Desfaz a última geração de estrutura revertendo para um checkpoint anterior
 * 
 * Este comando restaura os arquivos do workspace para o estado salvo em um checkpoint Git,
 * permitindo que o usuário desfaça as mudanças feitas pela última geração de estrutura.
 * Ele usa o sistema de "shadow Git" para realizar a operação de desfazer sem interferir
 * com o controle de versão normal do usuário.
 * 
 * @param context Contexto da extensão para acessar armazenamento e estado
 * @param provider Provedor da visualização de estrutura
 * @param checkpointHash Hash opcional do checkpoint para o qual reverter. Se não fornecido, usa o último checkpoint pré-geração
 * @param webview Instância opcional do webview para enviar mensagens de progresso
 */
export async function undoLastGenerationCommand(
    context: vscode.ExtensionContext,
    provider: StructureViewProvider, 
    checkpointHash: string | undefined, 
    webview?: vscode.Webview,
    skipConfirmation?: boolean
   ): Promise<void> {
    if (!checkpointHash) {
         checkpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (!checkpointHash) {
                     vscode.window.showWarningMessage('No previous generation checkpoint found to undo.');
            return;
         }
         console.warn("[undoCommand] Comando desfazer chamado sem hash específico, usando último hash pré-geração armazenado:", checkpointHash);
    }
    const targetCheckpointShortHash = checkpointHash.substring(0, 7);
    // A confirmação já é feita no webview, não precisamos de uma segunda confirmação aqui
    console.log("[undoCommand] Processando comando de desfazer para o checkpoint: " + targetCheckpointShortHash);
    let tracker: CheckpointTracker | undefined;
       let hashBeforeUndo: string | undefined; 
    try {
        const tempTaskId = `undo-${Date.now()}`;
        tracker = await CheckpointTracker.create(tempTaskId, context.globalStorageUri.fsPath);
        if (!tracker) {
                     vscode.window.showErrorMessage('Could not initialize checkpoint system to perform undo.');
            return;
        }
              console.log("[undoCommand] Preparando estado atual antes de desfazer...");
              await tracker.stageWorkspaceChanges();
              hashBeforeUndo = await tracker.commit(); 
              if (!hashBeforeUndo) {
                  console.warn("[undoCommand] Falha ao obter hash de commit distinto antes de desfazer. O estado pode estar inalterado, ou ocorreu um erro. Pulando cálculo de diff para a operação de desfazer.");
              } else {
                  console.log(`[undoCommand] Estado capturado antes de desfazer. Hash de commit temporário: ${hashBeforeUndo}`);
              }
              if (webview) {
                              webview.postMessage({ command: 'undoProgressStart', message: `Revertendo para checkpoint ${targetCheckpointShortHash}...` });
              } else {
                              vscode.window.showInformationMessage(`Reverting files to checkpoint ${targetCheckpointShortHash}...`);
              }
        await tracker.resetHead(checkpointHash);
        console.log(`[undoCommand] resetHead(${checkpointHash}) concluído.`);
              let undoDiffSet: DiffEntry[] = [];
              if (hashBeforeUndo) {
                  console.log(`[undoCommand] Calculando diff entre estado antes-desfazer (${hashBeforeUndo}) e estado depois-desfazer (${checkpointHash})...`);
                  try {
                      undoDiffSet = await tracker.getDiffSet(hashBeforeUndo, checkpointHash);
                      console.log(`[undoCommand] Diff de desfazer calculado. ${undoDiffSet.length} arquivos alterados.`);
                      await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, hashBeforeUndo);
                      await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, checkpointHash); 
                      console.log(`[undoCommand] Hashes de diff de desfazer armazenados: Antes=${hashBeforeUndo}, Depois=${checkpointHash}`);
                  } catch (diffError) {
                      console.error("[undoCommand] Falha ao calcular diff para operação de desfazer:", diffError);
                      await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
                      await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
                  }
              } else {
                   await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
                   await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
              }
               if (webview) {
                   const undoProgress = undoDiffSet.map(entry => ({
                       relativePath: entry.relativePath,
                       status: 'Revertido' 
                   }));
                   webview.postMessage({
                       command: WebviewCommands.UNDO_PROGRESS,
                       progress: undoProgress,
                       success: true 
                   });
                   webview.postMessage({ command: WebviewCommands.UNDO_FINISHED, success: true }); 
                   console.log("[undoCommand] Enviadas mensagens de progresso e conclusão de desfazer para webview.");
               } else {
                                    vscode.window.showInformationMessage('Files successfully reverted to checkpoint!');
               }
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        console.log("[undoCommand] Limpas chaves de checkpoint de geração após desfazer bem-sucedido.");
        if (webview) {
            console.log("[undoCommand] Enviando updateUndoState(false) final após desfazer bem-sucedido.");
            webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false });
        }
        console.log("[undoCommand] Disparando atualização da visualização do Sistema de Cópia após desfazer bem-sucedido...");
        vscode.commands.executeCommand('buildy.refreshCopySystemView');
    } catch (undoError) {
        const ignoredErrorSubstring = "pathspec '.' did not match any file(s) known to git";
        const isIgnoredError = undoError instanceof Error && undoError.message.includes(ignoredErrorSubstring);
        if (isIgnoredError) {
            console.warn(`[undoCommand] Erro conhecido ignorado durante reversão: ${undoError.message}`);
            await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
            console.log("[undoCommand] Limpas chaves de checkpoint de geração após erro ignorado durante desfazer.");
            if (webview) {
                webview.postMessage({ command: WebviewCommands.UNDO_FINISHED, success: true });
                webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false });
                console.log("[undoCommand] Enviadas mensagens de sucesso para webview após erro ignorado.");
           } else {
                console.log('[undoCommand] Arquivos revertidos com sucesso para o checkpoint! (Notificação suprimida)');
           }
            console.log("[undoCommand] Disparando atualização da visualização do Sistema de Cópia após erro ignorado...");
            vscode.commands.executeCommand('buildy.refreshCopySystemView');
        } else {
            console.error("[undoCommand] Erro ao reverter para checkpoint:", undoError);
            if (webview) {
                webview.postMessage({ command: WebviewCommands.UNDO_FINISHED, success: false });
                webview.postMessage({ command: WebviewCommands.UNDO_PROGRESS_ERROR, message: `Falha ao reverter: ${undoError instanceof Error ? undoError.message : String(undoError)}` });
                console.log("[undoCommand] Enviadas mensagens de falha de desfazer para webview.");
                const finalPreGenHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
                webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: !!finalPreGenHash });
            } else {
                 vscode.window.showErrorMessage(`Failed to revert to checkpoint: ${undoError instanceof Error ? undoError.message : String(undoError)}`);
            }
        }
        await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
        await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
    }
}
