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
		console.log(`[CheckpointTracker] Instanciado para tarefa: ${taskId}, CWD: ${cwd}, Hash: ${cwdHash}`);
	}
	public static async create(taskId: string, globalStoragePath: string | undefined): Promise<CheckpointTracker | undefined> {
		if (!globalStoragePath) {
			throw new Error("Caminho de armazenamento global é necessário para criar um rastreador de checkpoints");
		}
		try {
			console.log(`[CheckpointTracker.create] Tentando criar rastreador para tarefa ${taskId}`);
			const startTime = performance.now();
			const enableCheckpoints = vscode.workspace.getConfiguration("buildy").get<boolean>("enableCheckpoints") ?? true;
			if (!enableCheckpoints) {
				console.log("[CheckpointTracker.create] Checkpoints estão desativados nas configurações.");
				return undefined;
			}
			try {
				await simpleGit().version();
				console.log("[CheckpointTracker.create] Instalação do Git verificada.");
			} catch (error) {
				console.error("[CheckpointTracker.create] Verificação do Git falhou:", error);
				vscode.window.showErrorMessage("Git must be installed and accessible in your system's PATH to use the checkpoint feature.");
				throw new Error("Git não está instalado ou acessível.");
			}
			const workingDir = await getWorkingDirectory();
			console.log(`[CheckpointTracker.create] Diretório de trabalho validado: ${workingDir}`);
			const cwdHash = hashWorkingDir(workingDir);
			console.log(`[CheckpointTracker.create] Hash do workspace: ${cwdHash}`);
			const newTracker = new CheckpointTracker(globalStoragePath, taskId, workingDir, cwdHash);
			const gitPath = await getShadowGitPath(newTracker.globalStoragePath, newTracker.cwdHash);
			await newTracker.gitOperations.initShadowGit(gitPath, workingDir, taskId);
			console.log(`[CheckpointTracker.create] Shadow Git inicializado/verificado em ${gitPath}`);
			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[CheckpointTracker.create] Rastreador criado com sucesso para tarefa ${taskId} em ${durationMs}ms`);
			return newTracker;
		} catch (error) {
			console.error(`[CheckpointTracker.create] Falha ao criar CheckpointTracker para tarefa ${taskId}:`, error);
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
            console.log(`[CheckpointTracker.stageWorkspaceChanges] Preparando alterações para tarefa ${this.taskId}`);
            const git = await this.getGitInstance();
            const result = await this.gitOperations.addCheckpointFiles(git); 
            console.log(`[CheckpointTracker.stageWorkspaceChanges] Preparação completa. Sucesso: ${result.success}`);
            return result;
        } catch (error) {
            console.error(`[CheckpointTracker.stageWorkspaceChanges] Falha ao preparar alterações para tarefa ${this.taskId}:`, error);
            vscode.window.showErrorMessage(`Failed to stage changes for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        }
    }
    public async stageSpecificPaths(relativePaths: string[]): Promise<{ success: boolean; error?: any }> {
        if (!relativePaths || relativePaths.length === 0) {
            console.log("[CheckpointTracker.stageSpecificPaths] Nenhum caminho fornecido para preparar.");
            return { success: true }; 
        }
        try {
            console.log(`[CheckpointTracker.stageSpecificPaths] Preparando ${relativePaths.length} caminhos específicos para tarefa ${this.taskId}:`, relativePaths);
            const git = await this.getGitInstance();
			await this.gitOperations.renameNestedGitRepos(true);
            await git.add(relativePaths);
            console.log(`[CheckpointTracker.stageSpecificPaths] Preparação completa.`);
            return { success: true };
        } catch (error) {
            console.error(`[CheckpointTracker.stageSpecificPaths] Falha ao preparar caminhos específicos para tarefa ${this.taskId}:`, error);
            vscode.window.showErrorMessage(`Failed to stage specific files for checkpoint: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error };
        } finally {
			await this.gitOperations.renameNestedGitRepos(false);
        }
    }
	public async commit(): Promise<string | undefined> {
		try {
			console.log(`[CheckpointTracker.commit] Commitando alterações preparadas para tarefa ${this.taskId}`);
			const startTime = performance.now();
			const git = await this.getGitInstance();
			const commitMessage = `checkpoint-${this.taskId}-${Date.now()}`;
			console.log(`[CheckpointTracker.commit] Commitando com mensagem: ${commitMessage}`);
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
				console.warn(`[CheckpointTracker.commit] Resultado do commit não continha hash, recuperado último: ${latestHash}`);
				return latestHash;
			}
			console.log(`[CheckpointTracker.commit] Commit de checkpoint criado: ${commitHash}`);
			const durationMs = Math.round(performance.now() - startTime);
			return commitHash;
		} catch (error: any) {
            if (error.message && error.message.includes('nothing to commit')) {
                 console.log(`[CheckpointTracker.commit] Nada para commitar para tarefa ${this.taskId}. Retornando último hash.`);
                 try {
                     const git = await this.getGitInstance();
                     const log = await git.log(['-n', '1', '--format=%H']);
                     return log.latest?.hash;
                 } catch (logError) {
                     console.error(`[CheckpointTracker.commit] Falha ao obter último hash após erro 'nada para commitar':`, logError);
                     vscode.window.showErrorMessage(`Failed to get current checkpoint state: ${logError instanceof Error ? logError.message : String(logError)}`);
                     return undefined;
                 }
            } else {
                console.error(`[CheckpointTracker.commit] Falha ao criar checkpoint para tarefa ${this.taskId}:`, error);
                vscode.window.showErrorMessage(`Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`);
                return undefined;
            }
		}
	}
    public async status(): Promise<StatusResult> {
        try {
            console.log(`[CheckpointTracker.status] Obtendo status para tarefa ${this.taskId}`);
            const git = await this.getGitInstance();
            const statusResult = await git.status();
            console.log(`[CheckpointTracker.status] Status obtido.`);
            return statusResult;
        } catch (error) {
             console.error(`[CheckpointTracker.status] Falha ao obter status para tarefa ${this.taskId}:`, error);
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
			console.error("[CheckpointTracker.getShadowGitConfigWorkTree] Erro ao recuperar worktree:", error);
			return undefined;
		}
	}
	public async resetHead(commitHash: string): Promise<void> {
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			throw new Error("Hash de commit inválido fornecido para reset.");
		}
		console.log(`[CheckpointTracker.resetHead] Resetando workspace para checkpoint: ${cleanHash}`);
		const startTime = performance.now();
		try {
			const git = await this.getGitInstance();
            let rootCommitHash: string | undefined;
            try {
                const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
                rootCommitHash = log.latest?.hash;
                console.log(`[CheckpointTracker.resetHead] Hash do commit raiz encontrado: ${rootCommitHash}`);
            } catch (logError) {
                console.error("[CheckpointTracker.resetHead] Falha ao obter hash do commit raiz:", logError);
            }
			await this.gitOperations.renameNestedGitRepos(true);
            console.log(`[CheckpointTracker.resetHead] Limpando worktree: ${this.cwd}`);
            await git.clean('fd');
            console.log(`[CheckpointTracker.resetHead] Limpeza do worktree completa.`);
			await git.reset(["--hard", cleanHash]);
			console.log(`[CheckpointTracker.resetHead] Shadow repo resetado para ${cleanHash}.`);
            if (rootCommitHash && cleanHash === rootCommitHash) {
                console.log(`[CheckpointTracker.resetHead] Alvo é commit raiz. Pulando checkout pois limpeza já tratou o diretório de trabalho.`);
            } else {
                if (!rootCommitHash) {
                    console.warn(`[CheckpointTracker.resetHead] Não foi possível verificar o hash do commit raiz. Prosseguindo com checkout.`);
                }
                console.log(`[CheckpointTracker.resetHead] Fazendo checkout dos arquivos para worktree: ${this.cwd}`);
                await git.checkout(['-f', '--', '.']);
                console.log(`[CheckpointTracker.resetHead] Checkout para worktree completo.`);
            }
			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[CheckpointTracker.resetHead] Workspace resetado com sucesso para checkpoint ${cleanHash} em ${durationMs}ms`);
		} catch (error) {
		          const ignoredErrorSubstring = "pathspec '.' did not match any file(s) known to git";
		          const isIgnoredError = error instanceof Error && error.message.includes(ignoredErrorSubstring);
		          if (isIgnoredError) {
		              console.warn(`[CheckpointTracker.resetHead] Encontrado erro conhecido (ignorável) durante reset: ${error.message}`);
		          } else {
		              console.error(`[CheckpointTracker.resetHead] Falha ao resetar para checkpoint ${cleanHash}:`, error);
		              vscode.window.showErrorMessage(`Falha ao resetar para o checkpoint: ${error instanceof Error ? error.message : String(error)}`);
		          }
			throw error;
		} finally {
			await this.gitOperations.renameNestedGitRepos(false);
		}
	}
	public async getDiffSet(lhsHash?: string, rhsHash?: string): Promise<DiffEntry[]> {
		const cleanLhs = this.cleanCommitHash(lhsHash);
		const cleanRhs = this.cleanCommitHash(rhsHash);
		console.log(`[CheckpointTracker.getDiffSet] Obtendo diff: ${cleanLhs || 'inicial'} -> ${cleanRhs || 'diretório de trabalho'}`);
		const startTime = performance.now();
        let stagedForDiff = false; 
		try {
			const git = await this.getGitInstance();
			let diffOutput: string;
			let diffCommandArgs: string[];
			if (!cleanRhs) {
				console.log(`[CheckpointTracker.getDiffSet] Comparando commit ${cleanLhs} com diretório de trabalho usando diff-tree após preparação.`);
				if (!cleanLhs) throw new Error("Não é possível comparar estado inicial diretamente com diretório de trabalho nesta lógica revisada.");
                console.log("[CheckpointTracker.getDiffSet] Preparando alterações do diretório de trabalho para diff...");
                await this.stageWorkspaceChanges(); 
                stagedForDiff = true;
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', cleanLhs];
				diffOutput = await git.raw(diffCommandArgs);
				console.log(`[CheckpointTracker.getDiffSet] Saída bruta do diff (vs diretório de trabalho preparado):\n${diffOutput}`);
			} else {
				console.log(`[CheckpointTracker.getDiffSet] Comparando commit ${cleanLhs} com commit ${cleanRhs} usando 'git diff-tree'.`);
				let baseCommit = cleanLhs;
				if (!baseCommit) {
					const log = await git.log(['--reverse', '--format=%H', '--max-count=1']);
					baseCommit = log.latest?.hash;
					if (!baseCommit) throw new Error("Não foi possível determinar o commit raiz para diff.");
					console.log(`[CheckpointTracker.getDiffSet] Usando commit raiz como base: ${baseCommit}`);
				}
				diffCommandArgs = ['diff-tree', '-r', '--no-commit-id', '--name-status', baseCommit, cleanRhs];
				diffOutput = await git.raw(diffCommandArgs);
				console.log(`[CheckpointTracker.getDiffSet] Saída bruta do diff (commit-para-commit):\n${diffOutput}`);
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
			console.log(`[CheckpointTracker.getDiffSet] Encontrados ${changedFiles.length} arquivos alterados.`);
            if (stagedForDiff) {
                console.log("[CheckpointTracker.getDiffSet] Resetando índice antes de recuperar conteúdo do arquivo...");
                await git.reset();
                stagedForDiff = false; 
                console.log("[CheckpointTracker.getDiffSet] Reset do índice completo.");
            }
			const diffSetResult: DiffEntry[] = [];
			for (const file of changedFiles) {
				const relativePath = file.path;
				const absolutePath = path.join(this.cwd, relativePath);
				let beforeContent = "";
				let afterContent = "";
				if (file.status !== 'A' && !file.status.startsWith('R') && cleanLhs) {
					try {
						console.log(`[CheckpointTracker.getDiffSet] Obtendo conteúdo 'anterior' para ${relativePath} usando cat-file de ${cleanLhs}`);
						beforeContent = await git.raw(['cat-file', 'blob', `${cleanLhs}:${relativePath}`]);
					} catch (e: any) {
						console.warn(`[CheckpointTracker.getDiffSet] Erro ao executar 'git cat-file blob ${cleanLhs}:${relativePath}':`, e.message || e);
					}
				} else if (file.status.startsWith('R') && cleanLhs) {
					console.warn(`[CheckpointTracker.getDiffSet] Tratando renomeação para ${relativePath}, conteúdo 'anterior' pode estar impreciso (mostrando vazio).`);
				}
				if (file.status !== 'D') {
					if (cleanRhs) { 
						try {
							console.log(`[CheckpointTracker.getDiffSet] Obtendo conteúdo 'posterior' para ${relativePath} usando cat-file de ${cleanRhs}`);
							afterContent = await git.raw(['cat-file', 'blob', `${cleanRhs}:${relativePath}`]);
						} catch (e: any) {
							console.warn(`[CheckpointTracker.getDiffSet] Erro ao executar 'git cat-file blob ${cleanRhs}:${relativePath}':`, e.message || e);
						}
					} else { 
						try {
                            console.log(`[CheckpointTracker.getDiffSet] Obtendo conteúdo 'posterior' para ${relativePath} usando fs.readFile`);
							afterContent = await fs.readFile(absolutePath, "utf8");
						} catch (e: any) {
							if (e.code !== 'ENOENT') { 
								console.warn(`[CheckpointTracker.getDiffSet] Erro ao ler conteúdo 'posterior' para ${relativePath} do diretório de trabalho:`, e.message);
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
			console.log(`[CheckpointTracker.getDiffSet] Geração de diff completada em ${durationMs}ms. Encontradas ${diffSetResult.length} diferenças.`);
			return diffSetResult;
		} catch (error) {
			console.error(`[CheckpointTracker.getDiffSet] Falha ao obter conjunto de diff:`, error);
			vscode.window.showErrorMessage(`Falha ao calcular diferenças: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		} finally {
            if (stagedForDiff) { 
                try {
                    const git = await this.getGitInstance();
                    console.log("[CheckpointTracker.getDiffSet] FINALLY: Resetando índice (verificação de segurança)...");
                    await git.reset();
                    console.log("[CheckpointTracker.getDiffSet] FINALLY: Reset do índice completo.");
                } catch (resetError) {
                    console.error("[CheckpointTracker.getDiffSet] FINALLY: Erro ao resetar índice:", resetError);
                }
            }
        }
	}
	public async getDiffCount(lhsHash?: string, rhsHash?: string): Promise<number> {
        try {
            const diffSet = await this.getDiffSet(lhsHash, rhsHash);
            return diffSet.length;
        } catch (error) {
             console.error(`[CheckpointTracker.getDiffCount] Erro ao obter contagem de diff:`, error);
             return 0; 
        }
	}
	public async getFileContentAtCommit(commitHash: string | undefined, relativePath: string): Promise<string> {
		const cleanHash = this.cleanCommitHash(commitHash);
		if (!cleanHash) {
			console.warn(`[CheckpointTracker.getFileContentAtCommit] Hash de commit inválido ou ausente.`);
			return ""; 
		}
		const gitPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		console.log(`[CheckpointTracker.getFileContentAtCommit] Obtendo conteúdo para '${gitPath}' no commit ${cleanHash}`);
		try {
			const git = await this.getGitInstance();
			const content = await git.raw(['cat-file', 'blob', `${cleanHash}:${gitPath}`]);
			console.log(`[CheckpointTracker.getFileContentAtCommit] Conteúdo recuperado com sucesso para '${gitPath}' no ${cleanHash}.`);
			return content;
		} catch (error: any) {
			if (error.message && (error.message.includes('fatal: path') && error.message.includes('does not exist in'))) {
				console.log(`[CheckpointTracker.getFileContentAtCommit] Arquivo '${gitPath}' não encontrado no commit ${cleanHash}. Retornando string vazia.`);
			} else {
				console.error(`[CheckpointTracker.getFileContentAtCommit] Erro inesperado ao executar 'git cat-file blob ${cleanHash}:${gitPath}':`, error);
			}
			return ""; 
		}
	}
	public static async deleteCheckpoints(taskId: string, globalStoragePath: string | undefined, cwdHash: string | undefined): Promise<void> {
		if (!globalStoragePath || !cwdHash) {
			console.warn(`[CheckpointTracker.deleteCheckpoints] globalStoragePath ou cwdHash ausente para tarefa ${taskId}. Não é possível excluir.`);
			return;
		}
		console.log(`[CheckpointTracker.deleteCheckpoints] Excluindo checkpoints para tarefa ${taskId} (CWD Hash: ${cwdHash})`);
		try {
			const checkpointsDir = await getCheckpointsDirectory(globalStoragePath, cwdHash);
			if (await fileExistsAtPath(checkpointsDir)) {
				console.log(`[CheckpointTracker.deleteCheckpoints] Removendo diretório: ${checkpointsDir}`);
				await fs.rm(checkpointsDir, { recursive: true, force: true });
				console.log(`[CheckpointTracker.deleteCheckpoints] Checkpoints excluídos com sucesso para tarefa ${taskId}.`);
			} else {
				console.log(`[CheckpointTracker.deleteCheckpoints] Diretório de checkpoints não encontrado para tarefa ${taskId}. Nada para excluir.`);
			}
		} catch (error) {
			console.error(`[CheckpointTracker.deleteCheckpoints] Falha ao excluir checkpoints para tarefa ${taskId}:`, error);
			vscode.window.showErrorMessage(`Falha ao excluir dados do checkpoint para a tarefa ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
export default CheckpointTracker;
