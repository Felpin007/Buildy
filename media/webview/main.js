import { getSelectedFilePaths, updateCopyButtonState, handleCheckboxChange } from './checkboxUtils.js';
import { showContextMenu, hideContextMenu } from './contextMenu.js';
import { renderTree } from './treeView.js';
/**
 * Módulo principal do webview da extensão Buildy
 * Gerencia a interface do usuário e a comunicação com a extensão VS Code
 */
(function() {
    let vscode;
    try {
        vscode = acquireVsCodeApi();
    } catch (e) {
        console.error("Não foi possível adquirir acquireVsCodeApi. Comunicação do Webview desativada.", e);
        const generateButton = document.getElementById('generateButton');
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.textContent = 'Error: VS Code API unavailable';
        }
        const progressContainer = document.getElementById('generationProgressContainer');
        if (progressContainer) progressContainer.style.display = 'none';
        return;
    }
    
    // Variáveis para armazenar o conteúdo dos prompts carregados dos arquivos externos
    let windowsPromptContent = '';
    let linuxPromptContent = '';

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
    /**
     * Analisa uma mensagem de progresso para extrair o tipo e o texto
     * @param {string} message - Mensagem de progresso no formato "PROGRESS::TIPO::TEXTO"
     * @returns {Object} Objeto contendo o tipo e o texto da mensagem
     */
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
    /**
     * Renderiza um item de progresso na lista de progresso
     * @param {string} type - Tipo de mensagem (INFO, SUCCESS, ERROR, etc.)
     * @param {string} text - Texto da mensagem
     * @param {string} diffType - Tipo de diff para o botão de visualização de mudanças
     * @returns {HTMLElement} O elemento criado e adicionado à lista
     */
    function renderProgressItem(type, text, diffType = 'generation') { 
        if (!progressList) return;
        let relativePath = null;
        const pathMatch = text.match(/^(?:(?:Escrevendo|Editando) arquivo:\s*(.*))|(?:Arquivo revertido:\s*(.*))|(?:Criando diretório:\s*(.*))/);
        if (pathMatch) {
            relativePath = pathMatch[1] || pathMatch[2] || pathMatch[3];
        }
        const item = document.createElement('div');
        item.className = `progress-item ${type.toLowerCase()}`;
        const iconSpan = document.createElement('span');
        iconSpan.className = 'progress-icon';
        let iconClass = '';
        switch (type) {
            case 'INFO':
                iconClass = 'codicon-info';
                break;
            case 'SUCCESS':
                iconClass = 'codicon-check';
                break;
            case 'ERROR':
                iconClass = 'codicon-error';
                break;
            case 'WARNING':
                iconClass = 'codicon-warning';
                break;
            case 'COMMAND':
                iconClass = 'codicon-terminal';
                break;
            case 'FILE':
                iconClass = 'codicon-file';
                break;
            case 'REVERTED':
                iconClass = 'codicon-discard';
                break;
            default:
                iconClass = 'codicon-circle-filled';
        }
        iconSpan.innerHTML = `<i class="codicon ${iconClass}"></i>`;
        item.appendChild(iconSpan);
        const textSpan = document.createElement('span');
        textSpan.className = 'progress-text';
        textSpan.textContent = text;
        item.appendChild(textSpan);
        if (relativePath && diffType) {
            const diffButton = document.createElement('button');
            diffButton.className = 'diff-button';
            diffButton.title = 'Show changes';
            diffButton.innerHTML = '<i class="codicon codicon-diff"></i>';
            diffButton.dataset.path = relativePath;
            diffButton.dataset.type = diffType;
            diffButton.addEventListener('click', handleDiffClick);
            item.appendChild(diffButton);
        }
        progressList.appendChild(item);
        progressList.scrollTop = progressList.scrollHeight;
        return item;
    }
    /**
     * Manipula o clique no botão de visualização de diff
     * @param {Event} event - Evento de clique
     */
    function handleDiffClick(event) {
        const button = event.currentTarget;
        const path = button.dataset.path;
        const type = button.dataset.type;
        if (path && type) {
            console.log(`[Webview] Solicitando diff para: ${path}, tipo: ${type}`);
            vscode.postMessage({ command: 'showDiff', path: path, type: type });
        }
    }
    /**
     * Mostra um texto temporário em um botão e depois restaura o texto original
     * @param {HTMLButtonElement} button - Botão a ser modificado
     * @param {string} text - Texto temporário a ser exibido
     * @param {number} duration - Duração em milissegundos para exibir o texto
     */
    function showTemporaryButtonText(button, text, duration = 1500) {
        if (!button) return;
        const originalText = button.innerHTML;
        button.innerHTML = text;
        setTimeout(() => {
            button.innerHTML = originalText;
        }, duration);
    }
    /**
     * Adiciona o prompt adicional ao prompt base
     * @param {string} basePrompt - Prompt base a ser estendido
     * @returns {string} Prompt completo com as instruções adicionais
     */
    function appendAdditionalPrompt(basePrompt) {
        if (!additionalPrompt || additionalPrompt.trim() === '') {
            return basePrompt;
        }
        return basePrompt + '\n\n' + additionalPrompt;
    }
    
    // Solicitar o conteúdo dos prompts ao carregar a página
    /**
     * Solicita o conteúdo dos prompts para Windows e Linux à extensão
     */
    function requestPromptContent() {
        vscode.postMessage({ command: 'getPromptContent', platform: 'windows' });
        vscode.postMessage({ command: 'getPromptContent', platform: 'linux' });
    }
    generateButton?.addEventListener('click', () => {
        if (isGenerating) return;
        const text = structureInput?.value;
        if (!text || text.trim().length === 0) {
            vscode.postMessage({ command: 'showError', text: 'Please paste the structure text in the designated area.' });
            return;
        }
        isGenerating = true;
        console.log(`[Webview] Botão de geração clicado. isGenerating definido como true.`);
        if (progressList) progressList.innerHTML = '';
        if (progressContainer) progressContainer.style.display = 'flex';
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Generating...';
        }
        vscode.postMessage({ command: 'generateStructure', text: text });
    });
    copyWinPromptButton?.addEventListener('click', () => {
        if (!windowsPromptContent) {
            vscode.postMessage({ command: 'getPromptContent', platform: 'windows' });
            return;
        }
        navigator.clipboard.writeText(windowsPromptContent)
            .then(() => {
                showTemporaryButtonText(copyWinPromptButton, 'Copied!', 1500);
            })
            .catch(err => {
                console.error('Erro ao copiar para a área de transferência:', err);
                vscode.postMessage({ command: 'showError', text: 'Could not copy to clipboard.' });
            });
    });
    
    copyLinuxPromptButton?.addEventListener('click', () => {
        if (!linuxPromptContent) {
            vscode.postMessage({ command: 'getPromptContent', platform: 'linux' });
            return;
        }
        navigator.clipboard.writeText(linuxPromptContent)
            .then(() => {
                showTemporaryButtonText(copyLinuxPromptButton, 'Copied!', 1500);
            })
            .catch(err => {
                console.error('Erro ao copiar para a área de transferência:', err);
                vscode.postMessage({ command: 'showError', text: 'Could not copy to clipboard.' });
            });
    });
    promptSettingsButton?.addEventListener('click', () => {
        settingsSectionVisible = !settingsSectionVisible;
        if (promptSettingsSection) {
            promptSettingsSection.style.display = settingsSectionVisible ? 'block' : 'none';
        }
    });
    saveAdditionalPromptButton?.addEventListener('click', () => {
        if (additionalPromptInput) {
            additionalPrompt = additionalPromptInput.value;
            vscode.postMessage({ command: 'saveAdditionalPrompt', text: additionalPrompt });
            showTemporaryButtonText(saveAdditionalPromptButton, 'Saved!');
        }
    });
    undoButton?.addEventListener('click', () => {
        if (undoButton.disabled) return;
        console.log("[Webview] Undo button clicked.");
        if (confirm('Are you sure you want to undo the last generation? This will revert all changes made by the last generation.')) {
            console.log("[Webview] Undo confirmed, sending message to extension.");
            vscode.postMessage({ command: 'undoLastGeneration' });
        }
    });
    refreshTreeButton?.addEventListener('click', () => {
        console.log("[Webview] Refresh button clicked, requesting structure.");
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (fileTree) fileTree.style.display = 'none';
        if (treePlaceholder) treePlaceholder.style.display = 'none';
        vscode.postMessage({ command: 'getStructure' });
    });
    copySelectedButton?.addEventListener('click', () => {
        const selectedFilePaths = getSelectedFilePaths(fileTree);
        if (selectedFilePaths.length > 0) {
            console.log(`[Webview] Copy selected button clicked. Selected paths: ${selectedFilePaths.length}`);
            vscode.postMessage({ command: 'copySelectedFilesContent', paths: selectedFilePaths });
        } else {
            vscode.postMessage({ command: 'showInfo', text: 'No files selected for copying.' });
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
        if (promptSettingsSection && !isClickInsideSettings && !isClickOnSettingsButton && settingsSectionVisible) {
            settingsSectionVisible = false;
            promptSettingsSection.style.display = 'none';
        }
    });
    window.addEventListener('message', event => {
        const message = event.data;
        console.log("[Webview] Mensagem recebida:", message.command, message.data || message.text || '');
        switch (message.command) {
            case 'promptContent':
                if (message.platform === 'windows') {
                    windowsPromptContent = message.content;
                    console.log("[Webview] Conteúdo do prompt Windows recebido");
                } else if (message.platform === 'linux') {
                    linuxPromptContent = message.content;
                    console.log("[Webview] Conteúdo do prompt Linux recebido");
                }
                return;
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
                            contextMenu,            
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
                renderProgressItem('INFO', message.message || 'Starting undo...'); 
                if (undoButton) undoButton.disabled = true;
                break;
            case 'undoProgress':
                console.log("[Webview] Received 'undoProgress'.");
                if (message.progress && Array.isArray(message.progress)) {
                    console.log(`[Webview] Processing ${message.progress.length} undo progress items.`);
                    message.progress.forEach(item => {
                        renderProgressItem('REVERTED', `File reverted: ${item.relativePath}`, 'undo'); 
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
    requestPromptContent();
    if (fileTreeContainer) {
        console.log("Solicitando estrutura inicial para visualização do Sistema de Cópia.");
        vscode.postMessage({ command: 'getStructure' }); 
        requestPromptContent(); 
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
