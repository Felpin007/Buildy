import fs from "fs/promises";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { fileExistsAtPath } from "../../utils/fs"; 
import { getLfsPatterns, writeExcludesFile } from "./CheckpointExclusions"
export const GIT_DISABLED_SUFFIX = "_disabled"
export class GitOperations {
	private cwd: string
	constructor(cwd: string) {
		this.cwd = cwd;
		console.log(`[GitOperations] Inicializado para CWD: ${this.cwd}`);
	}
	public async initShadowGit(gitPath: string, cwd: string, taskId: string): Promise<string> {
		console.log(`[GitOperations.initShadowGit] Inicializando shadow git em ${gitPath} para CWD ${cwd}`);
		if (await fileExistsAtPath(gitPath)) {
			console.log(`[GitOperations.initShadowGit] Repositório shadow existe. Verificando worktree...`);
			const checkpointsDir = path.dirname(gitPath); 
			const git = simpleGit(checkpointsDir); 
			try {
				const worktreeConfig = await git.getConfig("core.worktree");
				const configuredWorktree = worktreeConfig.value;
				if (configuredWorktree !== cwd) {
					console.error(`[GitOperations.initShadowGit] Incompatibilidade de worktree! Esperado: ${cwd}, Encontrado: ${configuredWorktree}`);
					throw new Error(`Checkpoints can only be used in the original workspace. Expected: ${cwd}, Found in config: ${configuredWorktree}`);
				}
				console.log(`[GitOperations.initShadowGit] Worktree verificado (${configuredWorktree}). Atualizando exclusões...`);
				await writeExcludesFile(gitPath, await getLfsPatterns(this.cwd));
				return gitPath;
			} catch (error) {
				console.error(`[GitOperations.initShadowGit] Erro ao verificar repositório shadow existente:`, error);
				throw new Error(`Failed to verify existing shadow Git repository: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const startTime = performance.now();
		const checkpointsDir = path.dirname(gitPath);
		console.log(`[GitOperations.initShadowGit] Criando novo shadow git em ${checkpointsDir}`);
		try {
			await fs.mkdir(checkpointsDir, { recursive: true });
			const git = simpleGit(checkpointsDir); 
			await git.init();
			console.log(`[GitOperations.initShadowGit] 'git init' bem-sucedido.`);
			await git.addConfig("core.worktree", cwd);
			await git.addConfig("commit.gpgSign", "false"); 
			await git.addConfig("user.name", "AI Structure Gen Checkpoint"); 
			await git.addConfig("user.email", "checkpoint@internal.ai"); 
			console.log(`[GitOperations.initShadowGit] Configuração básica do git definida.`);
			const lfsPatterns = await getLfsPatterns(cwd);
			await writeExcludesFile(gitPath, lfsPatterns);
			console.log(`[GitOperations.initShadowGit] Arquivo de exclusões escrito.`);
			const addFilesResult = await this.addCheckpointFiles(git);
			if (!addFilesResult.success) {
				console.error("[GitOperations.initShadowGit] Falha ao adicionar arquivos iniciais ao shadow git. Verifique permissões ou exclusões.");
			} else {
				console.log(`[GitOperations.initShadowGit] Arquivos iniciais adicionados (ou tentativa feita).`);
			}
			await git.commit("initial checkpoint commit", { "--allow-empty": null });
			console.log(`[GitOperations.initShadowGit] Commit inicial criado.`);
			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[GitOperations.initShadowGit] Inicialização do shadow git concluída em ${durationMs}ms`);
			return gitPath;
		} catch (initError) {
			console.error(`[GitOperations.initShadowGit] Erro durante inicialização:`, initError);
			throw new Error(`Failed to initialize shadow Git repository: ${initError instanceof Error ? initError.message : String(initError)}`);
		}
	}
	public async getShadowGitConfigWorkTree(gitPath: string): Promise<string | undefined> {
		try {
			if (!(await fileExistsAtPath(gitPath))) {
				console.warn(`[GitOperations.getShadowGitConfigWorkTree] Caminho do shadow git não existe: ${gitPath}`);
				return undefined;
			}
			const checkpointsDir = path.dirname(gitPath);
			const git = simpleGit(checkpointsDir);
			const worktreeConfig = await git.getConfig("core.worktree");
			return worktreeConfig.value || undefined;
		} catch (error) {
			console.error(`[GitOperations.getShadowGitConfigWorkTree] Falha ao obter worktree da configuração do shadow git de ${gitPath}:`, error);
			return undefined;
		}
	}
	public async renameNestedGitRepos(disable: boolean): Promise<void> {
		const suffix = GIT_DISABLED_SUFFIX;
		const pattern = disable ? "**/.git" : `**/.git${suffix}`;
		const operation = disable ? "Disabling" : "Enabling";
		console.log(`[GitOperations.renameNestedGitRepos] ${operation} repositórios git aninhados em ${this.cwd}`);
		try {
			const { globby } = await import("globby");
			const gitPaths = await globby(pattern, {
				cwd: this.cwd,
				onlyDirectories: true,
				ignore: [".git"], 
				dot: true,
				markDirectories: false, 
				suppressErrors: true, 
				absolute: true, 
			});
			if (gitPaths.length === 0) {
				console.log(`[GitOperations.renameNestedGitRepos] Nenhum repositório aninhado encontrado para ${disable ? 'desabilitar' : 'habilitar'}.`);
				return;
			}
			console.log(`[GitOperations.renameNestedGitRepos] Encontrados repositórios aninhados:`, gitPaths);
			for (const fullPath of gitPaths) {
				if (path.normalize(fullPath) === path.normalize(path.join(this.cwd, ".git"))) {
					console.log(`[GitOperations.renameNestedGitRepos] Pulando renomeação para .git raiz: ${fullPath}`);
					continue;
				}
				let newPath: string;
				if (disable) {
					newPath = fullPath + suffix;
				} else {
					if (fullPath.endsWith(suffix)) {
						newPath = fullPath.slice(0, -suffix.length);
					} else {
						console.warn(`[GitOperations.renameNestedGitRepos] Pulando reativação, caminho não termina com sufixo: ${fullPath}`);
						continue; 
					}
				}
				try {
					console.log(`[GitOperations.renameNestedGitRepos] Renomeando ${fullPath} para ${newPath}`);
					await fs.rename(fullPath, newPath);
				} catch (renameError: any) {
					if (renameError.code === 'EPERM' || renameError.code === 'EACCES') {
						console.warn(`[GitOperations.renameNestedGitRepos] Erro de permissão ao renomear ${fullPath}. Pulando. Erro: ${renameError.message}`);
					} else if (renameError.code === 'ENOENT') {
						console.warn(`[GitOperations.renameNestedGitRepos] Arquivo não encontrado durante renomeação (possível condição de corrida?): ${fullPath}. Pulando. Erro: ${renameError.message}`);
					} else {
						console.error(`[GitOperations.renameNestedGitRepos] Falha ao renomear ${fullPath}:`, renameError);
					}
				}
			}
		} catch (globError) {
			console.error(`[GitOperations.renameNestedGitRepos] Erro ao encontrar diretórios .git aninhados:`, globError);
		}
		console.log(`[GitOperations.renameNestedGitRepos] Finalizado ${operation} repositórios git aninhados.`);
	}
	public async addCheckpointFiles(git: SimpleGit): Promise<{ success: boolean }> {
		const startTime = performance.now();
		let success = false;
		try {
			console.log("[GitOperations.addCheckpointFiles] Desabilitando repositórios git aninhados...");
			await this.renameNestedGitRepos(true); 
			console.log("[GitOperations.addCheckpointFiles] Executando 'git add . --ignore-errors'...");
			try {
				await git.add(['.', '--ignore-errors', '--verbose']); 
				success = true; 
				console.log("[GitOperations.addCheckpointFiles] Comando 'git add' concluído.");
			} catch (addError: any) {
				console.warn(`[GitOperations.addCheckpointFiles] Comando 'git add' encontrou um erro (potencialmente ignorado):`, addError.message);
				success = true; 
			}
			const durationMs = Math.round(performance.now() - startTime);
			console.log(`[GitOperations.addCheckpointFiles] Operação de adição concluída em ${durationMs}ms. Sucesso: ${success}`);
			return { success };
		} catch (error) {
			console.error("[GitOperations.addCheckpointFiles] Erro inesperado durante processo de adição:", error);
			return { success: false };
		} finally {
			console.log("[GitOperations.addCheckpointFiles] Reabilitando repositórios git aninhados...");
			await this.renameNestedGitRepos(false);
			console.log("[GitOperations.addCheckpointFiles] Repositórios git aninhados reabilitados.");
		}
	}
}
