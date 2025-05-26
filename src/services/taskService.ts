import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Operation } from './parserService';
import { escapePath } from '../utils/pathUtils';
const PROGRESS_PREFIX = "PROGRESS::";
const TYPE_COMMAND = "COMMAND";
const TYPE_FILE = "FILE";
const TYPE_DIR = "DIR";
const TYPE_INFO = "INFO"; 
const TYPE_SUCCESS = "SUCCESS";
const TYPE_ERROR = "ERROR";
function contentForHereString(lines: string[]): string {
    return lines.map(line => line.trimEnd()).join('\r\n');
}
function executeTaskAndGetExitCode(task: vscode.Task): Promise<{ exitCode: number | undefined }> {
    return new Promise((resolve) => {
        let endDisposable: vscode.Disposable | undefined; 
        const startExecution = async () => {
            try {
                const executionInstance = await vscode.tasks.executeTask(task);
                console.log(`[taskService.executeTaskAndGetExitCode] Task execution requested: ${task.name}`);
                endDisposable = vscode.tasks.onDidEndTaskProcess(e => {
                    if (e.execution === executionInstance ||
                       (e.execution.task.name === task.name && e.execution.task.source === task.source))
                    {
                        endDisposable?.dispose(); 
                        console.log(`[taskService.executeTaskAndGetExitCode] Task ended. Exit code: ${e.exitCode}`);
                        resolve({ exitCode: e.exitCode }); 
                    }
                });
            } catch (executionError) {
                console.error("[taskService.executeTaskAndGetExitCode] Failed to start task execution:", executionError);
                            vscode.window.showErrorMessage(`Failed to start execution task: ${executionError instanceof Error ? executionError.message : String(executionError)}`);
                endDisposable?.dispose(); 
                resolve({ exitCode: undefined }); 
            }
        };
        startExecution(); 
    });
}
export async function generateAndExecuteScriptAsTask(operations: Operation[], workspaceRoot: string): Promise<{ success: boolean, progress: string[] }> {
    const taskName = "AI Structure Generation (Hidden)"; 
    let tempScriptPath: string | null = null;
    let tempOutputPath: string | null = null;
    const progressMessages: string[] = [];
    console.log('[taskService.generateAndExecuteScriptAsTask] Generating script content...');
    if (operations.length === 0) {
        console.log('[taskService.generateAndExecuteScriptAsTask] No operations to execute.');
              progressMessages.push(`${PROGRESS_PREFIX}${TYPE_INFO}::No operations found to execute.`);
        return { success: true, progress: progressMessages };
    }
    try {
        const tempDir = os.tmpdir();
        await fs.mkdir(tempDir, { recursive: true });
        const timestamp = Date.now();
        tempScriptPath = path.join(tempDir, `vscode_ai_gen_script_${timestamp}.ps1`);
        tempOutputPath = path.join(tempDir, `vscode_ai_gen_output_${timestamp}.log`);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temp script: ${tempScriptPath}`);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temp output: ${tempOutputPath}`);
        const scriptLines: string[] = [];
        scriptLines.push(`try { [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}`);
        scriptLines.push(`$utf8Encoding = [System.Text.Encoding]::UTF8`);
        scriptLines.push(`$ProgressLogPath = '${escapePath(tempOutputPath)}'`);
        scriptLines.push(`function Write-ProgressLog { param([string]$Type, [string]$Message) Write-Output "${PROGRESS_PREFIX}$($Type)::$($Message)" | Out-File -Encoding utf8 -LiteralPath $ProgressLogPath -Append }`);
        scriptLines.push('');
        scriptLines.push(`cd '${escapePath(workspaceRoot)}'`);
              scriptLines.push(`Write-ProgressLog -Type '${TYPE_INFO}' -Message "Starting Generation in '$((Get-Location).Path)'"`);
        scriptLines.push('$ErrorActionPreference = "Stop"'); 
        scriptLines.push('');
        operations.forEach((op, index) => {
            const stepNum = index + 1;
            const commandTrimmed = op.value.trim(); 
            if (op.type === 'command' && commandTrimmed.startsWith('mkdir ')) {
                const mkdirPathRaw = commandTrimmed.substring(5).trim().replace(/^["']|["']$/g, ''); 
                const escapedMkdirPathForMessage = escapePath(mkdirPathRaw); 
                            scriptLines.push(`# Step ${stepNum}: mkdir Command`);
                scriptLines.push(`$mkdirCommandRaw = '${escapePath(op.value)}'`); 
                scriptLines.push(`$targetMkdirPath = '${escapedMkdirPathForMessage}'`); 
                            scriptLines.push(`Write-ProgressLog -Type '${TYPE_COMMAND}' -Message "Processing: $mkdirCommandRaw"`);
                scriptLines.push(`if (Test-Path -LiteralPath $targetMkdirPath -PathType Container) {`);
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_INFO}' -Message "Directory '$targetMkdirPath' already exists, skipping mkdir command."`);
                scriptLines.push(`} elseif (Test-Path -LiteralPath $targetMkdirPath) {`);
                            scriptLines.push(`    $ErrorMessage = "Failure [Command ${stepNum}] '$($mkdirCommandRaw)': A file with the name '$targetMkdirPath' already exists."`);
                scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`    exit 1`); 
                scriptLines.push(`} else {`);
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_DIR}' -Message "Creating directory (via mkdir): $targetMkdirPath"`);
                scriptLines.push(`    try {`);
                scriptLines.push(`        New-Item -Path $targetMkdirPath -ItemType Directory -Force | Out-Null`);
                scriptLines.push(`    } catch {`);
                            scriptLines.push(`        $ErrorMessage = "Failure [Command ${stepNum}] '$($mkdirCommandRaw)': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`        Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`        exit 1`);
                scriptLines.push(`    }`);
                scriptLines.push(`}`);
                scriptLines.push('');
            } else if (op.type === 'command') {
                 const escapedCommandForMessage = op.value.replace(/'/g, "''").replace(/`/g, "``"); 
                             scriptLines.push(`# Step ${stepNum}: Command`);
                             scriptLines.push(`Write-ProgressLog -Type '${TYPE_COMMAND}' -Message 'Executing: ${escapedCommandForMessage}'`);
                 scriptLines.push(`try {`);
                 scriptLines.push(`    ${op.value}`); 
                             scriptLines.push(`    if (-not $?) { throw "Command failed (non-zero exit code)." }`);
                 scriptLines.push(`} catch {`);
                             scriptLines.push(`    $ErrorMessage = "Failure [Command ${stepNum}] '${escapedCommandForMessage}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                 scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                 scriptLines.push(`    exit 1`); 
                 scriptLines.push(`}`);
                 scriptLines.push('');
            } else if (op.type === 'code' && op.content) {
                const relativePath = op.value;
                const filePath = path.join(workspaceRoot, ...relativePath.split('/'));
                const fileDir = path.dirname(filePath);
                const escapedDir = escapePath(fileDir);
                const escapedFile = escapePath(filePath);
                const escapedRelativePath = escapePath(relativePath); 
                            scriptLines.push(`# Step ${stepNum}: File ${relativePath}`);
                scriptLines.push(`$targetDir = '${escapedDir}'`);
                scriptLines.push(`if (-not (Test-Path -Path $targetDir -PathType Container)) {`);
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_DIR}' -Message 'Creating directory: ${escapedDir}'`);
                scriptLines.push(`    try {`);
                scriptLines.push(`        New-Item -Path $targetDir -ItemType Directory -Force | Out-Null`);
                scriptLines.push(`    } catch {`);
                            scriptLines.push(`        $ErrorMessage = "Failure [Directory ${stepNum}] '${escapedDir}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`        Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`        exit 1`);
                scriptLines.push(`    }`);
                scriptLines.push(`} else {`);
                scriptLines.push(`}`);
                scriptLines.push(`$targetFile = '${escapedFile}'`);
                scriptLines.push(`if (Test-Path -LiteralPath $targetFile -PathType Leaf) {`);
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_FILE}' -Message 'Editing file: ${escapedRelativePath}'`);
                scriptLines.push(`} else {`);
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_FILE}' -Message 'Writing file: ${escapedRelativePath}'`);
                scriptLines.push(`}`);
                const fileContent = contentForHereString(op.content);
                scriptLines.push(`$content = @'\r\n${fileContent}\r\n'@`);
                scriptLines.push(`try {`);
                scriptLines.push(`    Set-Content -Path $targetFile -Value $content -Encoding UTF8 -Force`);
                scriptLines.push(`} catch {`);
                            scriptLines.push(`    $ErrorMessage = "Failure [File ${stepNum}] '${escapedRelativePath}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`    exit 1`);
                scriptLines.push(`}`);
                scriptLines.push('');
            }
        });
              scriptLines.push(`Write-ProgressLog -Type '${TYPE_SUCCESS}' -Message 'Generation Completed Successfully.'`);
        scriptLines.push(`exit 0`); 
        const scriptContent = scriptLines.join('\r\n');
        const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const scriptBuffer = Buffer.concat([utf8Bom, Buffer.from(scriptContent, 'utf8')]);
        await fs.writeFile(tempScriptPath, scriptBuffer);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temporary script written (UTF-8 BOM).`);
        const taskDefinition = { type: 'shell', task: 'aiStructureGen' }; 
        const execution = new vscode.ShellExecution(`powershell.exe`, [
            "-NoProfile",           
            "-ExecutionPolicy", "Bypass", 
            "-File", tempScriptPath      
        ]);
        const task = new vscode.Task(
            taskDefinition,
            vscode.TaskScope.Workspace,
            taskName, 
            "AI Structure Generator", 
            execution,
            [] 
        );
        task.isBackground = true; 
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Never, 
            panel: vscode.TaskPanelKind.Shared, 
            focus: false,
            clear: true, 
            echo: false, 
            showReuseMessage: false
        };
        console.log('[taskService.generateAndExecuteScriptAsTask] >>> Executing hidden task...');
        const { exitCode } = await executeTaskAndGetExitCode(task);
        console.log(`[taskService.generateAndExecuteScriptAsTask] <<< Task execution finished. Exit code: ${exitCode}`);
        try {
            const outputContent = await fs.readFile(tempOutputPath, 'utf-8');
            progressMessages.push(...outputContent.split(/\r?\n/).filter(line => line.startsWith(PROGRESS_PREFIX) && line.length > PROGRESS_PREFIX.length));
        } catch (readError: any) {
            console.error(`[taskService.generateAndExecuteScriptAsTask] Failed to read progress log file ${tempOutputPath}:`, readError);
                     progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Failed to read progress log.`);
             return { success: exitCode === 0, progress: progressMessages };
        }
        if (exitCode === 0) {
            console.log('[taskService.generateAndExecuteScriptAsTask] Task completed successfully.');
            if (!progressMessages.some(p => p.includes(`::${TYPE_SUCCESS}::`))) {
                             progressMessages.push(`${PROGRESS_PREFIX}${TYPE_SUCCESS}::Generation Completed (exit code 0).`);
            }
            return { success: true, progress: progressMessages };
        } else {
            console.error(`[taskService.generateAndExecuteScriptAsTask] Task failed with exit code: ${exitCode}.`);
             if (!progressMessages.some(p => p.includes(`::${TYPE_ERROR}::`))) {
                             progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Execution failed (exit code: ${exitCode ?? 'unknown'}).`);
             }
            return { success: false, progress: progressMessages };
        }
    } catch (error) {
        console.error("[taskService.generateAndExecuteScriptAsTask] Error setting up or running task:", error);
              vscode.window.showErrorMessage(`Error executing generation task: ${error instanceof Error ? error.message : String(error)}`);
              progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Unexpected setup error: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false, progress: progressMessages };
    } finally {
        const cleanup = async () => {
            if (tempScriptPath) {
                try {
                    await fs.unlink(tempScriptPath);
                    console.log(`[taskService.generateAndExecuteScriptAsTask] Deleted temp script: ${tempScriptPath}`);
                } catch (err) {
                    console.warn(`Failed to delete temp script ${tempScriptPath}:`, err);
                }
            }
            if (tempOutputPath) {
                try {
                    await fs.unlink(tempOutputPath);
                    console.log(`[taskService.generateAndExecuteScriptAsTask] Deleted temp output log: ${tempOutputPath}`);
                } catch (err) {
                    console.warn(`Failed to delete temp output log ${tempOutputPath}:`, err);
                }
            }
        };
        cleanup(); 
    }
}
