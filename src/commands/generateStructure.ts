// src/commands/generateStructure.ts

import * as vscode from 'vscode';
import * as path from 'path';
// Removed simple-git imports as direct Git manipulation is gone
// import simpleGit, { SimpleGit, CheckRepoActions } from 'simple-git';
import * as constants from '../constants';
import { StructureViewProvider } from '../StructureViewProvider'; // Keep for potential future use? (Maybe not needed now)
import { Operation, parseCustomFormat } from '../services/parserService';
// Removed gitService import
// import { checkGitInstallation, initializeGitRepository } from '../services/gitService';
import { generateAndExecuteScriptAsTask } from '../services/taskService';
import CheckpointTracker from '../services/checkpoint/CheckpointTracker'; // Import the new tracker

// Helper function for delay - REMOVED
// const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handles the core logic for processing pasted structure text, managing checkpoints,
 * executing tasks, and updating the UI. Uses the shadow Git checkpoint system.
 * @param context The extension context.
 * @param _provider The StructureViewProvider instance (no longer used directly).
 * @param rawInputText The raw text pasted by the user.
 * @param webview An optional webview object to send progress messages back to.
 */
export async function processPastedStructureCommand(
    context: vscode.ExtensionContext,
    _provider: StructureViewProvider, // Mark as unused
    rawInputText: string,
    webview?: vscode.Webview // Add optional webview parameter
): Promise<void> {
    console.log(`[generateStructureCommand] ENTERED. Received text length: ${rawInputText?.length ?? 0}. Webview provided: ${!!webview}`); // <-- ADDED LOG

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
              vscode.window.showErrorMessage('No workspace folder open.');
        // Ensure button is reset if webview exists even on early exit
        webview?.postMessage({ command: 'generationFinished', success: false });
        return;
    }
    const workspaceRootUri = workspaceFolders[0].uri;
    const workspaceRootPath = workspaceRootUri.fsPath;

    let checkpointTracker: CheckpointTracker | undefined;
    let preGenerationCheckpointHash: string | null = null;
    let generationSuccess = false;
    const taskId = `gen-${Date.now()}`; // Simple unique ID for this generation task

    console.log(`[generateStructureCommand] Starting generation process for task ID: ${taskId}...`);

    try {
        // --- Initialize Checkpoint Tracker ---
        try {
            checkpointTracker = await CheckpointTracker.create(taskId, context.globalStorageUri.fsPath);
            if (!checkpointTracker) {
                console.log("[generateStructureCommand] CheckpointTracker creation returned undefined. Proceeding without checkpoints.");
            } else {
                console.log("[generateStructureCommand] CheckpointTracker created successfully.");
            }
        } catch (trackerError) {
            console.error("[generateStructureCommand] Failed to create CheckpointTracker:", trackerError);
                     vscode.window.showWarningMessage('Failed to initialize checkpoint system. Undo functionality will be unavailable for this operation.');
             if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); } // Update undo state
             // webview?.postMessage({ command: 'generationFinished', success: false }); // Reset button on tracker failure too - This might hide the warning, let's rely on finally
             // return; // Continue without checkpoints or return? For now, continue.
        }

        // --- Create Pre-Generation Checkpoint ---
        if (checkpointTracker) {
            console.log("[generateStructureCommand] Creating pre-generation checkpoint...");
            try {
                await checkpointTracker.stageWorkspaceChanges();
                const commitResult = await checkpointTracker.commit();
                if (commitResult) {
                    preGenerationCheckpointHash = commitResult;
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, preGenerationCheckpointHash);
                    console.log(`[generateStructureCommand] Pre-generation checkpoint created. Hash: ${preGenerationCheckpointHash}`);
                                   // Notification removed as requested. Log message remains.
                    if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: true }); } // Update undo state
                } else {
                    console.warn("[generateStructureCommand] Failed to create pre-generation checkpoint. Proceeding without undo capability for this run.");
                    await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                    preGenerationCheckpointHash = null;
                                   vscode.window.showWarningMessage('Failed to create pre-generation checkpoint. Undo will not be available.');
                    if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); } // Update undo state
                }
            } catch (commitError) {
                console.error("[generateStructureCommand] Error during pre-generation commit:", commitError);
                            vscode.window.showErrorMessage(`Failed to create pre-generation checkpoint: ${commitError instanceof Error ? commitError.message : String(commitError)}`);
                await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                preGenerationCheckpointHash = null;
                if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); } // Update undo state
                // Decide whether to stop the whole process if the pre-gen checkpoint fails
                // webview?.postMessage({ command: 'generationFinished', success: false }); // Reset button on pre-gen commit failure
                // return; // Uncomment if you want to stop if pre-gen checkpoint fails
            }
        } else {
            console.log("[generateStructureCommand] Skipping pre-generation checkpoint (tracker not available).");
             await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
             if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); } // Update undo state
        }
        // Ensure post-gen key is cleared initially
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);


        // --- Perform Structure Generation via Task ---
        console.log("[generateStructureCommand] Proceeding with structure generation steps.");
        let cleanedInput = rawInputText.trim();
        cleanedInput = cleanedInput.replace(/^```[^\n]*\n?/, '');
        cleanedInput = cleanedInput.replace(/\n?```\s*$/, '');

        const operations = parseCustomFormat(cleanedInput);
        console.log('[generateStructureCommand] Parsed operations count:', operations.length);

        if (operations.length > 0) {
            console.log('[generateStructureCommand] Calling generateAndExecuteScriptAsTask...');
            const { success: taskSuccess, progress: taskProgress } = await generateAndExecuteScriptAsTask(operations, workspaceRootPath);
            generationSuccess = taskSuccess;
            console.log(`[generateStructureCommand] Task finished. Success: ${generationSuccess}. Progress lines: ${taskProgress.length}`);

            // Create Post-Generation Checkpoint if successful
            if (generationSuccess && checkpointTracker) {
                console.log("[generateStructureCommand] Staging and committing post-generation checkpoint immediately...");
                try {
                    const stageResult = await checkpointTracker.stageWorkspaceChanges();
                    if (stageResult.success) {
                        const postCommitResult = await checkpointTracker.commit();
                        if (postCommitResult && postCommitResult !== preGenerationCheckpointHash) {
                            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, postCommitResult);
                            console.log(`[generateStructureCommand] Post-generation checkpoint created. Hash: ${postCommitResult}`);
                        } else if (postCommitResult === preGenerationCheckpointHash) {
                             console.log(`[generateStructureCommand] Post-generation state identical to pre-generation. Not updating successful generation key.`);
                        } else {
                            console.warn("[generateStructureCommand] Failed to create post-generation checkpoint (commit returned undefined).");
                            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                                  vscode.window.showWarningMessage('Could not save state after successful generation.');
                        }
                    } else {
                         console.warn("[generateStructureCommand] Failed to stage changes after generation. Post-gen checkpoint cannot be created.");
                         await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                           vscode.window.showWarningMessage('Could not stage changes after successful generation. Post-generation state not saved.');
                    }
                } catch (postCommitError) {
                    console.error("[generateStructureCommand] Error during post-generation staging/commit:", postCommitError);
                    await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                                   vscode.window.showWarningMessage(`Error saving post-generation state: ${postCommitError instanceof Error ? postCommitError.message : String(postCommitError)}`);
                }
            } else if (!generationSuccess) {
                 await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
                 console.log("[generateStructureCommand] Generation failed, clearing post-generation checkpoint key.");
            } else if (generationSuccess && !checkpointTracker) {
                console.log("[generateStructureCommand] Generation successful, but checkpoints were not available. Post-generation state not saved.");
            }

             // Send 'generationFinished' *immediately* after task completion
             if (webview) {
                 console.log(`[generateStructureCommand] Sending 'generationFinished' immediately. Success: ${generationSuccess}`);
                 webview.postMessage({ command: 'generationFinished', success: generationSuccess });
                 console.log(`[generateStructureCommand] 'generationFinished' message sent.`);
             } else {
                  console.log(`[generateStructureCommand] No webview to send 'generationFinished' immediately.`);
             }

            // Send progress updates *after* sending finished status
            if (webview && taskProgress.length > 0) {
                console.log(`[generateStructureCommand] Sending ${taskProgress.length} progress messages to webview...`);
                webview.postMessage({ command: 'generationProgress', progress: taskProgress });
                console.log(`[generateStructureCommand] 'generationProgress' message sent.`);
            } else if (taskProgress.length > 0) {
                 console.log('[generateStructureCommand] Task progress messages (no webview to send to):', taskProgress);
            }


            // --- Offer Undo or Final Message ---
            if (preGenerationCheckpointHash) {
                const finalMessage = generationSuccess
                                   ? `Structure generated. Pre-generation checkpoint: ${preGenerationCheckpointHash.substring(0, 7)}.`
                                   : `Generation failed. Pre-generation checkpoint: ${preGenerationCheckpointHash.substring(0, 7)}.`;
                console.log('[generateStructureCommand] Offering Undo option based on pre-generation checkpoint.');
                // Notification removed as requested.
                // The undo button in the webview remains the primary way to undo.
                console.log(`[generateStructureCommand] ${finalMessage} (Notification suppressed)`);
                // Keep the logic to ensure the undo state in the webview is correct based on preGenerationCheckpointHash
                if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: true }); }

            } else if (generationSuccess) {
                 console.log('[generateStructureCommand] Structure generated. Undo checkpoint was not available for this run.');
                 // Also remove the notification for success without checkpoint
                 // vscode.window.showInformationMessage('Structure generated (Checkpoint/Undo not available for this run).');
                 console.log('[generateStructureCommand] Structure generated (Checkpoint/Undo not available for this run). (Notification suppressed)');
            } // No specific message for failure without checkpoint, task output handles it.

        } else { // No operations parsed
            console.log('[generateStructureCommand] No operations parsed. Nothing executed.');
            generationSuccess = true; // Mark as "success" as no generation *error* occurred

            if (cleanedInput.trim().length > 0) {
                            vscode.window.showWarningMessage("No valid <command> or <code> operations found. Nothing was generated.");
            } else {
                            vscode.window.showWarningMessage("No structure text provided. Nothing was generated.");
            }

            // Send generationFinished when no operations
            if (webview) {
                console.log(`[generateStructureCommand] No operations parsed. Sending 'generationFinished'. Success: ${generationSuccess}`);
                webview.postMessage({ command: 'generationFinished', success: generationSuccess }); // Send finished signal to reset button
                console.log(`[generateStructureCommand] 'generationFinished' message sent.`);
            }

            // If a pre-gen checkpoint was created but no operations ran, clear it and update state.
            if (preGenerationCheckpointHash && context.workspaceState.get(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY) === preGenerationCheckpointHash) {
                 await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
                 console.log("[generateStructureCommand] No operations parsed, cleared pre-generation checkpoint key.");
                             vscode.window.showInformationMessage(`Checkpoint ${preGenerationCheckpointHash.substring(0,7)} was created, but no operations were executed.`);
                  if (webview) { webview.postMessage({ command: 'updateUndoState', canUndo: false }); } // Update undo state
            }
            // Ensure successful generation key is cleared if no operations ran
            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        }

    } catch (error) { // Catch errors from the setup/checkpoint phase before task execution
              vscode.window.showErrorMessage(`Error during generation setup process: ${error instanceof Error ? error.message : String(error)}`);
        console.error("[generateStructureCommand] Setup/Checkpoint Error:", error);
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        generationSuccess = false; // Ensure generation is marked as failed
        if (webview) {
             console.log(`[generateStructureCommand] CATCH: Sending 'generationFinished' due to error. Success: false`);
             webview.postMessage({ command: 'generationFinished', success: false }); // Reset button on error
             console.log(`[generateStructureCommand] CATCH: 'generationFinished' message sent.`);
             webview.postMessage({ command: 'updateUndoState', canUndo: false }); // Update undo state
        }
    } finally {
         // Update the webview's undo button state as a final safety check (may be redundant now but safe)
         const finalPreGenCheckpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (webview) {
             console.log(`[generateStructureCommand] FINALLY: Sending final 'updateUndoState'. Pre-gen checkpoint available: ${!!finalPreGenCheckpointHash}`);
             webview.postMessage({ command: 'updateUndoState', canUndo: !!finalPreGenCheckpointHash });
         }

         // Refresh the file tree view *after* all other logic
         console.log("[generateStructureCommand] FINALLY: Triggering Copy System view refresh...");
         vscode.commands.executeCommand('buildy.refreshCopySystemView');

         console.log("[generateStructureCommand] Generation process function finished.");
    }
}