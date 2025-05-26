import { getSelectedFilePaths, updateCopyButtonState, handleCheckboxChange } from './checkboxUtils.js';
import { showContextMenu, hideContextMenu } from './contextMenu.js';
import { renderTree } from './treeView.js';
(function() {
    let vscode;
    try {
        vscode = acquireVsCodeApi();
    } catch (e) {
        console.error("Não foi possível adquirir acquireVsCodeApi. Comunicação do Webview desativada.", e);
        const generateButton = document.getElementById('generateButton');
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.textContent = 'Erro: API do VS Code indisponível';
        }
        const progressContainer = document.getElementById('generationProgressContainer');
        if (progressContainer) progressContainer.style.display = 'none';
        return;
    }
       const PROMPT_TEXT_TO_COPY_WIN = `
  You are an AI whose commands will be captured and passed into an algorithm that will execute the commands in the Powershell Windows terminal, write content to files, etc. For that, you must respond in the following format:
   FOR CREATION:
   ------------------------------------------------------------------
   The page structure (DO NOT create a root folder, e.g., project-cars):
   STRUCTURAL PART: <- mandatory as the first item
   <text>here is the structure:</text>
   (structure in ASCII)
   e.g.:
   <structure>
   ...structure...
   </structure>
   <command>cd...</command> <- commands can appear anywhere
   <command>rmdir...</command>
   ...
   NEVER USE echo COMMAND
   NEVER USE TOUCH COMMAND, instead, to create files use:
   <code ref="./index.html">
   <html>
   ....
   </html>
   </code>
   <code ref="./monster.svg">
   <svg>
   ...
   </svg>
   </code>
   <command>...</command>
   <command>...</command>
   <code ref="./index.html">
   <html>
   ....
   </html>
   </code>
   <command>...</command>
   ALWAYS show the COMPLETE code.
   -------------------------------------------------------------
   FOR EDITING + addition (optional):
   -------------------------------------------------------------
   Respond with:
   UPDATED STRUCTURE (note: every new/existing file that was modified must be shown COMPLETELY / Unchanged files should not be shown)
   REMAINDER FOLLOWING THE SAME PREVIOUS RULES
   general note: anything you want to say as normal text to the user, say it under the <text></text> tag
   another general note: You don't necessarily need to show the full code of ALL the files, only those that HAVE BEEN MODIFIED.
   another: remember to close the code tag
   Response example:
   <text>here is the structure:</text>
   <structure>
   ...structure...
   </structure>
   <command>cd...</command>
   <command>mkdir...</command>
   <code ref="./index.html"> 
   <html>
   ....
   </html>
   </code> <- remembering to close the code tag
   <command>...</command>
   <command>...</command>
`.trim(); 
    const PROMPT_TEXT_TO_COPY_LINUX = `
You are an AI whose commands will be captured and passed into an algorithm that will execute the commands in a **Linux terminal** (e.g., Bash), write content to files, etc. For that, you must respond in the following format:
   FOR CREATION:
   ------------------------------------------------------------------
   The page structure (DO NOT create a root folder, e.g., project-cars):
   STRUCTURAL PART: <- mandatory as the first item
   <text>here is the structure:</text>
   (structure in ASCII, using forward slashes \`/\` for paths)
   e.g.:
   <structure>
   ./
   ├── index.html
   └── assets/
       └── image.svg
   </structure>
   <command>cd desired_directory</command> <- commands can appear anywhere. Use standard Linux commands like cd, mkdir, rm, rm -r, mv, cp etc.
   <command>rm -r old_directory</command>
   <command>rm file_to_delete.txt</command>
   ...
   NEVER USE echo COMMAND TO CREATE/MODIFY FILES.
   NEVER USE touch COMMAND, instead, to create files (even empty ones) use:
   <code ref="./index.html">
   <html>
   ....
   </html>
   </code>
   <code ref="./assets/monster.svg">
   <svg>
   ...
   </svg>
   </code>
   <code ref="./empty-file.txt"></code> <!-- Example for an empty file -->
   <command>...</command>
   <command>...</command>
   <code ref="./index.html"> <!-- Example of modifying a file later -->
   <html>
   .... (new content) ....
   </html>
   </code>
   <command>...</command>
   ALWAYS show the COMPLETE code for files being created or modified within the <code> tag.
   ALWAYS use forward slashes (/) for paths in \`<command>\` tags and \`ref\` attributes.
   -------------------------------------------------------------
   FOR EDITING + addition (optional):
   -------------------------------------------------------------
   Respond with:
   UPDATED STRUCTURE (note: every new/existing file that was modified must be shown COMPLETELY / Unchanged files should not be shown)
   REMAINDER FOLLOWING THE SAME PREVIOUS RULES (Linux commands, no echo/touch, <code> for content, forward slashes)
   general note: anything you want to say as normal text to the user, say it under the <text></text> tag
   another general note: You don't necessarily need to show the full code of ALL the files, only those that HAVE BEEN MODIFIED or are NEW.
   another: remember to close the code tag
   Response example:
   <text>here is the structure:</text>
   <structure>
   ./
   ├── index.html
   └── styles/
       └── main.css
   </structure>
   <command>mkdir styles</command>
   <code ref="./index.html">
   <!DOCTYPE html>
   <html>
   <head>
       <title>My Page</title>
       <link rel="stylesheet" href="./styles/main.css">
   </head>
   <body>
       <h1>Hello Linux!</h1>
   </body>
   </html>
   </code>
   <code ref="./styles/main.css">
   body {
       font-family: sans-serif;
   }
   </code> <- remembering to close the code tag
   <command>ls -la</command>
`.trim();
    const webviewContainer = document.querySelector('.content-wrapper');
    const generateButton = document.getElementById('generateButton');
    const structureInput = document.getElementById('structureInput');
    const copyWinPromptButton = document.getElementById('copyWinPromptButton'); 
    const copyLinuxPromptButton = document.getElementById('copyLinuxPromptButton'); 
    const promptSettingsButton = document.getElementById('promptSettingsButton');
    const promptSettingsSection = document.getElementById('promptSettingsSection');
    const additionalPromptInput = document.getElementById('additionalPromptInput');
    const saveAdditionalPromptButton = document.getElementById('saveAdditionalPromptButton');
    const undoButton = document.getElementById('undoButton'); 
    const refreshTreeButton = document.getElementById('refreshTreeButton');
    const copySelectedButton = document.getElementById('copySelectedButton');
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    const fileTree = document.getElementById('fileTree'); 
    const loadingIndicator = document.getElementById('loadingIndicator');
    const treePlaceholder = document.getElementById('treePlaceholder');
    const contextMenu = document.getElementById('explorerContextMenu');
    const explorerTitle = document.getElementById('explorerTitle');
    const progressContainer = document.getElementById('generationProgressContainer');
    const progressList = document.getElementById('progressList');
    let isTreeLoaded = false;
    let currentContextMenuTarget = null;
    let isGenerating = false;
    let additionalPrompt = ''; 
    let settingsSectionVisible = false; 
    function parseProgressMessage(message) {
        const prefix = "PROGRESS::";
        if (!message || !message.startsWith(prefix)) {
            return { type: 'UNKNOWN', text: message };
        }
        const parts = message.substring(prefix.length).split('::');
        if (parts.length < 2) {
            return { type: 'UNKNOWN', text: message.substring(prefix.length) };
        }
        return { type: parts[0], text: parts.slice(1).join('::') };
    }
    function renderProgressItem(type, text, diffType = 'generation') { 
        if (!progressList) return;
        let relativePath = null;
        const pathMatch = text.match(/^(?:(?:Escrevendo|Editando) arquivo:\s*(.*))|(?:Arquivo revertido:\s*(.*))|(?:Criando diretório:\s*(.*))/);
        if (pathMatch) {
            relativePath = pathMatch[1] || pathMatch[2] || pathMatch[3];
        }
        const item = document.createElement('div');
        item.classList.add('progress-item');
        let iconClass = 'codicon-info';
        switch (type.toUpperCase()) {
            case 'COMMAND': item.classList.add('command'); iconClass = 'codicon-terminal'; break;
            case 'FILE':
                item.classList.add('file');
                iconClass = 'codicon-file-code'; 
                if (text.startsWith('Escrevendo arquivo:')) {
                    item.classList.add('writing');
                } else if (text.startsWith('Editando arquivo:')) {
                    item.classList.add('editing');
                }
                break;
            case 'DIR': item.classList.add('dir'); iconClass = 'codicon-folder'; break;
            case 'SUCCESS': item.classList.add('success'); iconClass = 'codicon-check'; break;
            case 'ERROR': item.classList.add('error'); iconClass = 'codicon-error'; break;
            case 'INFO': item.classList.add('info'); iconClass = 'codicon-info'; break;
            case 'REVERTED': item.classList.add('reverted'); iconClass = 'codicon-history'; break; 
            default: item.classList.add('info'); iconClass = 'codicon-info'; break;
        }
        item.innerHTML = `<i class="codicon ${iconClass}"></i> <span class="progress-text"></span>`;
        const textSpan = item.querySelector('.progress-text');
        if (textSpan) {
            textSpan.textContent = text;
        }
        console.log(`[renderProgressItem] Checking for diff icon: type=${type}, diffType=${diffType}, text="${text}", extractedPath=${relativePath}`); 
        const showDiffIcon = (type.toUpperCase() === 'FILE' && text.startsWith('Editando arquivo:') && diffType === 'generation') ||
                             (type.toUpperCase() === 'REVERTED' && text.startsWith('Arquivo revertido:') && diffType === 'undo');
        console.log(`[renderProgressItem] Condition check: showDiffIcon=${showDiffIcon}, relativePath=${!!relativePath}`); 
        if (showDiffIcon && relativePath) {
            console.log(`[renderProgressItem] Adding diff icon for ${relativePath}`); 
            const diffIcon = document.createElement('i');
            diffIcon.classList.add('codicon', 'codicon-diff', 'diff-icon');
            diffIcon.title = `Mostrar diferenças para ${relativePath}`; 
            diffIcon.dataset.relativePath = relativePath;
            diffIcon.dataset.diffType = diffType; 
            diffIcon.addEventListener('click', handleDiffClick);
            item.appendChild(diffIcon);
        }
        progressList.appendChild(item);
        if (progressList.scrollHeight - progressList.scrollTop <= progressList.clientHeight + 50) {
             progressList.scrollTop = progressList.scrollHeight;
        }
    }
    function handleDiffClick(event) {
        const icon = event.currentTarget;
        const relativePath = icon.dataset.relativePath;
        if (relativePath) {
            console.log(`[Webview] Diff icon clicked for path: ${relativePath}`);
            const diffType = icon.dataset.diffType || 'generation'; 
            console.log(`[Webview] Posting 'showDiff' for path: ${relativePath}, type: ${diffType}`);
            vscode.postMessage({ command: 'showDiff', path: relativePath, type: diffType });
        } else {
            console.warn("[Webview] Diff icon clicked but no relative path found in dataset.");
        }
    }
    function showTemporaryButtonText(button, text, duration = 1500) {
        if (!button) return;
        const originalHTML = button.innerHTML; 
        const originalDisabled = button.disabled;
        button.innerHTML = text; 
        button.disabled = true;
        setTimeout(() => {
            button.innerHTML = originalHTML; 
            button.disabled = originalDisabled;
        }, duration);
    }
    function appendAdditionalPrompt(basePrompt) {
        if (additionalPrompt && additionalPrompt.trim().length > 0) {
            return `${basePrompt}\n\nAdditional prompt:\n${additionalPrompt.trim()}`; 
        }
        return basePrompt;
    }
    generateButton?.addEventListener('click', () => {
        if (isGenerating) return;
        const text = structureInput?.value;
        if (!text || text.trim().length === 0) {
            vscode.postMessage({ command: 'showError', text: 'Por favor, cole o texto da estrutura na área designada.' });
            return;
        }
        isGenerating = true;
        generateButton.disabled = true;
              generateButton.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Generating...'; 
        if (progressList) progressList.innerHTML = ''; 
        if (progressContainer) progressContainer.style.display = 'flex'; 
        console.log("[Webview] Sending 'generateStructure' message to extension.");
        vscode.postMessage({ command: 'generateStructure', text: text });
    });
    copyWinPromptButton?.addEventListener('click', () => {
        const promptToCopy = appendAdditionalPrompt(PROMPT_TEXT_TO_COPY_WIN);
        navigator.clipboard.writeText(promptToCopy).then(() => {
            console.log('[Webview] Win Prompt (with additions) copied to clipboard.');
            showTemporaryButtonText(copyWinPromptButton, 'Copied!'); 
        }).catch(err => {
            console.error('[Webview] Failed to copy Win prompt:', err);
            showTemporaryButtonText(copyWinPromptButton, 'Failed!'); 
            vscode.postMessage({ command: 'showError', text: 'Falha ao copiar prompt do Windows para a área de transferência.' });
        });
    });
    copyLinuxPromptButton?.addEventListener('click', () => {
        const promptToCopy = appendAdditionalPrompt(PROMPT_TEXT_TO_COPY_LINUX);
        navigator.clipboard.writeText(promptToCopy).then(() => {
            console.log('[Webview] Linux Prompt (with additions) copied to clipboard.');
            showTemporaryButtonText(copyLinuxPromptButton, 'Copied!'); 
        }).catch(err => {
            console.error('[Webview] Failed to copy Linux prompt:', err);
            showTemporaryButtonText(copyLinuxPromptButton, 'Failed!'); 
            vscode.postMessage({ command: 'showError', text: 'Falha ao copiar prompt do Linux para a área de transferência.' });
        });
    });
    promptSettingsButton?.addEventListener('click', () => {
        settingsSectionVisible = !settingsSectionVisible;
        if (promptSettingsSection) {
            promptSettingsSection.style.display = settingsSectionVisible ? 'block' : 'none';
        }
        if (settingsSectionVisible && additionalPromptInput) {
            additionalPromptInput.value = additionalPrompt || '';
            additionalPromptInput.focus(); 
        }
        console.log(`[Webview] Toggled settings section visibility to: ${settingsSectionVisible}`);
    });
    saveAdditionalPromptButton?.addEventListener('click', () => {
        const newAdditionalPrompt = additionalPromptInput?.value || '';
        console.log(`[Webview] Saving additional prompt: "${newAdditionalPrompt}"`);
        vscode.postMessage({ command: 'saveAdditionalPrompt', text: newAdditionalPrompt });
        additionalPrompt = newAdditionalPrompt; 
        showTemporaryButtonText(saveAdditionalPromptButton, 'Saved!');
        settingsSectionVisible = false;
        if (promptSettingsSection) {
            promptSettingsSection.style.display = 'none';
        }
    });
    undoButton?.addEventListener('click', () => {
        if (isGenerating) return; 
        console.log("[Webview] Sending 'undoLastGeneration' message to extension.");
        vscode.postMessage({ command: 'undoLastGeneration' });
    });
    refreshTreeButton?.addEventListener('click', () => {
        hideContextMenu(contextMenu);
        currentContextMenuTarget = null;
        vscode.postMessage({ command: 'getStructure' });
    });
    copySelectedButton?.addEventListener('click', () => {
         hideContextMenu(contextMenu);
         currentContextMenuTarget = null;
        const selectedFilePaths = getSelectedFilePaths(fileTree);
        if (selectedFilePaths.length > 0) {
            console.log('[Webview Copy] Posting copySelectedFilesContent for paths:', selectedFilePaths);
            vscode.postMessage({ command: 'copySelectedFilesContent', paths: selectedFilePaths });
        } else {
            vscode.postMessage({ command: 'showInfo', text: 'No files selected for copying.' });
        }
    });
    fileTreeContainer?.addEventListener('contextmenu', (event) => {
        const targetElement = event.target.closest('.node-content, .file-tree-container');
        if (targetElement) {
            const targetLi = showContextMenu(
                event, targetElement, contextMenu, fileTreeContainer,
                () => getSelectedFilePaths(fileTree), vscode
            );
            currentContextMenuTarget = targetLi;
        } else {
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
        }
    });
    document.addEventListener('click', (event) => {
        const isClickInsideContextMenu = contextMenu?.contains(event.target);
        const isClickInsideSettings = promptSettingsSection?.contains(event.target);
        const isClickOnSettingsButton = promptSettingsButton?.contains(event.target);
        if (contextMenu?.classList.contains('active') && !isClickInsideContextMenu) {
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
        }
        if (settingsSectionVisible && !isClickInsideSettings && !isClickOnSettingsButton) {
             settingsSectionVisible = false;
             if (promptSettingsSection) {
                 promptSettingsSection.style.display = 'none';
             }
             console.log("[Webview] Click outside settings section, hiding it.");
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && contextMenu?.classList.contains('active')) {
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
        }
        if (event.key === 'Escape' && settingsSectionVisible) {
             settingsSectionVisible = false;
             if (promptSettingsSection) {
                 promptSettingsSection.style.display = 'none';
             }
             console.log("[Webview] Escape pressed, hiding settings section.");
        }
    });
    window.addEventListener('message', event => {
        const message = event.data;
        console.log("[Webview] Mensagem recebida:", message.command, message.data || message.text || '');
        switch (message.command) {
            case 'structureData':
                isTreeLoaded = true;
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                if (explorerTitle) explorerTitle.textContent = message.workspaceFolderName || 'Workspace';
                if (message.error) {
                    if (fileTree) fileTree.innerHTML = '';
                    if (fileTree) fileTree.style.display = 'none';
                    if (treePlaceholder) {
                                          treePlaceholder.textContent = `Error loading structure: ${message.error}`; 
                        treePlaceholder.style.display = 'block';
                    }
                    console.error("[Webview] Error loading structure:", message.error);
                } else if (message.data && Array.isArray(message.data) && message.data.length > 0) {
                                              if (fileTree) {
                                                   renderTree(
                                                       message.data,
                                                       fileTree,
                                                       handleCheckboxChange,   
                                                       updateCopyButtonState,  
                                                       fileTree,               
                                                       copySelectedButton,     
                                                       vscode                  
                                                   );
                                                   fileTree.style.display = 'block';
                                               }
                    if (treePlaceholder) treePlaceholder.style.display = 'none';
                    console.log("[Webview] Structure data rendered.");
                } else {
                    if (fileTree) fileTree.innerHTML = '';
                    if (fileTree) fileTree.style.display = 'none';
                    if (treePlaceholder) {
                                          treePlaceholder.textContent = 'No workspace folder open or folder is empty.'; 
                        treePlaceholder.style.display = 'block';
                    }
                     console.log("[Webview] No structure data received or workspace empty.");
                }
                if (copySelectedButton && fileTree) updateCopyButtonState(copySelectedButton, fileTree);
                break;
            case 'setLoading':
                if (loadingIndicator) loadingIndicator.style.display = message.isLoading ? 'flex' : 'none';
                if (message.isLoading) {
                    if (fileTree) fileTree.style.display = 'none';
                    if (treePlaceholder) treePlaceholder.style.display = 'none';
                }
                hideContextMenu(contextMenu); currentContextMenuTarget = null;
                break;
            case 'workspaceChanged':
                 if (fileTree) fileTree.innerHTML = '';
                 if (treePlaceholder) {
                                    treePlaceholder.textContent = 'Workspace changed. Click Refresh.'; 
                     treePlaceholder.style.display = 'block';
                 }
                 if (fileTree) fileTree.style.display = 'none';
                 isTreeLoaded = false;
                 if (copySelectedButton && fileTree) updateCopyButtonState(copySelectedButton, fileTree);
                 hideContextMenu(contextMenu); currentContextMenuTarget = null;
                 break;
            case 'generationProgress':
                console.log("[Webview] Received 'generationProgress' message.");
                if (message.progress && Array.isArray(message.progress)) {
                    console.log(`[Webview] Processing ${message.progress.length} progress items.`);
                    message.progress.forEach(line => {
                        const { type, text } = parseProgressMessage(line);
                        renderProgressItem(type, text, 'generation'); 
                    });
                } else {
                    console.warn("[Webview] 'generationProgress' message received without valid progress array:", message.progress);
                }
                break;
            case 'generationFinished':
                isGenerating = false; 
                console.log(`[Webview] Recebida mensagem 'generationFinished'. Sucesso: ${message.success}. isGenerating definido como false.`);
                if (generateButton) {
                    console.log("[Webview] Resetando estado do botão de geração...");
                    generateButton.disabled = false;
                                   generateButton.innerHTML = '<i class="codicon codicon-sparkle"></i> Generate'; 
                    console.log(`[Webview] --> Button state reset complete.`);
                } else {
                    console.warn("[Webview] Generate button not found when trying to reset state.");
                }
                break;
                        case 'undoProgressStart':
                            console.log("[Webview] Received 'undoProgressStart'. Clearing progress list.");
                            if (progressList) progressList.innerHTML = ''; 
                            if (progressContainer) progressContainer.style.display = 'flex'; 
                            renderProgressItem('INFO', message.message || 'Iniciando desfazer...'); 
                             if (undoButton) undoButton.disabled = true;
                            break;
                        case 'undoProgress':
                            console.log("[Webview] Received 'undoProgress'.");
                            if (message.progress && Array.isArray(message.progress)) {
                                 console.log(`[Webview] Processing ${message.progress.length} undo progress items.`);
                                 message.progress.forEach(item => {
                                                                renderProgressItem('REVERTED', `Arquivo revertido: ${item.relativePath}`, 'undo'); 
                                 });
                            } else {
                                 console.warn("[Webview] 'undoProgress' message received without valid progress array:", message.progress);
                            }
                            break;
                         case 'undoFinished':
                             console.log(`[Webview] Received 'undoFinished'. Success: ${message.success}`);
                                                  renderProgressItem(message.success ? 'SUCCESS' : 'ERROR', message.success ? 'Undo completed successfully.' : 'Undo failed.'); 
                             break;
                         case 'undoProgressError':
                             console.error(`[Webview] Received 'undoProgressError': ${message.message}`);
                                                  renderProgressItem('ERROR', `Error during undo: ${message.message}`); 
                             break;
               case 'updateUndoState':
                console.log(`[Webview] Received 'updateUndoState'. Can Undo: ${message.canUndo}`);
                if (undoButton) {
                	undoButton.disabled = !message.canUndo;
                } else {
                	console.warn("[Webview] Undo button not found when trying to update state.");
                }
                break;
            case 'updateAdditionalPrompt':
                additionalPrompt = message.text || '';
                console.log(`[Webview] Received 'updateAdditionalPrompt'. Additional prompt set to: "${additionalPrompt}"`);
                if (settingsSectionVisible && additionalPromptInput) {
                    additionalPromptInput.value = additionalPrompt;
                }
                break;
            case 'showError':
                vscode.postMessage({ command: 'showError', text: message.text });
                if (progressList) {
                                   renderProgressItem('ERROR', `VS Code Error: ${message.text}`); 
                }
                if (isGenerating) {
                    isGenerating = false;
                    if (generateButton) {
                        generateButton.disabled = false;
                                          generateButton.innerHTML = '<i class="codicon codicon-sparkle"></i> Generate'; 
                    }
                }
                break;
            case 'showInfo':
                 vscode.postMessage({ command: 'showInfo', text: message.text });
                break;
        }
    });
    console.log("Script do Webview carregado.");
    if (fileTreeContainer) {
        console.log("Solicitando estrutura inicial para visualização do Sistema de Cópia.");
        vscode.postMessage({ command: 'getStructure' }); 
        updateCopyButtonState(copySelectedButton, fileTree); 
    } else {
        console.log("Structure view loaded.");
        if (progressContainer) progressContainer.style.display = 'none'; 
        console.log("[Webview] Requesting initial undo state.");
        vscode.postMessage({ command: 'requestInitialUndoState' });
        console.log("[Webview] Requesting initial additional prompt.");
        vscode.postMessage({ command: 'requestInitialAdditionalPrompt' });
        if (promptSettingsSection) {
            promptSettingsSection.style.display = 'none';
            console.log("[Webview] Initializing prompt settings section as hidden.");
        }
    }
    const explorerActions = document.querySelector('.explorer-actions');
    if (explorerActions) {
        let copyTextBtn = document.getElementById('copySelectedButton');
        let copyFileBtn = document.getElementById('copyCombinedFileButton');
        if (copyTextBtn) explorerActions.removeChild(copyTextBtn);
        if (copyFileBtn) explorerActions.removeChild(copyFileBtn);
        copyTextBtn = document.createElement('button');
        copyTextBtn.id = 'copySelectedButton';
        copyTextBtn.title = 'Copy plain text from selected files';
        copyTextBtn.innerHTML = '<i class="codicon codicon-clippy"></i>';
        explorerActions.appendChild(copyTextBtn);
        copyFileBtn = document.createElement('button');
        copyFileBtn.id = 'copyCombinedFileButton';
        copyFileBtn.title = 'Copy a file with all selected files\' contents';
        copyFileBtn.innerHTML = '<i class="codicon codicon-copy"></i>';
        explorerActions.appendChild(copyFileBtn);
        copyTextBtn.onclick = () => {
            const selectedFilePaths = getSelectedFilePaths(fileTree);
            if (selectedFilePaths.length > 0) {
                vscode.postMessage({ command: 'copySelectedFiles', paths: selectedFilePaths });
            } else {
                vscode.postMessage({ command: 'showInfo', text: 'No files selected for copying.' });
            }
        };
        copyFileBtn.onclick = () => {
            const selectedFilePaths = getSelectedFilePaths(fileTree);
            if (selectedFilePaths.length > 0) {
                vscode.postMessage({ command: 'copyFilesToClipboard', paths: selectedFilePaths });
            } else {
                vscode.postMessage({ command: 'showInfo', text: 'No files selected for copying.' });
            }
        };
    }
})(); 
