// src/services/checkpoint/CheckpointGitOperations.ts
import fs from "fs/promises";
// Removed static import: import { globby } from "globby";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { fileExistsAtPath } from "../../utils/fs"; // Use the new utility
import { getLfsPatterns, writeExcludesFile } from "./CheckpointExclusions"
// import { telemetryService } from "../../services/telemetry/TelemetryService" // Assuming telemetry is not implemented yet

export const GIT_DISABLED_SUFFIX = "_disabled"

/**
 * GitOperations Class
 *
 * Handles git-specific operations for the Checkpoints system.
 */
export class GitOperations {
	private cwd: string

	/**
	 * Creates a new GitOperations instance.
	 * @param cwd - The current working directory for git operations (user's workspace root).
	 */
	constructor(cwd: string) {
		this.cwd = cwd;
		console.log(`[GitOperations] Initialized for CWD: ${this.cwd}`);
	}

	/**
	 * Initializes or verifies a shadow Git repository for checkpoint tracking.
	 * @param gitPath - Path to the shadow .git directory (e.g., .../globalStorage/checkpoints/{hash}/.git).
	 * @param cwd - The user's workspace root directory path.
	 * @param taskId - The ID of the task associated with this checkpoint tracker.
	 * @returns Promise<string> Path to the initialized .git directory.
	 * @throws Error if initialization or verification fails.
	 */
	public async initShadowGit(gitPath: string, cwd: string, taskId: string): Promise<string> {
		console.log(`[GitOperations.initShadowGit] Initializing shadow git at ${gitPath} for CWD ${cwd}`);

		// If repo exists, just verify worktree
		if (await fileExistsAtPath(gitPath)) {
			console.log(`[GitOperations.initShadowGit] Shadow repo exists. Verifying worktree...`);
			const checkpointsDir = path.dirname(gitPath); // The directory containing .git
			const git = simpleGit(checkpointsDir); // Initialize simple-git in the parent dir
			try {
				const worktreeConfig = await git.getConfig("core.worktree");
				const configuredWorktree = worktreeConfig.value;
				if (configuredWorktree !== cwd) {
					console.error(`[GitOperations.initShadowGit] Worktree mismatch! Expected: ${cwd}, Found: ${configuredWorktree}`);
					throw new Error(`Checkpoints can only be used in the original workspace. Expected: ${cwd}, Found in config: ${configuredWorktree}`);
				}
				console.log(`[GitOperations.initShadowGit] Worktree verified (${configuredWorktree}). Updating excludes...`);
				// Update excludes file in case patterns changed
				await writeExcludesFile(gitPath, await getLfsPatterns(this.cwd));
				return gitPath;
			} catch (error) {
				console.error(`[GitOperations.initShadowGit] Error verifying existing shadow repo:`, error);
				throw new Error(`Failed to verify existing shadow Git repository: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// Initialize new repo
		const startTime = performance.now();
		const checkpointsDir = path.dirname(gitPath);
		console.log(`[GitOperations.initShadowGit] Creating new shadow git in ${checkpointsDir}`);

		try {
			// Ensure the parent directory exists
			await fs.mkdir(checkpointsDir, { recursive: true });
			const git = simpleGit(checkpointsDir); // Initialize simple-git in the parent dir
			await git.init();
			console.log(`[GitOperations.initShadowGit] 'git init' successful.`);

			// Configure repo with git settings
			await git.addConfig("core.worktree", cwd);
			await git.addConfig("commit.gpgSign", "false"); // Disable GPG signing for checkpoints
			await git.addConfig("user.name", "AI Structure Gen Checkpoint"); // Specific user name
			await git.addConfig("user.email", "checkpoint@internal.ai"); // Specific user email
			console.log(`[GitOperations.initShadowGit] Basic git config set.`);

			// Set up LFS patterns and excludes file
			const lfsPatterns = await getLfsPatterns(cwd);
			await writeExcludesFile(gitPath, lfsPatterns);
			console.log(`[GitOperations.initShadowGit] Excludes file written.`);

			// Add files and make initial commit
			const addFilesResult = await this.addCheckpointFiles(git);
			if (!addFilesResult.success) {
				console.error("[GitOperations.initShadowGit] Failed to add initial files to shadow git. Check permissions or excludes.");
				// Decide if this is fatal. For now, let's try to commit anyway.
				// throw new Error("Failed to add initial files to checkpoints shadow git");
			} else {
				console.log(`[GitOperations.initShadowGit] Initial files added (or attempted).`);
			}

			// Initial commit only on first repo creation
			await git.commit("initial checkpoint commit", { "--allow-empty": null });
			console.log(`[GitOperations.initShadowGit] Initial commit created.`);

			const durationMs = Math.round(performance.now() - startTime);
			// telemetryService.captureCheckpointUsage(taskId, "shadow_git_initialized", durationMs); // Telemetry placeholder
			console.log(`[GitOperations.initShadowGit] Shadow git initialization completed in ${durationMs}ms`);

			return gitPath;
		} catch (initError) {
			console.error(`[GitOperations.initShadowGit] Error during initialization:`, initError);
			throw new Error(`Failed to initialize shadow Git repository: ${initError instanceof Error ? initError.message : String(initError)}`);
		}
	}

	/**
	 * Retrieves the worktree path from the shadow git configuration.
	 * @param gitPath - Path to the shadow .git directory.
	 * @returns Promise<string | undefined> The worktree path or undefined if not found/error.
	 */
	public async getShadowGitConfigWorkTree(gitPath: string): Promise<string | undefined> {
		try {
			if (!(await fileExistsAtPath(gitPath))) {
				console.warn(`[GitOperations.getShadowGitConfigWorkTree] Shadow git path does not exist: ${gitPath}`);
				return undefined;
			}
			const checkpointsDir = path.dirname(gitPath);
			const git = simpleGit(checkpointsDir);
			const worktreeConfig = await git.getConfig("core.worktree");
			return worktreeConfig.value || undefined;
		} catch (error) {
			console.error(`[GitOperations.getShadowGitConfigWorkTree] Failed to get shadow git config worktree from ${gitPath}:`, error);
			return undefined;
		}
	}

	/**
	 * Temporarily renames nested .git directories to avoid Git submodule issues.
	 * @param disable - If true, adds suffix to disable nested git repos. If false, removes suffix.
	 */
	public async renameNestedGitRepos(disable: boolean): Promise<void> {
		const suffix = GIT_DISABLED_SUFFIX;
		const pattern = disable ? "**/.git" : `**/.git${suffix}`;
		const operation = disable ? "Disabling" : "Enabling";
		console.log(`[GitOperations.renameNestedGitRepos] ${operation} nested git repos in ${this.cwd}`);

		try {
			// Use dynamic import for globby (ESM module)
			const { globby } = await import("globby");
			const gitPaths = await globby(pattern, {
				cwd: this.cwd,
				onlyDirectories: true,
				ignore: [".git"], // Ignore root level .git (relative to cwd)
				dot: true,
				markDirectories: false, // Don't append /
				suppressErrors: true, // Ignore errors like permission denied during search
				absolute: true, // Get absolute paths
			});

			if (gitPaths.length === 0) {
				console.log(`[GitOperations.renameNestedGitRepos] No nested repos found to ${disable ? 'disable' : 'enable'}.`);
				return;
			}

			console.log(`[GitOperations.renameNestedGitRepos] Found nested repos:`, gitPaths);

			for (const fullPath of gitPaths) {
				// Double-check it's not the root .git of the workspace itself
				if (path.normalize(fullPath) === path.normalize(path.join(this.cwd, ".git"))) {
					console.log(`[GitOperations.renameNestedGitRepos] Skipping rename for root .git: ${fullPath}`);
					continue;
				}

				let newPath: string;
				if (disable) {
					newPath = fullPath + suffix;
				} else {
					// Ensure it actually has the suffix before trying to remove it
					if (fullPath.endsWith(suffix)) {
						newPath = fullPath.slice(0, -suffix.length);
					} else {
						console.warn(`[GitOperations.renameNestedGitRepos] Skipping re-enable, path doesn't end with suffix: ${fullPath}`);
						continue; // Skip if it doesn't have the suffix (shouldn't happen with globby pattern)
					}
				}

				try {
					console.log(`[GitOperations.renameNestedGitRepos] Renaming ${fullPath} to ${newPath}`);
					await fs.rename(fullPath, newPath);
				} catch (renameError: any) {
					// Log specific errors, especially permission issues
					if (renameError.code === 'EPERM' || renameError.code === 'EACCES') {
						console.warn(`[GitOperations.renameNestedGitRepos] Permission error renaming ${fullPath}. Skipping. Error: ${renameError.message}`);
					} else if (renameError.code === 'ENOENT') {
						console.warn(`[GitOperations.renameNestedGitRepos] File not found during rename (possibly race condition?): ${fullPath}. Skipping. Error: ${renameError.message}`);
					} else {
						console.error(`[GitOperations.renameNestedGitRepos] Failed to rename ${fullPath}:`, renameError);
						// Decide if this should be fatal. For now, log and continue.
					}
				}
			}
		} catch (globError) {
			console.error(`[GitOperations.renameNestedGitRepos] Error finding nested .git directories:`, globError);
			// Decide if this is fatal.
		}
		console.log(`[GitOperations.renameNestedGitRepos] Finished ${operation} nested git repos.`);
	}

	/**
	 * Adds files to the shadow git repository staging area.
	 * Handles nested git repos and ignores errors during the 'git add' process.
	 * @param git - SimpleGit instance configured for the shadow git repo's parent directory.
	 * @returns Promise<{success: boolean}> Object indicating if the add operation likely succeeded.
	 */
	public async addCheckpointFiles(git: SimpleGit): Promise<{ success: boolean }> {
		const startTime = performance.now();
		let success = false;
		try {
			console.log("[GitOperations.addCheckpointFiles] Disabling nested git repos...");
			await this.renameNestedGitRepos(true); // Disable before adding

			console.log("[GitOperations.addCheckpointFiles] Running 'git add . --ignore-errors'...");
			// Use try-catch around the git add command itself
			try {
				// Add all files relative to the worktree (this.cwd).
				// The git instance is rooted in the shadow repo's parent, but knows the worktree.
				await git.add(['.', '--ignore-errors', '--verbose']); // Add verbose for more logging
				success = true; // Assume success if no error is thrown by simple-git
				console.log("[GitOperations.addCheckpointFiles] 'git add' command completed.");
			} catch (addError: any) {
				// simple-git might throw even with --ignore-errors depending on the error type
				console.warn(`[GitOperations.addCheckpointFiles] 'git add' command encountered an error (potentially ignored):`, addError.message);
				// We still consider it potentially successful if some files could be added.
				// A subsequent commit attempt will truly tell if anything was staged.
				success = true; // Let's assume partial success is possible
			}

			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[GitOperations.addCheckpointFiles] Add operation finished in ${durationMs}ms. Success: ${success}`);
			return { success };
		} catch (error) {
			// Catch errors from renameNestedGitRepos or other unexpected issues
			console.error("[GitOperations.addCheckpointFiles] Unexpected error during add process:", error);
			return { success: false };
		} finally {
			// IMPORTANT: Always re-enable nested repos
			console.log("[GitOperations.addCheckpointFiles] Re-enabling nested git repos...");
			await this.renameNestedGitRepos(false);
			console.log("[GitOperations.addCheckpointFiles] Nested git repos re-enabled.");
		}
	}
}