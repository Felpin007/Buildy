// src/services/checkpoint/CheckpointTracker.ts
import fs from "fs/promises";
import * as path from "path";
import simpleGit, { SimpleGit, StatusResult } from "simple-git"; // Import StatusResult
import * as vscode from "vscode";
// import { telemetryService } from "../../services/telemetry/TelemetryService"; // Assuming telemetry is not implemented yet
import { GitOperations } from "./CheckpointGitOperations";
import { getShadowGitPath, getWorkingDirectory, hashWorkingDir, getCheckpointsDirectory } from "./CheckpointUtils"; // Import getCheckpointsDirectory
import { fileExistsAtPath } from "../../utils/fs"; // Use the project's fs util

// Interface for diff results (can be moved to a shared types file later)
export interface DiffEntry {
	relativePath: string;
	absolutePath: string;
	before: string; // Content before change
	after: string;  // Content after change
}


/**
 * CheckpointTracker Class
 *
 * Manages checkpoints for a specific task using a shadow Git repository.
 */
class CheckpointTracker {
	private globalStoragePath: string;
	private taskId: string; // Unique ID for the task or session being tracked
	private cwd: string; // User's workspace root path
	private cwdHash: string; // Hash of the workspace path
	private gitOperations: GitOperations;
	private lastRetrievedShadowGitConfigWorkTree?: string; // Cache for worktree path

	/**
	 * Private constructor. Use the static `create` method to instantiate.
	 */
	private constructor(globalStoragePath: string, taskId: string, cwd: string, cwdHash: string) {
		this.globalStoragePath = globalStoragePath;
		this.taskId = taskId;
		this.cwd = cwd;
		this.cwdHash = cwdHash;
		this.gitOperations = new GitOperations(cwd); // Pass workspace CWD to GitOperations
		console.log(`[CheckpointTracker] Instantiated for task: ${taskId}, CWD: ${cwd}, Hash: ${cwdHash}`);
	}

	/**
	 * Asynchronously creates and initializes a CheckpointTracker instance.
	 */
	public static async create(taskId: string, globalStoragePath: string | undefined): Promise<CheckpointTracker | undefined> {
		// Implementation unchanged...
		if (!globalStoragePath) {
			throw new Error("Global storage path is required to create a checkpoint tracker");
		}
		try {
			console.log(`[CheckpointTracker.create] Attempting to create tracker for task ${taskId}`);
			const startTime = performance.now();

			const enableCheckpoints = vscode.workspace.getConfiguration("buildy").get<boolean>("enableCheckpoints") ?? true;
			if (!enableCheckpoints) {
				console.log("[CheckpointTracker.create] Checkpoints are disabled in settings.");
				return undefined;
			}

			try {
				await simpleGit().version();
				console.log("[CheckpointTracker.create] Git installation verified.");
			} catch (error) {
				console.error("[CheckpointTracker.create] Git check failed:", error);
				vscode.window.showErrorMessage("Git must be installed and accessible in your system's PATH to use the checkpoint feature.");
				throw new Error("Git is not installed or accessible.");
			}

			const workingDir = await getWorkingDirectory();
			console.log(`[CheckpointTracker.create] Working directory validated: ${workingDir}`);
			const cwdHash = hashWorkingDir(workingDir);
			console.log(`[CheckpointTracker.create] Workspace hash: ${cwdHash}`);

			const newTracker = new CheckpointTracker(globalStoragePath, taskId, workingDir, cwdHash);

			const gitPath = await getShadowGitPath(newTracker.globalStoragePath, newTracker.cwdHash);
			await newTracker.gitOperations.initShadowGit(gitPath, workingDir, taskId);
			console.log(`[CheckpointTracker.create] Shadow Git initialized/verified at ${gitPath}`);

			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[CheckpointTracker.create] Tracker created successfully for task ${taskId} in ${durationMs}ms`);

			return newTracker;
		} catch (error) {
			console.error(`[CheckpointTracker.create] Failed to create CheckpointTracker for task ${taskId}:`, error);
			vscode.window.showErrorMessage(`Failed to initialize checkpoints: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Helper method to clean commit hashes.
	 */
	private cleanCommitHash(hash: string | undefined): string | undefined {
		// Implementation unchanged...
		if (!hash) return undefined;
		return hash.startsWith("HEAD ") ? hash.slice(5) : hash;
	}

	/**
	 * Gets the SimpleGit instance configured for the shadow repository.
	 */
	private async getGitInstance(): Promise<SimpleGit> {
		// Implementation unchanged...
		const gitPath = await getShadowGitPath(this.globalStoragePath, this.cwdHash);
		const checkpointsDir = path.dirname(gitPath);
		return simpleGit(checkpointsDir);
	}

    /**
     * Stages all changes from the configured working directory into the shadow repository's index.
     * This uses `git add .` and might stage unrelated changes if not used carefully.
     */
    public async stageWorkspaceChanges(): Promise<{ success: boolean; error?: any }> {
        // Implementation unchanged...
        try {
            console.log(`[CheckpointTracker.stageWorkspaceChanges] Staging changes for task ${this.taskId}`);
            const git = await this.getGitInstance();
            const result = await this.gitOperations.addCheckpointFiles(git); // This likely runs 'git add .'
            console.log(`[CheckpointTracker.stageWorkspaceChanges] Staging complete. Success: ${result.success}`);
            return result;
        } catch (error) {
            console.error(`[CheckpointTracker.stageWorkspaceChanges] Failed to stage changes for task ${this.taskId}:`, error);
            vscode.window.showErrorMessage(`Failed to stage changes for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        }
    }

    // --- MODIFICATION START: New method to stage specific paths ---
    /**
     * Stages specific file paths from the working directory into the shadow repository's index.
     * @param relativePaths An array of workspace-relative paths to stage.
     * @returns Promise resolving to an object indicating success or failure.
     */
    public async stageSpecificPaths(relativePaths: string[]): Promise<{ success: boolean; error?: any }> {
        if (!relativePaths || relativePaths.length === 0) {
            console.log("[CheckpointTracker.stageSpecificPaths] No paths provided to stage.");
            return { success: true }; // Nothing to do, considered success
        }
        try {
            console.log(`[CheckpointTracker.stageSpecificPaths] Staging ${relativePaths.length} specific paths for task ${this.taskId}:`, relativePaths);
            const git = await this.getGitInstance();

            // Disable nested repos before add to avoid issues
			await this.gitOperations.renameNestedGitRepos(true);

            // Use git add with specific paths
            // Note: simple-git's add() takes an array of paths
            await git.add(relativePaths);

            console.log(`[CheckpointTracker.stageSpecificPaths] Staging complete.`);
            return { success: true };
        } catch (error) {
            console.error(`[CheckpointTracker.stageSpecificPaths] Failed to stage specific paths for task ${this.taskId}:`, error);
            vscode.window.showErrorMessage(`Failed to stage specific files for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        } finally {
            // IMPORTANT: Always re-enable nested repos
			await this.gitOperations.renameNestedGitRepos(false);
        }
    }
    // --- MODIFICATION END ---

	/**
	 * Creates a new checkpoint commit in the shadow git repository using the currently staged changes.
	 */
	public async commit(): Promise<string | undefined> {
		// Implementation unchanged...
		try {
			console.log(`[CheckpointTracker.commit] Committing staged changes for task ${this.taskId}`);
			const startTime = performance.now();
			const git = await this.getGitInstance();

			const commitMessage = `checkpoint-${this.taskId}-${Date.now()}`;
			console.log(`[CheckpointTracker.commit] Committing with message: ${commitMessage}`);

			const result = await git.commit(commitMessage, {
				"--allow-empty": null,
				"--no-verify": null,
			});

			const commitHash = result.commit;
			if (!commitHash) {
				const log = await git.log(['-n', '1', '--format=%H']);
				const latestHash = log.latest?.hash;
				if (!latestHash) {
					throw new Error("Commit was created, but failed to retrieve the commit hash.");
				}
				console.warn(`[CheckpointTracker.commit] Commit result didn't contain hash, retrieved latest: ${latestHash}`);
				return latestHash;
			}

			console.log(`[CheckpointTracker.commit] Checkpoint commit created: ${commitHash}`);
			const durationMs = Math.round(performance.now() - startTime);
			return commitHash;
		} catch (error: any) {
            if (error.message && error.message.includes('nothing to commit')) {
                 console.log(`[CheckpointTracker.commit] Nothing to commit for task ${this.taskId}. Returning latest hash.`);
                 try {
                     const git = await this.getGitInstance();
                     const log = await git.log(['-n', '1', '--format=%H']);
                     return log.latest?.hash;
                 } catch (logError) {
                     console.error(`[CheckpointTracker.commit] Failed to get latest hash after 'nothing to commit' error:`, logError);
                     vscode.window.showErrorMessage(`Failed to get current checkpoint state: ${logError instanceof Error ? logError.message : String(logError)}`);
                     return undefined;
                 }
            } else {
                console.error(`[CheckpointTracker.commit] Failed to create checkpoint for task ${this.taskId}:`, error);
                vscode.window.showErrorMessage(`Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`);
                return undefined;
            }
		}
	}

    /**
     * Gets the status of the shadow repository. Useful for forcing a refresh.
     */
    public async status(): Promise<StatusResult> {
        // Implementation unchanged...
        try {
            console.log(`[CheckpointTracker.status] Getting status for task ${this.taskId}`);
            const git = await this.getGitInstance();
            const statusResult = await git.status();
            console.log(`[CheckpointTracker.status] Status retrieved.`);
            return statusResult;
        } catch (error) {
             console.error(`[CheckpointTracker.status] Failed to get status for task ${this.taskId}:`, error);
             throw error;
        }
    }

	/**
	 * Retrieves the configured worktree path from the shadow git repository.
	 */
	public async getShadowGitConfigWorkTree(): Promise<string | undefined> {
		// Implementation unchanged...
		if (this.lastRetrievedShadowGitConfigWorkTree) {
			return this.lastRetrievedShadowGitConfigWorkTree;
		}
		try {
			const gitPath = await getShadowGitPath(this.globalStoragePath, this.cwdHash);
			this.lastRetrievedShadowGitConfigWorkTree = await this.gitOperations.getShadowGitConfigWorkTree(gitPath);
			return this.lastRetrievedShadowGitConfigWorkTree;
		} catch (error) {
			console.error("[CheckpointTracker.getShadowGitConfigWorkTree] Error retrieving worktree:", error);
			return undefined;
		}
	}

	/**
	 * Resets the user's workspace files to the state of a specific checkpoint commit.
	 */
	public async resetHead(commitHash: string): Promise<void> {
		// Implementation unchanged...
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			throw new Error("Invalid commit hash provided for reset.");
		}

		console.log(`[CheckpointTracker.resetHead] Resetting workspace to checkpoint: ${cleanHash}`);
		const startTime = performance.now();

		try {
			const git = await this.getGitInstance();

            let rootCommitHash: string | undefined;
            try {
                const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
                rootCommitHash = log.latest?.hash;
                console.log(`[CheckpointTracker.resetHead] Found root commit hash: ${rootCommitHash}`);
            } catch (logError) {
                console.error("[CheckpointTracker.resetHead] Failed to get root commit hash:", logError);
            }

			await this.gitOperations.renameNestedGitRepos(true);

            console.log(`[CheckpointTracker.resetHead] Cleaning worktree: ${this.cwd}`);
            await git.clean('fd');
            console.log(`[CheckpointTracker.resetHead] Worktree clean complete.`);

			await git.reset(["--hard", cleanHash]);
			console.log(`[CheckpointTracker.resetHead] Shadow repo reset to ${cleanHash}.`);

            if (rootCommitHash && cleanHash === rootCommitHash) {
                console.log(`[CheckpointTracker.resetHead] Target is root commit. Skipping checkout as clean already handled working directory.`);
            } else {
                if (!rootCommitHash) {
                    console.warn(`[CheckpointTracker.resetHead] Could not verify root commit hash. Proceeding with checkout.`);
                }
                console.log(`[CheckpointTracker.resetHead] Checking out files to worktree: ${this.cwd}`);
                await git.checkout(['-f', '--', '.']);
                console.log(`[CheckpointTracker.resetHead] Checkout to worktree complete.`);
            }

			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[CheckpointTracker.resetHead] Workspace successfully reset to checkpoint ${cleanHash} in ${durationMs}ms`);

		} catch (error) {
		          const ignoredErrorSubstring = "pathspec '.' did not match any file(s) known to git";
		          const isIgnoredError = error instanceof Error && error.message.includes(ignoredErrorSubstring);

		          if (isIgnoredError) {
		              // Log the ignored error but don't show a user-facing notification here.
		              console.warn(`[CheckpointTracker.resetHead] Encountered known (ignorable) error during reset: ${error.message}`);
		          } else {
		              // Show notification for unexpected errors
		              console.error(`[CheckpointTracker.resetHead] Failed to reset to checkpoint ${cleanHash}:`, error);
		              vscode.window.showErrorMessage(`Failed to reset to checkpoint: ${error instanceof Error ? error.message : String(error)}`);
		          }
		          // Always re-throw the error so the calling command can handle it appropriately
		          // (e.g., the undo command knows to treat the ignored error as success).
			throw error;
		} finally {
			await this.gitOperations.renameNestedGitRepos(false);
		}
	}

	/**
	 * Gets the differences between two checkpoint states or a checkpoint and the working directory.
	 */
	public async getDiffSet(lhsHash?: string, rhsHash?: string): Promise<DiffEntry[]> {
		const cleanLhs = this.cleanCommitHash(lhsHash);
		const cleanRhs = this.cleanCommitHash(rhsHash);

		console.log(`[CheckpointTracker.getDiffSet] Getting diff: ${cleanLhs || 'initial'} -> ${cleanRhs || 'working dir'}`);
		const startTime = performance.now();
        let stagedForDiff = false; // Flag to track if we staged for this specific operation

		try {
			const git = await this.getGitInstance();
			let diffOutput: string;
			let diffCommandArgs: string[];

			// --- MODIFICATION START: Revert to staging + diff-tree for working dir compare ---
			if (!cleanRhs) {
				// Comparing commit (lhsHash) to Working Directory
				console.log(`[CheckpointTracker.getDiffSet] Comparing commit ${cleanLhs} to working directory using diff-tree after staging.`);
				if (!cleanLhs) throw new Error("Cannot diff initial state against working directory directly in this revised logic.");

                // Stage changes to compare index against commit
                console.log("[CheckpointTracker.getDiffSet] Staging working dir changes for diff...");
                await this.stageWorkspaceChanges(); // Use the method that runs 'git add .'
                stagedForDiff = true;

				// Diff between commit and index (which now reflects working dir)
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', cleanLhs];
				diffOutput = await git.raw(diffCommandArgs);
				console.log(`[CheckpointTracker.getDiffSet] Raw diff output (vs staged working dir):\n${diffOutput}`);

			} else {
				// Comparing two commits (lhsHash to rhsHash)
				console.log(`[CheckpointTracker.getDiffSet] Comparing commit ${cleanLhs} to commit ${cleanRhs} using 'git diff-tree'.`);
				let baseCommit = cleanLhs;
				if (!baseCommit) {
					const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
					baseCommit = log.latest?.hash;
					if (!baseCommit) throw new Error("Could not determine root commit for diff.");
					console.log(`[CheckpointTracker.getDiffSet] Using root commit as base: ${baseCommit}`);
				}
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', baseCommit, cleanRhs];
				diffOutput = await git.raw(diffCommandArgs);
				console.log(`[CheckpointTracker.getDiffSet] Raw diff output (commit-to-commit):\n${diffOutput}`);
			}
            // --- MODIFICATION END ---

			const changedFiles: { status: string, path: string }[] = diffOutput
				.split('\n')
				.filter(line => line.trim() !== '')
				.map(line => {
					const parts = line.split(/\s+/);
					const status = parts[0];
					const filePath = status.startsWith('R') ? parts[2] : parts[1];
					return { status: status.trim(), path: filePath.trim() };
				});

			console.log(`[CheckpointTracker.getDiffSet] Found ${changedFiles.length} changed files.`);

            // Reset index BEFORE getting content if staged
            if (stagedForDiff) {
                console.log("[CheckpointTracker.getDiffSet] Resetting index before retrieving file content...");
                await git.reset();
                stagedForDiff = false; // Mark as reset
                console.log("[CheckpointTracker.getDiffSet] Index reset complete.");
            }

			const diffSetResult: DiffEntry[] = [];

			for (const file of changedFiles) {
				const relativePath = file.path;
				const absolutePath = path.join(this.cwd, relativePath);
				let beforeContent = "";
				let afterContent = "";

				// Get 'before' content using cat-file
				if (file.status !== 'A' && !file.status.startsWith('R') && cleanLhs) {
					try {
						console.log(`[CheckpointTracker.getDiffSet] Getting 'before' content for ${relativePath} using cat-file from ${cleanLhs}`);
						beforeContent = await git.raw(['cat-file', 'blob', `${cleanLhs}:${relativePath}`]);
					} catch (e: any) {
						console.warn(`[CheckpointTracker.getDiffSet] Error running 'git cat-file blob ${cleanLhs}:${relativePath}':`, e.message || e);
					}
				} else if (file.status.startsWith('R') && cleanLhs) {
					console.warn(`[CheckpointTracker.getDiffSet] Handling rename for ${relativePath}, 'before' content might be inaccurate (showing empty).`);
				}


				// Get 'after' content
				if (file.status !== 'D') {
					if (cleanRhs) { // Comparing two commits
						try {
							console.log(`[CheckpointTracker.getDiffSet] Getting 'after' content for ${relativePath} using cat-file from ${cleanRhs}`);
							afterContent = await git.raw(['cat-file', 'blob', `${cleanRhs}:${relativePath}`]);
						} catch (e: any) {
							console.warn(`[CheckpointTracker.getDiffSet] Error running 'git cat-file blob ${cleanRhs}:${relativePath}':`, e.message || e);
						}
					} else { // Comparing to working directory
						try {
                            console.log(`[CheckpointTracker.getDiffSet] Getting 'after' content for ${relativePath} using fs.readFile`);
							afterContent = await fs.readFile(absolutePath, "utf8");
						} catch (e: any) {
							if (e.code !== 'ENOENT') { // Ignore if file not found
								console.warn(`[CheckpointTracker.getDiffSet] Error reading 'after' content for ${relativePath} from working dir:`, e.message);
							}
						}
					}
				}

				diffSetResult.push({
					relativePath: relativePath,
					absolutePath: absolutePath,
					before: beforeContent,
					after: afterContent,
				});
			}

			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[CheckpointTracker.getDiffSet] Diff generation completed in ${durationMs}ms. Found ${diffSetResult.length} differences.`);

			return diffSetResult;

		} catch (error) {
			console.error(`[CheckpointTracker.getDiffSet] Failed to get diff set:`, error);
			vscode.window.showErrorMessage(`Failed to calculate differences: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		} finally {
            // Ensure index is reset if staging occurred and wasn't reset above
            if (stagedForDiff) { // If staging happened but reset failed or didn't run
                try {
                    const git = await this.getGitInstance();
                    console.log("[CheckpointTracker.getDiffSet] FINALLY: Resetting index (safety check)...");
                    await git.reset();
                    console.log("[CheckpointTracker.getDiffSet] FINALLY: Index reset complete.");
                } catch (resetError) {
                    console.error("[CheckpointTracker.getDiffSet] FINALLY: Error resetting index:", resetError);
                }
            }
        }
	}

	/**
	 * Gets the count of files changed between two states.
	 */
	public async getDiffCount(lhsHash?: string, rhsHash?: string): Promise<number> {
        // This method might need adjustment depending on the final diff strategy
        try {
            const diffSet = await this.getDiffSet(lhsHash, rhsHash);
            return diffSet.length;
        } catch (error) {
             console.error(`[CheckpointTracker.getDiffCount] Error getting diff count:`, error);
             return 0; // Return 0 or rethrow? Returning 0 might be safer UI-wise.
        }
	}

	/**
	 * Retrieves the content of a specific file at a given commit hash.
	 * Returns an empty string if the file does not exist at that commit.
	 * @param commitHash The commit hash (checkpoint) to retrieve the file from.
	 * @param relativePath The workspace-relative path of the file.
	 * @returns The file content as a string, or an empty string if not found.
	 */
	public async getFileContentAtCommit(commitHash: string | undefined, relativePath: string): Promise<string> {
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			console.warn(`[CheckpointTracker.getFileContentAtCommit] Invalid or missing commit hash provided.`);
			return ""; // Cannot get content without a valid hash
		}
		// Normalize path separators for git command and remove potential leading ./
		const gitPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		console.log(`[CheckpointTracker.getFileContentAtCommit] Getting content for '${gitPath}' at commit ${cleanHash}`);
		try {
			const git = await this.getGitInstance();
			const content = await git.raw(['cat-file', 'blob', `${cleanHash}:${gitPath}`]);
			console.log(`[CheckpointTracker.getFileContentAtCommit] Content retrieved successfully for '${gitPath}' at ${cleanHash}.`);
			return content;
		} catch (error: any) {
			// Common error: path does not exist in the commit
			if (error.message && (error.message.includes('fatal: path') && error.message.includes('does not exist in'))) {
				console.log(`[CheckpointTracker.getFileContentAtCommit] File '${gitPath}' not found in commit ${cleanHash}. Returning empty string.`);
			} else {
				// Log the full error for unexpected issues
				console.error(`[CheckpointTracker.getFileContentAtCommit] Unexpected error running 'git cat-file blob ${cleanHash}:${gitPath}':`, error);
			}
			return ""; // Return empty string on error or if file not found
		}
	}

	/**
	 * Static method to delete the checkpoint data for a specific task.
	 */
	/**
	 * Static method to delete the checkpoint data for a specific task.
	 */
	public static async deleteCheckpoints(taskId: string, globalStoragePath: string | undefined, cwdHash: string | undefined): Promise<void> {
		// Implementation unchanged...
		if (!globalStoragePath || !cwdHash) {
			console.warn(`[CheckpointTracker.deleteCheckpoints] Missing globalStoragePath or cwdHash for task ${taskId}. Cannot delete.`);
			return;
		}
		console.log(`[CheckpointTracker.deleteCheckpoints] Deleting checkpoints for task ${taskId} (CWD Hash: ${cwdHash})`);
		try {
			const checkpointsDir = await getCheckpointsDirectory(globalStoragePath, cwdHash);

			if (await fileExistsAtPath(checkpointsDir)) {
				console.log(`[CheckpointTracker.deleteCheckpoints] Removing directory: ${checkpointsDir}`);
				await fs.rm(checkpointsDir, { recursive: true, force: true });
				console.log(`[CheckpointTracker.deleteCheckpoints] Successfully deleted checkpoints for task ${taskId}.`);
			} else {
				console.log(`[CheckpointTracker.deleteCheckpoints] Checkpoints directory not found for task ${taskId}. Nothing to delete.`);
			}
		} catch (error) {
			console.error(`[CheckpointTracker.deleteCheckpoints] Failed to delete checkpoints for task ${taskId}:`, error);
			vscode.window.showErrorMessage(`Failed to delete checkpoint data for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

}

export default CheckpointTracker;