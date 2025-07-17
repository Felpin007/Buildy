import fs from "fs/promises";
import * as path from "path";
import simpleGit, { SimpleGit, StatusResult } from "simple-git"; 
import * as vscode from "vscode";
import { GitOperations } from "./CheckpointGitOperations";
import { getShadowGitPath, getWorkingDirectory, hashWorkingDir, getCheckpointsDirectory } from "./CheckpointUtils"; 
import { fileExistsAtPath } from "../../utils/fs"; 

export interface DiffEntry {
	relativePath: string;
	absolutePath: string;
	before: string; 
	after: string;  
}

class CheckpointTracker {
	private globalStoragePath: string;
	private taskId: string; 
	private cwd: string; 
	private cwdHash: string; 
	private gitOperations: GitOperations;
	private lastRetrievedShadowGitConfigWorkTree?: string; 

	private constructor(globalStoragePath: string, taskId: string, cwd: string, cwdHash: string) {
		this.globalStoragePath = globalStoragePath;
		this.taskId = taskId;
		this.cwd = cwd;
		this.cwdHash = cwdHash;
		this.gitOperations = new GitOperations(cwd); 
	}

	public static async create(taskId: string, globalStoragePath: string | undefined): Promise<CheckpointTracker | undefined> {
		if (!globalStoragePath) {
			throw new Error("Caminho de armazenamento global é necessário para criar um rastreador de checkpoints");
		}
		try {
			const enableCheckpoints = vscode.workspace.getConfiguration("buildy").get<boolean>("enableCheckpoints") ?? true;
			if (!enableCheckpoints) {
				return undefined;
			}
			try {
				await simpleGit().version();
			} catch (error) {
				vscode.window.showErrorMessage("Git must be installed and accessible in your system's PATH to use the checkpoint feature.");
				throw new Error("Git não está instalado ou acessível.");
			}
			const workingDir = await getWorkingDirectory();
			const cwdHash = hashWorkingDir(workingDir);
			const newTracker = new CheckpointTracker(globalStoragePath, taskId, workingDir, cwdHash);
			const gitPath = await getShadowGitPath(newTracker.globalStoragePath, newTracker.cwdHash);
			await newTracker.gitOperations.initShadowGit(gitPath, workingDir, taskId);
			return newTracker;
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to initialize checkpoints: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	private cleanCommitHash(hash: string | undefined): string | undefined {
		if (!hash) return undefined;
		return hash.startsWith("HEAD ") ? hash.slice(5) : hash;
	}

	private async getGitInstance(): Promise<SimpleGit> {
		const gitPath = await getShadowGitPath(this.globalStoragePath, this.cwdHash);
		const checkpointsDir = path.dirname(gitPath);
		return simpleGit(checkpointsDir);
	}

    public async stageWorkspaceChanges(): Promise<{ success: boolean; error?: any }> {
        try {
            const git = await this.getGitInstance();
            const result = await this.gitOperations.addCheckpointFiles(git); 
            return result;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stage changes for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        }
    }

    public async stageSpecificPaths(relativePaths: string[]): Promise<{ success: boolean; error?: any }> {
        if (!relativePaths || relativePaths.length === 0) {
            return { success: true }; 
        }
        try {
            const git = await this.getGitInstance();
			await this.gitOperations.renameNestedGitRepos(true);
            await git.add(relativePaths);
            return { success: true };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stage specific files for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        } finally {
			await this.gitOperations.renameNestedGitRepos(false);
        }
    }

	public async commit(): Promise<string | undefined> {
		try {
			const git = await this.getGitInstance();
			const commitMessage = `checkpoint-${this.taskId}-${Date.now()}`;
			const result = await git.commit(commitMessage, {
				"--allow-empty": null,
				"--no-verify": null,
			});
			const commitHash = result.commit;
			if (!commitHash) {
				const log = await git.log(['-n', '1', '--format=%H']);
				const latestHash = log.latest?.hash;
				if (!latestHash) {
					throw new Error("Commit foi criado, mas falhou ao recuperar o hash do commit.");
				}
				return latestHash;
			}
			return commitHash;
		} catch (error: any) {
            if (error.message && error.message.includes('nothing to commit')) {
                 try {
                     const git = await this.getGitInstance();
                     const log = await git.log(['-n', '1', '--format=%H']);
                     return log.latest?.hash;
                 } catch (logError) {
                     vscode.window.showErrorMessage(`Failed to get current checkpoint state: ${logError instanceof Error ? logError.message : String(logError)}`);
                     return undefined;
                 }
            } else {
                vscode.window.showErrorMessage(`Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`);
                return undefined;
            }
		}
	}

    public async status(): Promise<StatusResult> {
        try {
            const git = await this.getGitInstance();
            const statusResult = await git.status();
            return statusResult;
        } catch (error) {
             throw error;
        }
    }

	public async getShadowGitConfigWorkTree(): Promise<string | undefined> {
		if (this.lastRetrievedShadowGitConfigWorkTree) {
			return this.lastRetrievedShadowGitConfigWorkTree;
		}
		try {
			const gitPath = await getShadowGitPath(this.globalStoragePath, this.cwdHash);
			this.lastRetrievedShadowGitConfigWorkTree = await this.gitOperations.getShadowGitConfigWorkTree(gitPath);
			return this.lastRetrievedShadowGitConfigWorkTree;
		} catch (error) {
			return undefined;
		}
	}

	public async resetHead(commitHash: string): Promise<void> {
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			throw new Error("Hash de commit inválido fornecido para reset.");
		}
		try {
			const git = await this.getGitInstance();
            let rootCommitHash: string | undefined;
            try {
                const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
                rootCommitHash = log.latest?.hash;
            } catch (logError) {
                // Ignore error if log fails
            }

			await this.gitOperations.renameNestedGitRepos(true);
            await git.clean('fd');
			await git.reset(["--hard", cleanHash]);

            if (rootCommitHash && cleanHash === rootCommitHash) {
                // Target is root commit, cleaning is enough.
            } else {
                if (!rootCommitHash) {
                    // Could not verify root commit, proceed with checkout anyway
                }
                await git.checkout(['-f', '--', '.']);
            }
		} catch (error) {
		    const ignoredErrorSubstring = "pathspec '.' did not match any file(s) known to git";
		    const isIgnoredError = error instanceof Error && error.message.includes(ignoredErrorSubstring);
		    if (!isIgnoredError) {
		        vscode.window.showErrorMessage(`Falha ao resetar para o checkpoint: ${error instanceof Error ? error.message : String(error)}`);
		        throw error;
		    }
		} finally {
			await this.gitOperations.renameNestedGitRepos(false);
		}
	}

	public async getDiffSet(lhsHash?: string, rhsHash?: string): Promise<DiffEntry[]> {
		const cleanLhs = this.cleanCommitHash(lhsHash);
		const cleanRhs = this.cleanCommitHash(rhsHash);
        let stagedForDiff = false; 

		try {
			const git = await this.getGitInstance();
			let diffOutput: string;
			let diffCommandArgs: string[];

			if (!cleanRhs) {
				if (!cleanLhs) throw new Error("Não é possível comparar estado inicial diretamente com diretório de trabalho nesta lógica revisada.");
                await this.stageWorkspaceChanges(); 
                stagedForDiff = true;
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', cleanLhs];
				diffOutput = await git.raw(diffCommandArgs);
			} else {
				let baseCommit = cleanLhs;
				if (!baseCommit) {
					const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
					baseCommit = log.latest?.hash;
					if (!baseCommit) throw new Error("Não foi possível determinar o commit raiz para diff.");
				}
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', baseCommit, cleanRhs];
				diffOutput = await git.raw(diffCommandArgs);
			}

			const changedFiles: { status: string, path: string }[] = diffOutput
				.split('\n')
				.filter(line => line.trim() !== '')
				.map(line => {
					const parts = line.split(/\s+/);
					const status = parts[0];
					const filePath = status.startsWith('R') ? parts[2] : parts[1];
					return { status: status.trim(), path: filePath.trim() };
				});

            if (stagedForDiff) {
                await git.reset();
                stagedForDiff = false; 
            }

			const diffSetResult: DiffEntry[] = [];
			for (const file of changedFiles) {
				const relativePath = file.path;
				const absolutePath = path.join(this.cwd, relativePath);
				let beforeContent = "";
				let afterContent = "";

				if (file.status !== 'A' && !file.status.startsWith('R') && cleanLhs) {
					try {
						beforeContent = await git.raw(['cat-file', 'blob', `${cleanLhs}:${relativePath}`]);
					} catch (e: any) {
						// Ignore error if file didn't exist before
					}
				}

				if (file.status !== 'D') {
					if (cleanRhs) { 
						try {
							afterContent = await git.raw(['cat-file', 'blob', `${cleanRhs}:${relativePath}`]);
						} catch (e: any) {
							// Ignore error if file doesn't exist in target commit
						}
					} else { 
						try {
							afterContent = await fs.readFile(absolutePath, "utf8");
						} catch (e: any) {
							if (e.code !== 'ENOENT') { 
								// Ignore ENOENT, but log other read errors
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

			return diffSetResult;
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to calculate differences: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		} finally {
            if (stagedForDiff) { 
                try {
                    const git = await this.getGitInstance();
                    await git.reset();
                } catch (resetError) {
                    // Log internally if needed, but don't bother user
                }
            }
        }
	}

	public async getDiffCount(lhsHash?: string, rhsHash?: string): Promise<number> {
        try {
            const diffSet = await this.getDiffSet(lhsHash, rhsHash);
            return diffSet.length;
        } catch (error) {
             return 0; 
        }
	}

	public async getFileContentAtCommit(commitHash: string | undefined, relativePath: string): Promise<string> {
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			return ""; 
		}
		const gitPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		try {
			const git = await this.getGitInstance();
			const content = await git.raw(['cat-file', 'blob', `${cleanHash}:${gitPath}`]);
			return content;
		} catch (error: any) {
			// File likely didn't exist in that commit, which is a valid scenario.
			return ""; 
		}
	}

	public static async deleteCheckpoints(taskId: string, globalStoragePath: string | undefined, cwdHash: string | undefined): Promise<void> {
		if (!globalStoragePath || !cwdHash) {
			return;
		}
		try {
			const checkpointsDir = await getCheckpointsDirectory(globalStoragePath, cwdHash);
			if (await fileExistsAtPath(checkpointsDir)) {
				await fs.rm(checkpointsDir, { recursive: true, force: true });
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Falha ao excluir dados do checkpoint para a tarefa ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
export default CheckpointTracker;