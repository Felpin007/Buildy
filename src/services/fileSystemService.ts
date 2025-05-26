import * as vscode from 'vscode';
export interface FileTreeNode {
    name: string;
    uri: vscode.Uri;
    relativePath: string; 
    type: 'file' | 'directory';
    children?: FileTreeNode[];
}
export async function getWorkspaceTree(dirUri: vscode.Uri, relativePathBase: string): Promise<FileTreeNode[]> {
    console.log(`[fileSystemService.getWorkspaceTree] ENTER: Processing directory: ${dirUri.fsPath}, relativeBase: '${relativePathBase}'`);
    let entries: [string, vscode.FileType][];
    try {
        console.log(`[fileSystemService.getWorkspaceTree] Reading directory: ${dirUri.fsPath}`);
        entries = await vscode.workspace.fs.readDirectory(dirUri);
        console.log(`[fileSystemService.getWorkspaceTree] Read directory success: ${dirUri.fsPath}, found ${entries.length} entries`);
    } catch (error) {
         console.warn(`[fileSystemService.getWorkspaceTree] Failed to read directory ${dirUri.fsPath}:`, error);
         if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
             return []; 
         }
         throw error; 
    }
    const nodes: FileTreeNode[] = [];
    entries.sort(([nameA, typeA], [nameB, typeB]) => {
        if (typeA === vscode.FileType.Directory && typeB !== vscode.FileType.Directory) {
            return -1; 
        }
        if (typeA !== vscode.FileType.Directory && typeB === vscode.FileType.Directory) {
            return 1; 
        }
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (const [name, type] of entries) {
        if (name === '.git' || name === 'node_modules' || name === '.vscode' || name === 'out' || name === 'dist' || name === '.DS_Store' || name === 'build') {
             continue;
        }
        const currentUri = vscode.Uri.joinPath(dirUri, name);
        const relativePath = (relativePathBase ? `${relativePathBase}/${name}` : name);
        if (type === vscode.FileType.Directory) {
            let children: FileTreeNode[] = [];
            try {
                console.log(`[fileSystemService.getWorkspaceTree] RECURSION START for: ${currentUri.fsPath}, newRelativePath: '${relativePath}'`);
                children = await getWorkspaceTree(currentUri, relativePath);
                console.log(`[fileSystemService.getWorkspaceTree] RECURSION END for: ${currentUri.fsPath}`);
            } catch (recursionError) {
                console.error(`[fileSystemService.getWorkspaceTree] Non-critical error processing subdirectory ${currentUri.fsPath}. Skipping this directory's children. Error:`, recursionError);
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
    }
    console.log(`[fileSystemService.getWorkspaceTree] EXIT: Finished processing directory: ${dirUri.fsPath}`);
    return nodes;
}
