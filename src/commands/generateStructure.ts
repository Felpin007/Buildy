import * as vscode from 'vscode';
import * as path from 'path';
import * as constants from '../constants';
import { StructureViewProvider } from '../StructureViewProvider';
import { parseCustomFormat } from '../services/parserService';
import { generateAndExecuteScriptAsTask } from '../services/taskService';
import CheckpointTracker from '../services/checkpoint/CheckpointTracker';
import { WebviewCommands } from '../webview/webviewCommands';
/**
 * Processa o texto colado pelo usuário e executa as operações de geração de estrutura
 * 
 * Este comando é o ponto de entrada principal para a funcionalidade de geração de estrutura.
 * Ele analisa o texto formatado gerado pela IA, cria um checkpoint Git para permitir desfazer,
 * executa os comandos e operações de criação/modificação de arquivos, e gerencia o estado
 * dos checkpoints para a funcionalidade de desfazer.
 * 
 * @param context Contexto da extensão para acessar armazenamento e estado
 * @param _provider Provedor da visualização de estrutura
 * @param rawInputText Texto bruto colado pelo usuário contendo os comandos e códigos
 * @param webview Instância opcional do webview para enviar mensagens de progresso
 */
export async function processPastedStructureCommand(
    context: vscode.ExtensionContext,
    _provider: StructureViewProvider,
    rawInputText: string,
    webview?: vscode.Webview
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
              vscode.window.showErrorMessage('No workspace folder open.');
        webview?.postMessage({ command: WebviewCommands.GENERATION_FINISHED, success: false });
        return;
    }
    const workspaceRootUri = workspaceFolders[0].uri;
    const workspaceRootPath = workspaceRootUri.fsPath;
    let checkpointTracker: CheckpointTracker | undefined;
    let preGenerationCheckpointHash: string | null = null;
    let generationSuccess = false;
    const taskId = `gen-${Date.now()}`;
    try {
        try {
            checkpointTracker = await CheckpointTracker.create(taskId, context.globalStorageUri.fsPath);
        } catch (trackerError) {
                     vscode.window.showWarningMessage('Failed to initialize checkpoint system. Undo functionality will not be available for this operation.');
             if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false }); }
        }
        if (checkpointTracker) {
            try {
                await checkpointTracker.stageWorkspaceChanges();
                const commitResult = await checkpointTracker.commit();
                if (commitResult) {
                    preGenerationCheckpointHash = commitResult;
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, preGenerationCheckpointHash);
                    if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: true }); }
                } else {
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                    preGenerationCheckpointHash = null;
                                   vscode.window.showWarningMessage('Failed to create pre-generation checkpoint. Undo will not be available.');
                    if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false }); }
                }
            } catch (commitError) {
                            vscode.window.showErrorMessage(`Failed to create pre-generation checkpoint: ${commitError instanceof Error ? commitError.message : String(commitError)}`);
                await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                preGenerationCheckpointHash = null;
                if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false }); }
            }
        } else {
             await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
             if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false }); }
        }
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        let cleanedInput = rawInputText.trim();
        cleanedInput = cleanedInput.replace(/^```[^\n]*\n?/, '');
        cleanedInput = cleanedInput.replace(/\n?```\s*$/, '');
        const operations = parseCustomFormat(cleanedInput);
        if (operations.length > 0) {
            const { success: taskSuccess, progress: taskProgress } = await generateAndExecuteScriptAsTask(operations, workspaceRootPath);
            generationSuccess = taskSuccess;
            if (generationSuccess && checkpointTracker) {
                try {
                    const stageResult = await checkpointTracker.stageWorkspaceChanges();
                    if (stageResult.success) {
                        const postCommitResult = await checkpointTracker.commit();
                        if (postCommitResult && postCommitResult !== preGenerationCheckpointHash) {
                            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, postCommitResult);
                        } else if (postCommitResult === preGenerationCheckpointHash) {
                        } else {
                            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                                  vscode.window.showWarningMessage('Could not save state after successful generation.');
                        }
                    } else {
                         await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                           vscode.window.showWarningMessage('Could not prepare changes after successful generation. Post-generation state was not saved.');
                    }
                } catch (postCommitError) {
                    await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                   vscode.window.showWarningMessage(`Error saving post-generation state: ${postCommitError instanceof Error ? postCommitError.message : String(postCommitError)}`);
                }
            } else if (!generationSuccess) {
                 await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
            } else if (generationSuccess && !checkpointTracker) {
            }
             if (webview) {
                 webview.postMessage({ command: WebviewCommands.GENERATION_FINISHED, success: generationSuccess });
             } else {
             }
            if (webview && taskProgress.length > 0) {
                webview.postMessage({ command: WebviewCommands.GENERATION_PROGRESS, progress: taskProgress });
            } else if (taskProgress.length > 0) {
            }
            if (preGenerationCheckpointHash) {
                const finalMessage = generationSuccess
                                   ? `Structure generated. Pre-generation checkpoint: ${preGenerationCheckpointHash.substring(0, 7)}.`
                                   : `Generation failed. Pre-generation checkpoint: ${preGenerationCheckpointHash.substring(0, 7)}.`;
                if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: true }); }
            } else if (generationSuccess) {
            }
        } else {
            generationSuccess = true;
            if (cleanedInput.trim().length > 0) {
                            vscode.window.showWarningMessage("No valid <command> or <code> operations found. Nothing was generated.");
            } else {
                            vscode.window.showWarningMessage("No structure text provided. Nothing was generated.");
            }
            if (webview) {
                webview.postMessage({ command: 'generationFinished', success: generationSuccess });
            }
            if (preGenerationCheckpointHash && context.workspaceState.get(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY) === preGenerationCheckpointHash) {
                 await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                             vscode.window.showInformationMessage(`Checkpoint ${preGenerationCheckpointHash.substring(0,7)} was created, but no operations were executed.`);
                  if (webview) { webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false }); }
            }
            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        }
    } catch (error) {
              vscode.window.showErrorMessage(`Error during generation setup process: ${error instanceof Error ? error.message : String(error)}`);
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        generationSuccess = false;
        if (webview) {
             webview.postMessage({ command: WebviewCommands.GENERATION_FINISHED, success: false });
             webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: false });
        }
    } finally {
         const finalPreGenCheckpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (webview) {
             webview.postMessage({ command: WebviewCommands.UPDATE_UNDO_STATE, canUndo: !!finalPreGenCheckpointHash });
         }
         vscode.commands.executeCommand('buildy.refreshCopySystemView');
    }
}

