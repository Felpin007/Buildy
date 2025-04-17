// src/services/fileSystemService.ts

import * as vscode from 'vscode';

/**
 * Represents a node in the file tree structure displayed in the webview.
 */
export interface FileTreeNode {
    name: string;
    uri: vscode.Uri;
    relativePath: string; // Path relative to workspace root, using forward slashes
    type: 'file' | 'directory';
    children?: FileTreeNode[];
}

/**
 * Recursively reads the directory structure starting from a given URI.
 * Ignores common unnecessary files/folders like .git, node_modules, etc.
 * Sorts entries with directories first, then alphabetically.
 * @param dirUri The URI of the directory to start reading from.
 * @param relativePathBase The relative path accumulated so far from the workspace root.
 * @returns A promise that resolves to an array of FileTreeNode objects representing the directory contents.
 * @throws An error if reading a critical directory fails (other than FileNotFound).
 */
export async function getWorkspaceTree(dirUri: vscode.Uri, relativePathBase: string): Promise<FileTreeNode[]> {
    console.log(`[fileSystemService.getWorkspaceTree] ENTER: Processing directory: ${dirUri.fsPath}, relativeBase: '${relativePathBase}'`);
    let entries: [string, vscode.FileType][];
    try {
        console.log(`[fileSystemService.getWorkspaceTree] Reading directory: ${dirUri.fsPath}`);
        entries = await vscode.workspace.fs.readDirectory(dirUri);
        console.log(`[fileSystemService.getWorkspaceTree] Read directory success: ${dirUri.fsPath}, found ${entries.length} entries`);
    } catch (error) {
         // If reading the directory fails (e.g., permissions, deleted), handle gracefully
         console.warn(`[fileSystemService.getWorkspaceTree] Failed to read directory ${dirUri.fsPath}:`, error);
         // Check if the specific error is 'FileNotFound' which might mean the folder was deleted during scan
         if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
             return []; // Treat as empty if deleted mid-scan
         }
         throw error; // Re-throw other critical errors
    }

    const nodes: FileTreeNode[] = [];

    // Sort entries: directories first, then files, alphabetically
    entries.sort(([nameA, typeA], [nameB, typeB]) => {
        if (typeA === vscode.FileType.Directory && typeB !== vscode.FileType.Directory) {
            return -1; // Directory A comes first
        }
        if (typeA !== vscode.FileType.Directory && typeB === vscode.FileType.Directory) {
            return 1; // Directory B comes first
        }
        // If types are the same (both dir or both file), sort alphabetically
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const [name, type] of entries) {
        // Simple ignore list - enhance as needed (consider .gitignore parsing for more complex cases)
        // TODO: Make this ignore list configurable or use .gitignore
        if (name === '.git' || name === 'node_modules' || name === '.vscode' || name === 'out' || name === 'dist' || name === '.DS_Store' || name === 'build') {
             continue;
        }

        const currentUri = vscode.Uri.joinPath(dirUri, name);
        // Ensure forward slashes for consistency in relative paths
        const relativePath = (relativePathBase ? `${relativePathBase}/${name}` : name);

        if (type === vscode.FileType.Directory) {
            // Recursively get children, handle errors during recursion gracefully
            let children: FileTreeNode[] = [];
            try {
                // Pass the updated relative path base for the next level
                console.log(`[fileSystemService.getWorkspaceTree] RECURSION START for: ${currentUri.fsPath}, newRelativePath: '${relativePath}'`);
                children = await getWorkspaceTree(currentUri, relativePath);
                console.log(`[fileSystemService.getWorkspaceTree] RECURSION END for: ${currentUri.fsPath}`);
            } catch (recursionError) {
                // --- MODIFICATION START ---
                console.error(`[fileSystemService.getWorkspaceTree] Non-critical error processing subdirectory ${currentUri.fsPath}. Skipping this directory's children. Error:`, recursionError);
                // Log the error and continue. The 'children' array will remain empty for this node.
                // This prevents a single problematic subdirectory from halting the entire tree generation.
                // throw recursionError; // Original line removed/commented
                // --- MODIFICATION END ---
            }
            nodes.push({
                name,
                uri: currentUri,
                relativePath: relativePath,
                type: 'directory',
                children: children
            });
        } else if (type === vscode.FileType.File) {
            nodes.push({
                name,
                uri: currentUri,
                relativePath: relativePath,
                type: 'file'
            });
        }
        // Ignore symbolic links, unknown types for simplicity
    }
    console.log(`[fileSystemService.getWorkspaceTree] EXIT: Finished processing directory: ${dirUri.fsPath}`);
    return nodes;
}

// Add other file system related functions here if needed
// e.g., createFile, createDirectory, deleteItem, pathExists (though some might use vscode.workspace.fs directly)