import { mkdir, access, constants } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import * as os from "os";
import * as crypto from 'crypto';
export async function getCheckpointsDirectory(globalStoragePath: string, cwdHash: string): Promise<string> {
	if (!globalStoragePath) {
		throw new Error("Global storage path is required");
	}
	const checkpointsBaseDir = path.join(globalStoragePath, "aiStructureCheckpoints");
	const workspaceCheckpointsDir = path.join(checkpointsBaseDir, cwdHash);
	await mkdir(workspaceCheckpointsDir, { recursive: true });
	return workspaceCheckpointsDir;
}
export async function getShadowGitPath(globalStoragePath: string, cwdHash: string): Promise<string> {
    const checkpointsDir = await getCheckpointsDirectory(globalStoragePath, cwdHash);
    return path.join(checkpointsDir, ".git");
}
export async function getWorkingDirectory(): Promise<string> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		throw new Error("No workspace folder open. Please open a folder to use checkpoints.");
	}
	if (workspaceFolders.length > 1) {
		console.warn("Multiple workspace folders detected. Checkpoints will operate on the first folder only:", workspaceFolders[0].uri.fsPath);
	}
	const cwd = workspaceFolders[0].uri.fsPath;
	try {
		await access(cwd, constants.R_OK | constants.W_OK);
	} catch (error: any) {
		let accessError = `Cannot access workspace directory '${cwd}'.`;
		if (error.code === 'EPERM' || error.code === 'EACCES') {
			accessError += ' Please ensure VS Code has read and write permissions.';
		} else if (error.code === 'ENOENT') {
			accessError = `Workspace directory '${cwd}' not found.`;
		}
		accessError += ` (Error: ${error.message})`;
		throw new Error(accessError);
	}
	const homedir = os.homedir();
	const desktopPath = path.join(homedir, "Desktop");
	const documentsPath = path.join(homedir, "Documents");
	const downloadsPath = path.join(homedir, "Downloads");
	const normalizedCwd = path.normalize(cwd);
	const protectedPaths = [
		path.normalize(homedir),
		path.normalize(desktopPath),
		path.normalize(documentsPath),
		path.normalize(downloadsPath)
	].filter(p => p); 
	if (protectedPaths.includes(normalizedCwd)) {
		throw new Error(`Cannot use checkpoints directly in protected system directory: ${cwd}. Please use a subfolder.`);
	}
	const parsedPath = path.parse(normalizedCwd);
	if (parsedPath.dir === parsedPath.root) {
 		throw new Error(`Cannot use checkpoints directly in the root directory: ${cwd}. Please use a subfolder.`);
 	}
	return cwd;
}
export function hashWorkingDir(workingDir: string): string {
	if (!workingDir) {
		throw new Error("Working directory path cannot be empty");
	}
	const normalizedDir = path.normalize(workingDir).toLowerCase();
	const hash = crypto.createHash('sha256');
	hash.update(normalizedDir);
	return hash.digest('hex');
}
