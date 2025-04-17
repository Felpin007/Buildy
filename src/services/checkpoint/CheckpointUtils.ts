// src/services/checkpoint/CheckpointUtils.ts
import { mkdir, access, constants } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import * as os from "os";
import * as crypto from 'crypto';

/**
 * Gets the path to the shadow Git repository's parent directory in globalStorage.
 * The actual .git directory will be inside this path.
 *
 * Checkpoints path structure:
 * globalStorage/
 *   checkpoints/
 *     {cwdHash}/  <- This is the path returned
 *       .git/
 *
 * @param globalStoragePath - The VS Code global storage path.
 * @param cwdHash - Hash of the working directory path.
 * @returns Promise<string> The absolute path to the shadow git directory for the workspace.
 * @throws Error if global storage path is invalid.
 */
export async function getCheckpointsDirectory(globalStoragePath: string, cwdHash: string): Promise<string> {
	if (!globalStoragePath) {
		throw new Error("Global storage path is required");
	}
	// Use a consistent top-level directory name
	const checkpointsBaseDir = path.join(globalStoragePath, "aiStructureCheckpoints");
	const workspaceCheckpointsDir = path.join(checkpointsBaseDir, cwdHash);
	// Ensure the directory exists before returning the path
	await mkdir(workspaceCheckpointsDir, { recursive: true });
	return workspaceCheckpointsDir;
}

/**
 * Gets the full path to the shadow .git directory itself.
 *
 * @param globalStoragePath - The VS Code global storage path.
 * @param cwdHash - Hash of the working directory path.
 * @returns Promise<string> The absolute path to the shadow .git directory.
 * @throws Error if global storage path is invalid.
 */
export async function getShadowGitPath(globalStoragePath: string, cwdHash: string): Promise<string> {
    const checkpointsDir = await getCheckpointsDirectory(globalStoragePath, cwdHash);
    return path.join(checkpointsDir, ".git");
}


/**
 * Gets the current working directory from the VS Code workspace.
 * Validates that checkpoints are not being used in protected directories.
 * Checks for read access to the workspace.
 *
 * Protected directories: Home, Desktop, Documents, Downloads.
 *
 * @returns Promise<string> The absolute path to the current working directory.
 * @throws Error if no workspace is detected, if in a protected directory, or if no read/write access.
 */
export async function getWorkingDirectory(): Promise<string> {
	// Ensure there's exactly one workspace folder for simplicity
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		throw new Error("No workspace folder open. Please open a folder to use checkpoints.");
	}
	if (workspaceFolders.length > 1) {
		// TODO: Potentially support multi-root workspaces later, maybe by hashing all roots?
		console.warn("Multiple workspace folders detected. Checkpoints will operate on the first folder only:", workspaceFolders[0].uri.fsPath);
		// For now, throw or just use the first one? Let's use the first one but warn.
		// throw new Error("Checkpoints currently do not support multi-root workspaces.");
	}
	const cwd = workspaceFolders[0].uri.fsPath;

	// Check if directory exists and we have read/write permissions
	try {
		// Check for read and write access
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

	// Check against protected directories
	const homedir = os.homedir();
	const desktopPath = path.join(homedir, "Desktop");
	const documentsPath = path.join(homedir, "Documents");
	const downloadsPath = path.join(homedir, "Downloads");

	// Normalize paths for reliable comparison
	const normalizedCwd = path.normalize(cwd);
	const protectedPaths = [
		path.normalize(homedir),
		path.normalize(desktopPath),
		path.normalize(documentsPath),
		path.normalize(downloadsPath)
	].filter(p => p); // Filter out potentially undefined paths if homedir fails

	if (protectedPaths.includes(normalizedCwd)) {
		throw new Error(`Cannot use checkpoints directly in protected system directory: ${cwd}. Please use a subfolder.`);
	}

	// Add check for root directory on Unix-like systems (e.g., '/') or drive root on Windows (e.g., 'C:\')
	const parsedPath = path.parse(normalizedCwd);
	if (parsedPath.dir === parsedPath.root) {
 		throw new Error(`Cannot use checkpoints directly in the root directory: ${cwd}. Please use a subfolder.`);
 	}


	return cwd;
}

/**
 * Hashes the working directory path to create a unique identifier for the shadow repo folder.
 * Uses SHA-256 for a robust hash.
 * @param workingDir - The absolute path to the working directory.
 * @returns A hex string representation of the SHA-256 hash.
 * @throws {Error} If the working directory path is empty or invalid.
 */
export function hashWorkingDir(workingDir: string): string {
	if (!workingDir) {
		throw new Error("Working directory path cannot be empty");
	}
	// Normalize the path for consistent hashing across platforms (e.g., drive letter case)
	const normalizedDir = path.normalize(workingDir).toLowerCase();
	const hash = crypto.createHash('sha256');
	hash.update(normalizedDir);
	return hash.digest('hex');
}
