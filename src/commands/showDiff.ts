// src/commands/showDiff.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import CheckpointTracker from '../services/checkpoint/CheckpointTracker';
import * as constants from '../constants';
import { fileExistsAtPath } from '../utils/fs';

// Define an interface for the arguments
interface ShowDiffArgs {
    relativePath: string;
    type?: 'generation' | 'undo'; // Default to 'generation' if omitted
}

/**
 * Handles the 'showDiff' command.
 * Shows a diff based on the context ('generation' or 'undo').
 * - 'generation': Compares the pre-generation checkpoint with the current workspace file.
 * - 'undo': Compares the state immediately before the last undo with the state immediately after.
 * @param context Extension context.
 * @param args Can be a string (relativePath, defaults to 'generation' type) or a ShowDiffArgs object.
 */
export async function showDiffCommand(context: vscode.ExtensionContext, args: ShowDiffArgs | string | undefined): Promise<void> {
    // Normalize arguments
    let relativePath: string | undefined;
    let diffType: 'generation' | 'undo' = 'generation'; // Default type

    if (typeof args === 'string') {
        relativePath = args;
    } else if (typeof args === 'object' && args !== null && args.relativePath) {
        relativePath = args.relativePath;
        diffType = args.type === 'undo' ? 'undo' : 'generation'; // Set type if provided
    }

	if (!relativePath) {
		vscode.window.showErrorMessage("No file path provided to show the difference."); // TRANSLATED
		return;
	}
    console.log(`[showDiffCommand] Received request for path: ${relativePath}, type: ${diffType}`);

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open to show the difference."); // TRANSLATED
        return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;
    const currentFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);

       let tracker: CheckpointTracker | undefined;
       const tempDir = os.tmpdir(); // Define tempDir once

       try {
           // Need a tracker instance to get the diff content
           const tempTaskId = `diff-${Date.now()}`;
           console.log(`[showDiffCommand] Attempting CheckpointTracker.create for task: ${tempTaskId}`);
           tracker = await CheckpointTracker.create(tempTaskId, context.globalStorageUri.fsPath);
           console.log(`[showDiffCommand] CheckpointTracker.create returned: ${tracker ? 'Instance' : 'undefined'}`);

           if (!tracker) {
               vscode.window.showErrorMessage("Could not initialize the checkpoint system to show the difference."); // TRANSLATED
               return;
           }

           let leftUri: vscode.Uri;
           let rightUri: vscode.Uri;
           let diffTitle: string;

           if (diffType === 'undo') {
               // --- UNDO DIFF LOGIC ---
               console.log(`[showDiffCommand] Handling 'undo' diff type for ${relativePath}`);
               const undoBeforeHash = context.workspaceState.get<string>(constants.LAST_UNDO_BEFORE_HASH_KEY);
               const undoAfterHash = context.workspaceState.get<string>(constants.LAST_UNDO_AFTER_HASH_KEY);

               if (!undoBeforeHash || !undoAfterHash) {
                   vscode.window.showWarningMessage("Could not find the checkpoints for the last undo operation."); // TRANSLATED
                   return;
               }

               const beforeShortHash = undoBeforeHash.substring(0, 7);
               const afterShortHash = undoAfterHash.substring(0, 7);

               // Fetch 'before undo' content
               const beforeContent = await tracker.getFileContentAtCommit(undoBeforeHash, relativePath);
               const tempBeforeFileName = `UNDO_BEFORE_${beforeShortHash}_${path.basename(relativePath)}`;
               leftUri = vscode.Uri.file(path.join(tempDir, tempBeforeFileName));
               await fs.writeFile(leftUri.fsPath, beforeContent);
               console.log(`[showDiffCommand] Wrote 'undo before' content to temporary file: ${leftUri.fsPath}`);

               // Fetch 'after undo' content
               const afterContent = await tracker.getFileContentAtCommit(undoAfterHash, relativePath);
               const tempAfterFileName = `UNDO_AFTER_${afterShortHash}_${path.basename(relativePath)}`;
               rightUri = vscode.Uri.file(path.join(tempDir, tempAfterFileName));
               await fs.writeFile(rightUri.fsPath, afterContent);
               console.log(`[showDiffCommand] Wrote 'undo after' content to temporary file: ${rightUri.fsPath}`);

               diffTitle = `${path.basename(relativePath)} (Undo: ${beforeShortHash} ↔ ${afterShortHash})`; // TRANSLATED

           } else {
               // --- GENERATION DIFF LOGIC (DEFAULT) ---
               console.log(`[showDiffCommand] Handling 'generation' diff type for ${relativePath}`);
               const baselineCheckpointHash = context.workspaceState.get<string>(constants.LAST_PRE_GENERATION_CHECKPOINT_KEY);

               if (!baselineCheckpointHash) {
                   vscode.window.showWarningMessage("No pre-generation checkpoint found to compare against."); // TRANSLATED
                   return;
               }

               const baselineShortHash = baselineCheckpointHash.substring(0, 7);

               // Fetch 'before generation' content
               const beforeContent = await tracker.getFileContentAtCommit(baselineCheckpointHash, relativePath);
               const tempBeforeFileName = `GEN_BEFORE_${baselineShortHash}_${path.basename(relativePath)}`;
               leftUri = vscode.Uri.file(path.join(tempDir, tempBeforeFileName));
               await fs.writeFile(leftUri.fsPath, beforeContent);
               console.log(`[showDiffCommand] Wrote 'generation before' content to temporary file: ${leftUri.fsPath}`);

               // Right side is the current file in the workspace
               rightUri = currentFileUri;

               // Check if the current file exists before attempting to diff
               const currentFileExists = await fileExistsAtPath(currentFileUri.fsPath);
               if (!currentFileExists) {
                    // If the current file doesn't exist (e.g., it was deleted after the checkpoint),
                    // the diff might be confusing or fail. We can provide a specific message.
                    console.warn(`[showDiffCommand] Current file ${relativePath} does not exist in the workspace for generation diff.`);
                    // Option 1: Show a message and don't diff
                    // vscode.window.showInformationMessage(`Cannot compare with current file: '${relativePath}' does not exist in the workspace.`);
                    // return;
                    // Option 2: Diff against an empty file (VS Code might handle this gracefully)
                    // Create an empty temp file for the right side
                    const tempEmptyFileName = `GEN_CURRENT_EMPTY_${path.basename(relativePath)}`;
                    rightUri = vscode.Uri.file(path.join(tempDir, tempEmptyFileName));
                    await fs.writeFile(rightUri.fsPath, ''); // Write empty string
                    console.log(`[showDiffCommand] Current file missing, using empty temp file for right side: ${rightUri.fsPath}`);
                    diffTitle = `${path.basename(relativePath)} (Checkpoint ${baselineShortHash} ↔ Missing File)`; // Adjusted title
               } else {
                   diffTitle = `${path.basename(relativePath)} (Checkpoint ${baselineShortHash} ↔ Current)`; // TRANSLATED
               }
           }

           // Open the diff view
           console.log(`[showDiffCommand] Opening diff view: ${leftUri.fsPath} <-> ${rightUri.fsPath}`);
           await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, diffTitle);

           // Note: VS Code doesn't automatically delete the temporary files.
           // Leaving them in temp is generally acceptable. Consider cleanup if needed.

       } catch (error) {
           console.error(`[showDiffCommand] Error showing diff for ${relativePath} (type: ${diffType}):`, error);
           vscode.window.showErrorMessage(`Failed to show the difference for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`); // TRANSLATED
       } finally {
           // Clean up the tracker instance? Not strictly necessary for temp task ID.
           // Potentially delete temporary files here if needed, though OS usually handles /tmp
       }
}