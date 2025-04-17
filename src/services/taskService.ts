// --- src/services/taskService.ts ---

// src/services/taskService.ts

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Operation } from './parserService';
import { escapePath } from '../utils/pathUtils';

// Define constants for progress message prefixes
const PROGRESS_PREFIX = "PROGRESS::";
const TYPE_COMMAND = "COMMAND";
const TYPE_FILE = "FILE";
const TYPE_DIR = "DIR";
const TYPE_INFO = "INFO"; // General info/status
const TYPE_SUCCESS = "SUCCESS";
const TYPE_ERROR = "ERROR";

/**
 * Ensures consistent line endings (CRLF) for PowerShell Here-String compatibility.
 * @param lines Array of strings (lines of content).
 * @returns A single string with lines joined by CRLF.
 */
function contentForHereString(lines: string[]): string {
    // Trim trailing whitespace from each line before joining
    return lines.map(line => line.trimEnd()).join('\r\n');
}

/**
 * Helper function to wrap task execution in a promise that resolves with the exit code.
 * @param task The VS Code Task to execute.
 * @returns A promise that resolves to an object { exitCode: number | undefined }.
 */
function executeTaskAndGetExitCode(task: vscode.Task): Promise<{ exitCode: number | undefined }> {
    return new Promise((resolve) => {
        let endDisposable: vscode.Disposable | undefined; // Define disposable for the end listener

        const startExecution = async () => {
            try {
                const executionInstance = await vscode.tasks.executeTask(task);
                console.log(`[taskService.executeTaskAndGetExitCode] Task execution requested: ${task.name}`);

                // Listener for task process exit
                endDisposable = vscode.tasks.onDidEndTaskProcess(e => {
                    // Check if the execution instance matches OR if the task name/source match
                    // This helps ensure we're resolving for the correct task instance,
                    // especially if multiple tasks with the same name/source might run.
                    if (e.execution === executionInstance ||
                       (e.execution.task.name === task.name && e.execution.task.source === task.source))
                    {
                        endDisposable?.dispose(); // Dispose listener once the task ends
                        console.log(`[taskService.executeTaskAndGetExitCode] Task ended. Exit code: ${e.exitCode}`);
                        resolve({ exitCode: e.exitCode }); // Resolve with correct object type
                    }
                });

            } catch (executionError) {
                console.error("[taskService.executeTaskAndGetExitCode] Failed to start task execution:", executionError);
                // Show error message in English
                            vscode.window.showErrorMessage(`Failed to start execution task: ${executionError instanceof Error ? executionError.message : String(executionError)}`);
                endDisposable?.dispose(); // Ensure listener is disposed on startup error
                resolve({ exitCode: undefined }); // Indicate failure with correct object type
            }
        };

        startExecution(); // Call the async function to start execution
    });
}

/**
 * Generates a PowerShell script based on the provided operations and executes it as a VS Code Task.
 * The script handles creating directories, writing files, and executing commands.
 * It now writes structured progress messages to a temporary file and the task is run hidden.
 * @param operations An array of Operation objects parsed from the input.
 * @param workspaceRoot The absolute path to the workspace root directory.
 * @returns A promise that resolves to an object { success: boolean, progress: string[] }
 */
export async function generateAndExecuteScriptAsTask(operations: Operation[], workspaceRoot: string): Promise<{ success: boolean, progress: string[] }> {
    const taskName = "AI Structure Generation (Hidden)"; // Keep as is, already English
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
        // --- Prepare Temp Files ---
        const tempDir = os.tmpdir();
        await fs.mkdir(tempDir, { recursive: true });
        const timestamp = Date.now();
        tempScriptPath = path.join(tempDir, `vscode_ai_gen_script_${timestamp}.ps1`);
        tempOutputPath = path.join(tempDir, `vscode_ai_gen_output_${timestamp}.log`);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temp script: ${tempScriptPath}`);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temp output: ${tempOutputPath}`);

        // --- Generate Script ---
        const scriptLines: string[] = [];
        // Ensure UTF-8 for file writing and potentially console output
        scriptLines.push(`try { [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}`);
        scriptLines.push(`$utf8Encoding = [System.Text.Encoding]::UTF8`);
        scriptLines.push(`$ProgressLogPath = '${escapePath(tempOutputPath)}'`);
        // Function to write progress messages to the temp file
        scriptLines.push(`function Write-ProgressLog { param([string]$Type, [string]$Message) Write-Output "${PROGRESS_PREFIX}$($Type)::$($Message)" | Out-File -Encoding utf8 -LiteralPath $ProgressLogPath -Append }`);
        scriptLines.push('');
        scriptLines.push(`cd '${escapePath(workspaceRoot)}'`);
        // Translate the initial message
              scriptLines.push(`Write-ProgressLog -Type '${TYPE_INFO}' -Message "Starting Generation in '$((Get-Location).Path)'"`);
        scriptLines.push('$ErrorActionPreference = "Stop"'); // Stop on first error
        scriptLines.push('');

        operations.forEach((op, index) => {
            const stepNum = index + 1;
            const commandTrimmed = op.value.trim(); // Trim whitespace

            // --- Handle 'mkdir' command specifically ---
            if (op.type === 'command' && commandTrimmed.startsWith('mkdir ')) {
                const mkdirPathRaw = commandTrimmed.substring(5).trim().replace(/^["']|["']$/g, ''); // Extract path, remove surrounding quotes
                const escapedMkdirPathForMessage = escapePath(mkdirPathRaw); // Escape for logging

                            scriptLines.push(`# Step ${stepNum}: mkdir Command`);
                scriptLines.push(`$mkdirCommandRaw = '${escapePath(op.value)}'`); // Store original escaped command
                scriptLines.push(`$targetMkdirPath = '${escapedMkdirPathForMessage}'`); // Use escaped path for PS variable

                // Log processing attempt
                            scriptLines.push(`Write-ProgressLog -Type '${TYPE_COMMAND}' -Message "Processing: $mkdirCommandRaw"`);

                // Check if path exists
                scriptLines.push(`if (Test-Path -LiteralPath $targetMkdirPath -PathType Container) {`);
                // Log if directory already exists (KEEP THIS LOG FOR EXPLICIT MKDIR)
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_INFO}' -Message "Directory '$targetMkdirPath' already exists, skipping mkdir command."`);
                scriptLines.push(`} elseif (Test-Path -LiteralPath $targetMkdirPath) {`);
                // Log error if it exists but is a file
                // Translate error message format
                            scriptLines.push(`    $ErrorMessage = "Failure [Command ${stepNum}] '$($mkdirCommandRaw)': A file with the name '$targetMkdirPath' already exists."`);
                scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`    exit 1`); // Exit script on error
                scriptLines.push(`} else {`);
                // Log creation attempt
                 // Translate progress message
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_DIR}' -Message "Creating directory (via mkdir): $targetMkdirPath"`);
                scriptLines.push(`    try {`);
                // Use New-Item with -Force which handles parent directory creation implicitly
                scriptLines.push(`        New-Item -Path $targetMkdirPath -ItemType Directory -Force | Out-Null`);
                scriptLines.push(`    } catch {`);
                 // Translate error message format
                            scriptLines.push(`        $ErrorMessage = "Failure [Command ${stepNum}] '$($mkdirCommandRaw)': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`        Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`        exit 1`);
                scriptLines.push(`    }`);
                scriptLines.push(`}`);
                scriptLines.push('');
            // --- END OF mkdir HANDLING ---

            // --- Fallback for other commands ---
            } else if (op.type === 'command') {
                 const escapedCommandForMessage = op.value.replace(/'/g, "''").replace(/`/g, "``"); // Escape for PS string
                 // Translate script comment
                             scriptLines.push(`# Step ${stepNum}: Command`);
                 // Translate progress message
                             scriptLines.push(`Write-ProgressLog -Type '${TYPE_COMMAND}' -Message 'Executing: ${escapedCommandForMessage}'`);
                 scriptLines.push(`try {`);
                 scriptLines.push(`    ${op.value}`); // Execute the original command
                 // Check exit code explicitly if possible (might depend on the command)
                             scriptLines.push(`    if (-not $?) { throw "Command failed (non-zero exit code)." }`);
                 scriptLines.push(`} catch {`);
                 // Translate error message format
                             scriptLines.push(`    $ErrorMessage = "Failure [Command ${stepNum}] '${escapedCommandForMessage}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                 scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                 scriptLines.push(`    exit 1`); // Exit script on error
                 scriptLines.push(`}`);
                 scriptLines.push('');
            // --- END OF Fallback ---

            } else if (op.type === 'code' && op.content) {
                const relativePath = op.value;
                const filePath = path.join(workspaceRoot, ...relativePath.split('/'));
                const fileDir = path.dirname(filePath);
                const escapedDir = escapePath(fileDir);
                const escapedFile = escapePath(filePath);
                const escapedRelativePath = escapePath(relativePath); // Escape for message

                // Translate script comment
                            scriptLines.push(`# Step ${stepNum}: File ${relativePath}`);
                // Create directory if needed
                scriptLines.push(`$targetDir = '${escapedDir}'`);
                scriptLines.push(`if (-not (Test-Path -Path $targetDir -PathType Container)) {`);
                 // Translate progress message
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_DIR}' -Message 'Creating directory: ${escapedDir}'`);
                scriptLines.push(`    try {`);
                scriptLines.push(`        New-Item -Path $targetDir -ItemType Directory -Force | Out-Null`);
                scriptLines.push(`    } catch {`);
                 // Translate error message format
                            scriptLines.push(`        $ErrorMessage = "Failure [Directory ${stepNum}] '${escapedDir}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`        Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`        exit 1`);
                scriptLines.push(`    }`);
                scriptLines.push(`} else {`);
                scriptLines.push(`}`);

                // Write file content
                scriptLines.push(`$targetFile = '${escapedFile}'`);
                // Check if file exists to adjust message
                scriptLines.push(`if (Test-Path -LiteralPath $targetFile -PathType Leaf) {`);
                 // Translate progress message
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_FILE}' -Message 'Editing file: ${escapedRelativePath}'`);
                scriptLines.push(`} else {`);
                 // Translate progress message
                            scriptLines.push(`    Write-ProgressLog -Type '${TYPE_FILE}' -Message 'Writing file: ${escapedRelativePath}'`);
                scriptLines.push(`}`);
                const fileContent = contentForHereString(op.content);
                // PowerShell Here-String syntax: @' starts on its own line, content follows, '@ ends on its own line.
                scriptLines.push(`$content = @'\r\n${fileContent}\r\n'@`);
                scriptLines.push(`try {`);
                scriptLines.push(`    Set-Content -Path $targetFile -Value $content -Encoding UTF8 -Force`);
                scriptLines.push(`} catch {`);
                 // Translate error message format
                            scriptLines.push(`    $ErrorMessage = "Failure [File ${stepNum}] '${escapedRelativePath}': $($_.Exception.Message)" -replace '\r?\n',' '`);
                scriptLines.push(`    Write-ProgressLog -Type '${TYPE_ERROR}' -Message $ErrorMessage`);
                scriptLines.push(`    exit 1`);
                scriptLines.push(`}`);
                scriptLines.push('');
            }
        });
        // Translate success message
              scriptLines.push(`Write-ProgressLog -Type '${TYPE_SUCCESS}' -Message 'Generation Completed Successfully.'`);
        scriptLines.push(`exit 0`); // Ensure exit code 0 on success

        const scriptContent = scriptLines.join('\r\n');

        // Save the script file explicitly as UTF-8 BOM (required for PowerShell to correctly handle Unicode in some cases)
        const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const scriptBuffer = Buffer.concat([utf8Bom, Buffer.from(scriptContent, 'utf8')]);
        await fs.writeFile(tempScriptPath, scriptBuffer);
        console.log(`[taskService.generateAndExecuteScriptAsTask] Temporary script written (UTF-8 BOM).`);

        // --- Define and Execute Task ---
        const taskDefinition = { type: 'shell', task: 'aiStructureGen' }; // Use a CONSTANT task definition ID
        const execution = new vscode.ShellExecution(`powershell.exe`, [
            "-NoProfile",           // Faster startup, avoids user profile scripts
            "-ExecutionPolicy", "Bypass", // Allow running unsigned local script
            "-File", tempScriptPath      // Execute our script file
        ]);

        const task = new vscode.Task(
            taskDefinition,
            vscode.TaskScope.Workspace,
            taskName, // Keep a consistent *display* name
            "AI Structure Generator", // Source - Keep as is, already English
            execution,
            [] // No problem matchers needed as we parse the log file
        );
        task.isBackground = true; // Mark as background task

        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Never, // *** HIDE THE TERMINAL ***
            // --- MODIFICATION START: Use Shared Panel ---
            panel: vscode.TaskPanelKind.Shared, // Use the shared panel to prevent stacking
            // --- MODIFICATION END ---
            focus: false,
            clear: true, // Clear terminal on reuse (if revealed later)
            echo: false, // Don't echo the command itself in the terminal
            showReuseMessage: false
        };

        console.log('[taskService.generateAndExecuteScriptAsTask] >>> Executing hidden task...');
        const { exitCode } = await executeTaskAndGetExitCode(task);
        console.log(`[taskService.generateAndExecuteScriptAsTask] <<< Task execution finished. Exit code: ${exitCode}`);

        // --- Read Progress from Temp File ---
        try {
            const outputContent = await fs.readFile(tempOutputPath, 'utf-8');
            // Split by newline, filter for our prefix, and remove empty lines
            progressMessages.push(...outputContent.split(/\r?\n/).filter(line => line.startsWith(PROGRESS_PREFIX) && line.length > PROGRESS_PREFIX.length));
        } catch (readError: any) {
            console.error(`[taskService.generateAndExecuteScriptAsTask] Failed to read progress log file ${tempOutputPath}:`, readError);
            // Translate fallback error message
                     progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Failed to read progress log.`);
            // If reading the log fails, trust the exit code more
             return { success: exitCode === 0, progress: progressMessages };
        }

        // --- Determine Success and Return ---
        if (exitCode === 0) {
            console.log('[taskService.generateAndExecuteScriptAsTask] Task completed successfully.');
            // Ensure success message is present if script finished correctly but maybe didn't write the final log line
            if (!progressMessages.some(p => p.includes(`::${TYPE_SUCCESS}::`))) {
                 // Translate fallback success message
                             progressMessages.push(`${PROGRESS_PREFIX}${TYPE_SUCCESS}::Generation Completed (exit code 0).`);
            }
            return { success: true, progress: progressMessages };
        } else {
            console.error(`[taskService.generateAndExecuteScriptAsTask] Task failed with exit code: ${exitCode}.`);
             // Ensure error message is present if script exited non-zero but maybe didn't write the error log line
             if (!progressMessages.some(p => p.includes(`::${TYPE_ERROR}::`))) {
                 // Translate fallback error message
                             progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Execution failed (exit code: ${exitCode ?? 'unknown'}).`);
             }
            return { success: false, progress: progressMessages };
        }

    } catch (error) {
        console.error("[taskService.generateAndExecuteScriptAsTask] Error setting up or running task:", error);
        // Translate error messages
              vscode.window.showErrorMessage(`Error executing generation task: ${error instanceof Error ? error.message : String(error)}`);
              progressMessages.push(`${PROGRESS_PREFIX}${TYPE_ERROR}::Unexpected setup error: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false, progress: progressMessages };
    } finally {
        // --- Cleanup Temp Files ---
        // Use async cleanup but don't wait for it to finish
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
        cleanup(); // Start cleanup without awaiting
    }
}