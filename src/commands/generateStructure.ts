import * as vscode from 'vscode';
import * as path from 'path';
import * as constants from '../constants';
import { StructureViewProvider } from '../StructureViewProvider';
import { Operation, parseCustomFormat } from '../services/parserService';
import { generateAndExecuteScriptAsTask } from '../services/taskService';
import CheckpointTracker from '../services/checkpoint/CheckpointTracker';
export async function processPastedStructureCommand(
    context: vscode.ExtensionContext,
    _provider: StructureViewProvider,
    rawInputText: string,
    webview?: vscode.Webview
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
              vscode.window.showErrorMessage('Nenhuma pasta de workspace aberta.');
        webview?.postMessage({ command: 'generationFinished', success: false });
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
            if (!checkpointTracker) {
            } else {
            }
        } catch (trackerError) {
                     vscode.window.showWarningMessage('Falha ao inicializar sistema de checkpoint. A funcionalidade de desfazer não estará disponível para esta operação.');
             if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); }
        }
        if (checkpointTracker) {
            try {
                await checkpointTracker.stageWorkspaceChanges();
                const commitResult = await checkpointTracker.commit();
                if (commitResult) {
                    preGenerationCheckpointHash = commitResult;
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, preGenerationCheckpointHash);
                    if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: true }); }
                } else {
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                    preGenerationCheckpointHash = null;
                                   vscode.window.showWarningMessage('Falha ao criar checkpoint pré-geração. Desfazer não estará disponível.');
                    if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); }
                }
            } catch (commitError) {
                            vscode.window.showErrorMessage(`Falha ao criar checkpoint pré-geração: ${commitError instanceof Error ? commitError.message : String(commitError)}`);
                await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                preGenerationCheckpointHash = null;
                if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); }
            }
        } else {
             await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
             if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); }
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
                                                  vscode.window.showWarningMessage('Não foi possível salvar o estado após geração bem-sucedida.');
                        }
                    } else {
                         await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                           vscode.window.showWarningMessage('Não foi possível preparar mudanças após geração bem-sucedida. Estado pós-geração não foi salvo.');
                    }
                } catch (postCommitError) {
                    await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                   vscode.window.showWarningMessage(`Erro ao salvar estado pós-geração: ${postCommitError instanceof Error ? postCommitError.message : String(postCommitError)}`);
                }
            } else if (!generationSuccess) {
                 await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
            } else if (generationSuccess && !checkpointTracker) {
            }
             if (webview) {
                 webview.postMessage({ command: 'generationFinished', success: generationSuccess });
             } else {
             }
            if (webview && taskProgress.length > 0) {
                webview.postMessage({ command: 'generationProgress', progress: taskProgress });
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
                            vscode.window.showWarningMessage("Nenhuma operação válida <command> ou <code> encontrada. Nada foi gerado.");
            } else {
                            vscode.window.showWarningMessage("Nenhum texto de estrutura fornecido. Nada foi gerado.");
            }
            if (webview) {
                webview.postMessage({ command: 'generationFinished', success: generationSuccess });
            }
            if (preGenerationCheckpointHash && context.workspaceState.get(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY) === preGenerationCheckpointHash) {
                 await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                             vscode.window.showInformationMessage(`Checkpoint ${preGenerationCheckpointHash.substring(0,7)} foi criado, mas nenhuma operação foi executada.`);
                  if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); }
            }
            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        }
    } catch (error) {
              vscode.window.showErrorMessage(`Erro durante processo de configuração da geração: ${error instanceof Error ? error.message : String(error)}`);
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        generationSuccess = false;
        if (webview) {
             webview.postMessage({ command: 'generationFinished', success: false });
             webview.postMessage({ command: 'updateUndoState', canUndo: false });
        }
    } finally {
         const finalPreGenCheckpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (webview) {
             webview.postMessage({ command: 'updateUndoState', canUndo: !!finalPreGenCheckpointHash });
         }
         vscode.commands.executeCommand('buildy.refreshCopySystemView');
    }
}
