import * as vscode from 'vscode';
import * as constants from '../constants';
import { StructureViewProvider } from '../StructureViewProvider';
import CheckpointTracker, { DiffEntry } from '../services/checkpoint/CheckpointTracker'; 
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
       webview?: vscode.Webview 
   ): Promise<void> {
    if (!checkpointHash) {
         checkpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (!checkpointHash) {
                     vscode.window.showWarningMessage('Nenhum checkpoint de geração anterior encontrado para desfazer.');
            return;
         }
         console.warn("[undoCommand] Comando desfazer chamado sem hash específico, usando último hash pré-geração armazenado:", checkpointHash);
    }
    const targetCheckpointShortHash = checkpointHash.substring(0, 7);
    const confirm = await vscode.window.showWarningMessage(
              `Tem certeza que deseja reverter os arquivos rastreados para o estado do checkpoint ${targetCheckpointShortHash}?` +
              `Isso sobrescreverá os arquivos modificados em seu workspace com a versão salva no checkpoint.` +
              `(Novos arquivos não rastreados criados pela geração NÃO serão removidos por esta operação.)`,
              { modal: true },
              'Desfazer para Checkpoint' 
       );
       if (confirm !== 'Desfazer para Checkpoint') {
               vscode.window.showInformationMessage('Operação de desfazer cancelada.');
         return;
    }
    let tracker: CheckpointTracker | undefined;
       let hashBeforeUndo: string | undefined; 
    try {
        const tempTaskId = `undo-${Date.now()}`;
        tracker = await CheckpointTracker.create(tempTaskId, context.globalStorageUri.fsPath);
        if (!tracker) {
                     vscode.window.showErrorMessage('Não foi possível inicializar sistema de checkpoint para realizar desfazer.');
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
                              vscode.window.showInformationMessage(`Revertendo arquivos para checkpoint ${targetCheckpointShortHash}...`);
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
                       command: 'undoProgress',
                       progress: undoProgress,
                       success: true 
                   });
                   webview.postMessage({ command: 'undoFinished', success: true }); 
                   console.log("[undoCommand] Enviadas mensagens de progresso e conclusão de desfazer para webview.");
               } else {
                                    vscode.window.showInformationMessage('Arquivos revertidos com sucesso para o checkpoint!');
               }
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        console.log("[undoCommand] Limpas chaves de checkpoint de geração após desfazer bem-sucedido.");
        if (webview) {
            console.log("[undoCommand] Enviando updateUndoState(false) final após desfazer bem-sucedido.");
            webview.postMessage({ command: 'updateUndoState', canUndo: false });
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
                webview.postMessage({ command: 'undoFinished', success: true });
                webview.postMessage({ command: 'updateUndoState', canUndo: false });
                console.log("[undoCommand] Enviadas mensagens de sucesso para webview após erro ignorado.");
           } else {
                console.log('[undoCommand] Arquivos revertidos com sucesso para o checkpoint! (Notificação suprimida)');
           }
            console.log("[undoCommand] Disparando atualização da visualização do Sistema de Cópia após erro ignorado...");
            vscode.commands.executeCommand('buildy.refreshCopySystemView');
        } else {
            console.error("[undoCommand] Erro ao reverter para checkpoint:", undoError);
            if (webview) {
                webview.postMessage({ command: 'undoFinished', success: false });
                webview.postMessage({ command: 'undoProgressError', message: `Falha ao reverter: ${undoError instanceof Error ? undoError.message : String(undoError)}` });
                console.log("[undoCommand] Enviadas mensagens de falha de desfazer para webview.");
                const finalPreGenHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
                webview.postMessage({ command: 'updateUndoState', canUndo: !!finalPreGenHash });
            } else {
                 vscode.window.showErrorMessage(`Falha ao reverter para checkpoint: ${undoError instanceof Error ? undoError.message : String(undoError)}`);
            }
        }
        await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
        await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
    }
}
