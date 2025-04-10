"use strict";
// src/extension.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const simple_git_1 = __importStar(require("simple-git")); // Import CleanOptions
const CopySystemProvider_1 = require("./CopySystemProvider"); // Import the correct provider
const StructureViewProvider_1 = require("./StructureViewProvider"); // Restore import
// Import all commands via the index file
const commands = __importStar(require("./commands"));
const lodash_1 = require("lodash"); // We'll need debounce
// --- Helper Functions --- (Moved to utils/ and services/)
// Note: contentForHereString was removed and will be added to taskService.ts
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)); // Keep for potential future use (or move to utils if needed elsewhere)
// Git helpers moved to src/services/gitService.ts
// Task generation and execution functions moved to src/services/taskService.ts
// --- Debounced Auto-Commit Function ---
// Debounce commits to avoid rapid-fire commits during multiple quick saves/changes
const DEBOUNCE_DELAY = 1500; // 1.5 seconds delay
let isCommitting = false; // Simple lock to prevent concurrent commits
const triggerAutoCommit = (0, lodash_1.debounce)(async (eventType, uri = null) => {
    if (isCommitting) {
        console.log('[AutoCommit] Commit already in progress, skipping.');
        return;
    }
    isCommitting = true;
    console.log(`[AutoCommit] Triggered by ${eventType} for URI: ${uri?.fsPath ?? 'multiple changes'}`);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.log('[AutoCommit] No workspace folder open.');
        isCommitting = false;
        return;
    }
    const workspaceRootPath = workspaceFolders[0].uri.fsPath;
    const git = (0, simple_git_1.default)(workspaceRootPath);
    try {
        const isRepo = await git.checkIsRepo(simple_git_1.CheckRepoActions.IS_REPO_ROOT);
        if (!isRepo) {
            console.log('[AutoCommit] Workspace is not a Git repository. Skipping commit.');
            isCommitting = false;
            return;
        }
        console.log('[AutoCommit] Staging all changes...');
        await git.add('.'); // Simplest way to stage creates, deletes, and modifications
        const status = await git.status();
        // Only commit if there are staged changes (add handles create/modify/delete staging)
        if (status.staged.length > 0) {
            const fileName = uri ? path.basename(uri.fsPath) : 'changes';
            // Use a more generic commit message for auto-commits
            const commitMsg = `Auto-commit: File system ${eventType} detected [${fileName}]`;
            console.log(`[AutoCommit] Committing with message: "${commitMsg}"`);
            await git.commit(commitMsg);
            console.log('[AutoCommit] Commit successful.');
            // Optional: Add a status bar message or notification
            // vscode.window.setStatusBarMessage('Auto-commit successful.', 3000);
        }
        else {
            console.log('[AutoCommit] No staged changes detected after add. Skipping commit.');
        }
    }
    catch (error) {
        console.error('[AutoCommit] Error during auto-commit:', error);
        // Avoid flooding the user with error messages for background task
        // vscode.window.showErrorMessage(`Auto-commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        isCommitting = false;
    }
}, DEBOUNCE_DELAY);
// --- Main Activation Function ---
function activate(context) {
    console.log('Extension "ai-structure-generator" (with All Features) is now active!');
    // Register Structure View
    const structureProvider = new StructureViewProvider_1.StructureViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(StructureViewProvider_1.StructureViewProvider.viewType, structureProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // Register Copy System View
    const copySystemProvider = new CopySystemProvider_1.CopySystemProvider(context.extensionUri, context); // Pass context
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CopySystemProvider_1.CopySystemProvider.viewType, copySystemProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // --- Register Generation Command ---
    // The implementation is now in src/commands/generateStructure.ts
    context.subscriptions.push(vscode.commands.registerCommand('ai-structure-generator.processPastedStructure', 
    // Pass the provider instance back to the command
    (rawInputText) => commands.processPastedStructureCommand(context, structureProvider, rawInputText)));
    // --- Register Undo Command ---
    // Implementation moved to src/commands/undoChanges.ts
    context.subscriptions.push(vscode.commands.registerCommand('ai-structure-generator.undoLastGeneration', 
    // Pass the provider instance back to the command
    () => commands.undoLastGenerationCommand(context, structureProvider)));
    // --- Register Copy Files Content Command ---
    context.subscriptions.push(vscode.commands.registerCommand('ai-structure-generator.copySelectedFilesContent', async (relativePaths) => {
        if (!relativePaths || relativePaths.length === 0) {
            vscode.window.showInformationMessage('Nenhum arquivo selecionado para cópia.');
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Nenhuma pasta de workspace aberta.');
            return;
        }
        const workspaceRootUri = workspaceFolders[0].uri;
        let combinedContent = '';
        let filesCopiedCount = 0;
        let filesFailedCount = 0;
        for (const relPath of relativePaths) {
            try {
                const fileUri = vscode.Uri.joinPath(workspaceRootUri, relPath);
                const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = Buffer.from(fileContentBytes).toString('utf8');
                combinedContent += `${relPath}:\n\n${fileContent}\n\n---\n\n`;
                filesCopiedCount++;
            }
            catch (error) {
                filesFailedCount++;
                console.error(`[copySelectedFilesContent] Error reading file ${relPath}:`, error);
                // Optionally add error marker to combined content
                combinedContent += `${relPath}:\n\n[Error reading file: ${error instanceof Error ? error.message : String(error)}]\n\n---\n\n`;
            }
        }
        if (filesCopiedCount > 0) {
            await vscode.env.clipboard.writeText(combinedContent.trim());
            let message = `Conteúdo de ${filesCopiedCount} arquivo(s) copiado para a área de transferência.`;
            if (filesFailedCount > 0) {
                message += ` Falha ao ler ${filesFailedCount} arquivo(s).`;
                vscode.window.showWarningMessage(message);
            }
            else {
                vscode.window.showInformationMessage(message);
            }
        }
        else {
            vscode.window.showErrorMessage(`Falha ao ler todos os ${filesFailedCount} arquivos selecionados.`);
        }
    }));
    // --- Setup Auto-Commit File System Watcher ---
    console.log('[Activate] Setting up FileSystemWatcher for auto-commit...');
    // Watch all files in the workspace
    // Ignore changes in .git directory and potentially node_modules, out, etc. (though .gitignore should handle most)
    // We use a single watcher for simplicity, triggering the debounced function
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    const handleFileChange = (uri, eventType) => {
        // Basic check to ignore changes within .git or the watcher might trigger itself
        if (uri.path.includes('/.git/')) {
            // console.log(`[Watcher] Ignoring change within .git: ${uri.fsPath}`);
            return;
        }
        // Add more sophisticated ignores if needed (e.g., based on settings or .gitignore parsing)
        console.log(`[Watcher] ${eventType}: ${uri.fsPath}`);
        triggerAutoCommit(eventType, uri);
    };
    // On Change (Save)
    watcher.onDidChange((uri) => handleFileChange(uri, 'Change'));
    // On Create
    watcher.onDidCreate((uri) => handleFileChange(uri, 'Create'));
    // On Delete
    watcher.onDidDelete((uri) => handleFileChange(uri, 'Delete'));
    // Add watcher to subscriptions for cleanup on deactivation
    context.subscriptions.push(watcher);
    console.log('[Activate] FileSystemWatcher for auto-commit is active.');
} // End of activate function
// --- Deactivation Function ---
function deactivate() {
    console.log('Extension "ai-structure-generator" deactivated.');
    // Clean up any resources if necessary in the future
}
//# sourceMappingURL=extension.js.map