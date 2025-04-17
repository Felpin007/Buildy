// src/commands/undoChanges.ts

import * as vscode from 'vscode';
// Removed simple-git imports
// import simpleGit, { SimpleGit, CheckRepoActions, CleanOptions } from 'simple-git';
import * as constants from '../constants';
// Removed gitService import
// import { checkGitInstallation } from '../services/gitService';
import { StructureViewProvider } from '../StructureViewProvider';
import CheckpointTracker, { DiffEntry } from '../services/checkpoint/CheckpointTracker'; // Import DiffEntry

/**
 * Handles the logic for undoing the last structure generation by resetting
 * the workspace files to a specific checkpoint state using the shadow Git repo.
 * @param context The extension context, used to access global storage path.
 * @param provider The StructureViewProvider instance (may not be needed).
 * @param checkpointHash The specific commit hash in the shadow repo to revert to.
 * @param webview Optional webview for progress reporting and state updates.
 */
export async function undoLastGenerationCommand(
    context: vscode.ExtensionContext,
    provider: StructureViewProvider, // Keep for now
    checkpointHash: string | undefined, // Target hash to revert TO
       // --- MODIFICATION START: Add webview parameter ---
       webview?: vscode.Webview // Optional webview for progress reporting
       // --- MODIFICATION END ---
   ): Promise<void> {

    // --- Start: Logic to get checkpoint hash if not provided ---
    if (!checkpointHash) {
         // If called directly without a hash (e.g., from command palette), try getting the last one?
         checkpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
         if (!checkpointHash) {
                     vscode.window.showWarningMessage('No previous generation checkpoint found to undo.');
            return;
         }
         console.warn("[undoCommand] Undo command called without specific hash, using last stored pre-generation hash:", checkpointHash);
         // Consider adding a stronger warning or disabling direct palette execution if this is problematic.
    }
    // --- End of logic to get checkpoint hash ---

    const targetCheckpointShortHash = checkpointHash.substring(0, 7);

    // --- Start: Confirmation dialog ---
    const confirm = await vscode.window.showWarningMessage(
              `Are you sure you want to revert tracked files to the state of checkpoint ${targetCheckpointShortHash}?\n\n` +
              `This will overwrite modified files in your workspace with the version saved in the checkpoint.\n` +
              `(New untracked files created by the generation will NOT be removed by this operation.)`,
              { modal: true },
              'Undo to Checkpoint' // Button text
       );
       // --- End of confirmation dialog ---

       if (confirm !== 'Undo to Checkpoint') {
               vscode.window.showInformationMessage('Undo operation cancelled.');
         // Do NOT clear the key here - generateStructure handles that if user declines prompt there.
         return;
    }

    let tracker: CheckpointTracker | undefined;
       let hashBeforeUndo: string | undefined; // To store the state just before reset

    try {
        // Need to create a tracker instance to perform the reset
        const tempTaskId = `undo-${Date.now()}`;
        tracker = await CheckpointTracker.create(tempTaskId, context.globalStorageUri.fsPath);

        if (!tracker) {
            // Should not happen if generate worked, but handle defensively
                     vscode.window.showErrorMessage('Could not initialize checkpoint system to perform undo.');
            return;
        }

              // Capture state BEFORE reset
              console.log("[undoCommand] Staging current state before undo...");
              await tracker.stageWorkspaceChanges();
              hashBeforeUndo = await tracker.commit(); // Commit the state *before* resetting
              if (!hashBeforeUndo) {
                  console.warn("[undoCommand] Failed to get a distinct commit hash before undo. The state might be unchanged, or an error occurred. Skipping diff calculation for the undo operation.");
              } else {
                  console.log(`[undoCommand] Captured state before undo. Temporary commit hash: ${hashBeforeUndo}`);
              }

              // Send "Reverting..." message to webview
              if (webview) {
                              webview.postMessage({ command: 'undoProgressStart', message: `Reverting to checkpoint ${targetCheckpointShortHash}...` });
              } else {
                              vscode.window.showInformationMessage(`Reverting files to checkpoint ${targetCheckpointShortHash}...`);
              }

        // Perform the reset using the tracker
        await tracker.resetHead(checkpointHash);
        console.log(`[undoCommand] resetHead(${checkpointHash}) completed.`);

              // Calculate diff and store hashes
              let undoDiffSet: DiffEntry[] = [];
              if (hashBeforeUndo) {
                  console.log(`[undoCommand] Calculating diff between before-undo state (${hashBeforeUndo}) and after-undo state (${checkpointHash})...`);
                  try {
                      // Diff from the state *before* undo to the state *after* undo (the target checkpoint)
                      undoDiffSet = await tracker.getDiffSet(hashBeforeUndo, checkpointHash);
                      console.log(`[undoCommand] Calculated undo diff. ${undoDiffSet.length} files changed.`);

                      // Store hashes for the diff view
                      await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, hashBeforeUndo);
                      await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, checkpointHash); // The state we reverted TO
                      console.log(`[undoCommand] Stored undo diff hashes: Before=${hashBeforeUndo}, After=${checkpointHash}`);

                  } catch (diffError) {
                      console.error("[undoCommand] Failed to calculate diff for undo operation:", diffError);
                      // Clear undo hashes if diff fails
                      await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
                      await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
                  }
              } else {
                   // Clear undo hashes if we couldn't capture the before state
                   await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
                   await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
              }


              // Send undo progress/completion to webview
               if (webview) {
                   const undoProgress = undoDiffSet.map(entry => ({
                       relativePath: entry.relativePath,
                       status: 'Reverted' // Or derive from git status if needed
                   }));
                   webview.postMessage({
                       command: 'undoProgress',
                       progress: undoProgress,
                       success: true // Assuming resetHead succeeded if no error thrown
                   });
                   webview.postMessage({ command: 'undoFinished', success: true }); // Separate finished signal
                   console.log("[undoCommand] Sent undo progress and finished messages to webview.");
               } else {
                                    vscode.window.showInformationMessage('Files successfully reverted to checkpoint!');
               }


        // Clear the *generation* checkpoint keys as they are no longer relevant
        await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
        await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
        console.log("[undoCommand] Cleared generation checkpoint keys after successful undo.");

        // --- MODIFICATION START: Update Undo Button and Refresh Tree ---
        if (webview) {
            console.log("[undoCommand] Sending final updateUndoState(false) after successful undo.");
            webview.postMessage({ command: 'updateUndoState', canUndo: false });
        }
        console.log("[undoCommand] Triggering Copy System view refresh after successful undo...");
        vscode.commands.executeCommand('buildy.refreshCopySystemView');
        // --- MODIFICATION END ---

        // Refreshing the explorer is handled by VS Code's file watcher

    } catch (undoError) {
        const ignoredErrorSubstring = "pathspec '.' did not match any file(s) known to git";
        const isIgnoredError = undoError instanceof Error && undoError.message.includes(ignoredErrorSubstring);

        if (isIgnoredError) {
            // Log the specific error but treat the operation as successful for the user
            console.warn(`[undoCommand] Ignored known error during revert: ${undoError.message}`);

            // Treat as success: Clear generation keys, update UI accordingly
            await context.workspaceState.update(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY, undefined);
            await context.workspaceState.update(constants.LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY, undefined);
            console.log("[undoCommand] Cleared generation checkpoint keys after ignored error during undo.");

            if (webview) {
                // Send success signals despite the underlying git message
                webview.postMessage({ command: 'undoFinished', success: true });
                webview.postMessage({ command: 'updateUndoState', canUndo: false });
                console.log("[undoCommand] Sent success messages to webview after ignored error.");
           } else {
               // No notification shown for ignored error even without webview
                console.log('[undoCommand] Files successfully reverted to checkpoint! (Notification suppressed)');
           }
           // Refresh tree view
            console.log("[undoCommand] Triggering Copy System view refresh after ignored error...");
            vscode.commands.executeCommand('buildy.refreshCopySystemView');

        } else {
            // Handle unexpected errors as before
            console.error("[undoCommand] Error reverting to checkpoint:", undoError);
            if (webview) {
                webview.postMessage({ command: 'undoFinished', success: false });
                webview.postMessage({ command: 'undoProgressError', message: `Failed to revert: ${undoError instanceof Error ? undoError.message : String(undoError)}` });
                console.log("[undoCommand] Sent undo failure messages to webview.");
                // Update undo state based on potentially remaining pre-gen hash
                const finalPreGenHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);
                webview.postMessage({ command: 'updateUndoState', canUndo: !!finalPreGenHash });
            } else {
                 vscode.window.showErrorMessage(`Failed to revert to checkpoint: ${undoError instanceof Error ? undoError.message : String(undoError)}`);
            }
        }

        // Always clear undo diff hashes in case of any error (ignored or not)
        await context.workspaceState.update(constants.LAST_UNDO_BEFORE_HASH_KEY, undefined);
        await context.workspaceState.update(constants.LAST_UNDO_AFTER_HASH_KEY, undefined);
    }
}