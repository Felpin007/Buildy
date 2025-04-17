// src/extension.ts

import * as vscode from 'vscode';
// Removed fs, path, os imports if no longer needed directly here
// import * as fs from 'fs/promises';
// import * as path from 'path';
// import * as os from 'os';
// Removed simpleGit import
// import simpleGit, { SimpleGit, CheckRepoActions, CleanOptions } from 'simple-git';
import { CopySystemProvider } from './CopySystemProvider';
import { StructureViewProvider } from './StructureViewProvider';
import * as constants from './constants'; // Keep constants import
// Removed validationUtils, pathUtils imports if no longer needed directly here
// import { validateFileName } from './utils/validationUtils';
// import { escapePath } from './utils/pathUtils';
// Removed parserService, taskService imports if no longer needed directly here
// import { Operation, parseCustomFormat } from './services/parserService';
// import { generateAndExecuteScriptAsTask } from './services/taskService';
// Removed gitService import
// import { checkGitInstallation, initializeGitRepository } from './services/gitService';
// Import the command functions
import * as commands from './commands';
// Removed lodash import (debounce)
// import { debounce } from 'lodash';

// --- Helper Functions Removed ---
// Git helpers moved to src/services/checkpoint/*
// Task generation moved to src/services/taskService.ts

// --- Debounced Auto-Commit Function Removed ---
// Auto-commit logic is no longer needed with the shadow repo approach.

// --- Main Activation Function ---
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "Buildy" (with Shadow Checkpoints) is now active!');

    // Ensure global storage path exists (needed by CheckpointTracker)
    // VS Code typically handles creation, but good practice to ensure
    context.globalStorageUri.fsPath; // Accessing it might trigger creation if needed
    console.log(`[Activate] Global Storage Path: ${context.globalStorageUri.fsPath}`);


    // Register Structure View Provider
    const structureProvider = new StructureViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(StructureViewProvider.viewType, structureProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Register Copy System View Provider
    const copySystemProvider = new CopySystemProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CopySystemProvider.viewType, copySystemProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // --- Register Generation Command ---
    // Passes context needed for CheckpointTracker to find globalStoragePath
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.processPastedStructure',
            // Ensure the registered function signature matches the arguments passed by executeCommand
            (rawInputText: string, webview?: vscode.Webview) => commands.processPastedStructureCommand(context, structureProvider, rawInputText, webview)
        )
    );

    // --- Register Undo Command ---
    // Passes context needed for CheckpointTracker
    // The command implementation now handles the optional hash argument logic
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.undoLastGeneration',
                     // --- MODIFICATION START: Pass webview ---
                     (checkpointHash?: string) => {
                         // Get the webview instance from the provider if the view is active
                         const webview = structureProvider.getWebviewView()?.webview;
                         commands.undoLastGenerationCommand(context, structureProvider, checkpointHash, webview);
                     }
                     // --- MODIFICATION END ---
        )
    );

    // --- Register Show Diff Command ---
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.showDiff',
            (relativePath: string) => commands.showDiffCommand(context, relativePath)
        )
    );

    // --- Register Copy Files Content Command ---
    // This command remains unchanged as it doesn't interact with checkpoints
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.copySelectedFilesContent',
            async (relativePaths: string[] | undefined) => {
                if (!relativePaths || relativePaths.length === 0) {
                    vscode.window.showInformationMessage('Nenhum arquivo selecionado para cópia.'); // TRANSLATED
                    return;
                }

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('Nenhuma pasta de workspace aberta.'); // TRANSLATED
                    return;
                }
                const workspaceRootUri = workspaceFolders[0].uri;

                let combinedContent = '';
                let filesCopiedCount = 0;
                let filesFailedCount = 0;

                // List of non-text file extensions
                const nonTextExtensions = new Set([
                    '.png', '.jpg', '.jpeg', '.gif', // Images (excluding SVG which is text-based)
                    '.mp3', '.wav', '.ogg', '.aac', // Audio
                    '.mp4', '.mov', '.avi', '.mkv', // Video
                    '.zip', '.rar', '.7z', '.tar', '.gz', // Archives
                    '.pdf', '.doc', '.docx', '.xls', '.xlsx' // Documents
                ]);

                for (const relPath of relativePaths) {
                    try {
                        const fileExt = relPath.substring(relPath.lastIndexOf('.')).toLowerCase();
                        const isTextFile = !nonTextExtensions.has(fileExt);

                        if (combinedContent.length > 0) {
                            combinedContent += '\n\n---\n\n'; // Separator
                        }
                        combinedContent += `// --- ${relPath} ---\n\n`;

                        if (isTextFile) {
                            const fileUri = vscode.Uri.joinPath(workspaceRootUri, relPath);
                            const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
                            const fileContent = Buffer.from(fileContentBytes).toString('utf8');
                            combinedContent += fileContent;
                        } else {
                            combinedContent += `[Arquivo binário - ${relPath}]`; // TRANSLATED
                        }
                        filesCopiedCount++;
                    } catch (error) {
                        filesFailedCount++;
                        console.error(`[copySelectedFilesContent] Error reading file ${relPath}:`, error);
                        // Add error marker to combined content
                         if (combinedContent.length > 0) {
                            combinedContent += '\n\n---\n\n'; // Separator
                        }
                        combinedContent += `// --- ${relPath} ---\n\n[Erro ao ler arquivo: ${error instanceof Error ? error.message : String(error)}]`; // TRANSLATED
                    }
                }

                if (filesCopiedCount > 0 || filesFailedCount > 0) { // Copy even if only errors occurred
                    await vscode.env.clipboard.writeText(combinedContent.trim());
                    let message = `Conteúdo copiado de ${filesCopiedCount} arquivo(s).`; // TRANSLATED
                    if (filesFailedCount > 0) {
                        message += ` Falha ao ler ${filesFailedCount} arquivo(s).`; // TRANSLATED
                        vscode.window.showWarningMessage(message);
                    } else {
                        vscode.window.showInformationMessage(message);
                    }
                } else {
                    // This case should ideally not be reached if input validation works
                    vscode.window.showErrorMessage(`Falha ao processar os arquivos selecionados.`); // TRANSLATED
                }
            }
        )
    );

    // --- MODIFICATION START: Register Refresh Copy System View Command ---
    context.subscriptions.push(
        vscode.commands.registerCommand('buildy.refreshCopySystemView', () => {
            console.log("[Command: refreshCopySystemView] Triggered.");
            // Ensure the provider has initialized and its view is potentially available
            if (copySystemProvider) {
                copySystemProvider.refreshFileTree();
            } else {
                console.warn("[Command: refreshCopySystemView] CopySystemProvider not available.");
            }
        })
    );
    // --- MODIFICATION END ---


    // --- Auto-Commit File System Watcher Removed ---
    // The shadow repo handles its state internally via explicit commits.
    // console.log('[Activate] Auto-commit watcher removed.');

} // End of activate function


// --- Deactivation Function ---
export function deactivate() {
    console.log('Extension "Buildy" deactivated.');
    // No specific cleanup needed for shadow repo unless explicitly required
}