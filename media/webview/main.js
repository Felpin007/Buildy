// media/webview/main.js

// Import necessary functions from modules
import { getSelectedFilePaths, updateCopyButtonState, handleCheckboxChange } from './checkboxUtils.js';
import { showContextMenu, hideContextMenu } from './contextMenu.js';
import { renderTree } from './treeView.js';
(function() {
    // Get VS Code API instance for communication
    // It's important this is declared and assigned correctly.
    // Ensure acquireVsCodeApi() is available in the webview context.
    let vscode;
    try {
        vscode = acquireVsCodeApi();
    } catch (e) {
        console.error("Could not acquire acquireVsCodeApi. Webview communication disabled.", e);
        // Provide fallback or disable functionality if API is not available
        // For example, disable the button or show an error message in the UI
        const generateButton = document.getElementById('generateButton');
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.textContent = 'Error: VS Code API unavailable';
        }
        return; // Stop execution if API is not available
    }


    // --- DOM Elements ---
    const webviewContainer = document.querySelector('.content-wrapper');
    const generateButton = document.getElementById('generateButton');
    const structureInput = document.getElementById('structureInput');

    // Track webview click/focus state
    const handleDocumentClick = (e) => {
        const isInside = webviewContainer.contains(e.target);
        webviewContainer.classList.toggle('webview-focused', isInside);
    };

    document.addEventListener('click', handleDocumentClick);
    
    // Also track focus for keyboard navigation
    webviewContainer?.addEventListener('focusin', () => {
        webviewContainer.classList.add('webview-focused');
    });

    // Clean up listener when webview is destroyed
    window.addEventListener('unload', () => {
        document.removeEventListener('click', handleDocumentClick);
    });
    const refreshTreeButton = document.getElementById('refreshTreeButton');
    const copySelectedButton = document.getElementById('copySelectedButton');
    // const deleteSelectedButton = document.getElementById('deleteSelectedButton'); // Delete button removed
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    const fileTree = document.getElementById('fileTree');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const treePlaceholder = document.getElementById('treePlaceholder');
    // const newFileButton = document.getElementById('newFileButton'); // Removed
    // const newFolderButton = document.getElementById('newFolderButton'); // Removed
    const contextMenu = document.getElementById('explorerContextMenu');
    const explorerTitle = document.getElementById('explorerTitle');

    // --- State Variables ---
    let isTreeLoaded = false; // Flag to track if the tree has been loaded at least once
    let currentContextMenuTarget = null; // Stores the LI element targeted by the context menu

    // --- Event Listeners ---

    // Generate button click
    generateButton?.addEventListener('click', () => {
        // Access value directly, assuming structureInput is a textarea
        const text = structureInput?.value;

        if (text && text.trim().length > 0) {
            vscode.postMessage({ command: 'generateStructure', text: text });
        } else {
            // Use vscode API to show messages if available
             if (vscode) {
                vscode.postMessage({ command: 'showError', text: 'Por favor, cole o texto da estrutura na área designada.' });
            } else {
                // Fallback if vscode API is somehow unavailable after initial check
                alert('Por favor, cole o texto da estrutura na área designada.');
            }
        }
    });
// Refresh button click
refreshTreeButton?.addEventListener('click', () => {
    hideContextMenu(contextMenu);
    currentContextMenuTarget = null;
    vscode.postMessage({ command: 'getStructure' });
});

// Copy button click
copySelectedButton?.addEventListener('click', () => {
     hideContextMenu(contextMenu);
     currentContextMenuTarget = null;
    const selectedFilePaths = getSelectedFilePaths(fileTree);
    if (selectedFilePaths.length > 0) {
        console.log('[Webview Copy] Posting copySelectedFiles for paths:', selectedFilePaths);
        // Ask backend to read files and copy content
        vscode.postMessage({ command: 'copySelectedFilesContent', paths: selectedFilePaths });
    } else {
        vscode.postMessage({ command: 'showInfo', text: 'Nenhum arquivo selecionado para cópia.' });
    }
});

// Delete, New File, New Folder button listeners removed

 // Context Menu Listener (delegated to container)
 fileTreeContainer?.addEventListener('contextmenu', (event) => {
     const targetElement = event.target.closest('.node-content, .file-tree-container');
     if (targetElement) {
         // Pass necessary elements and functions to the imported showContextMenu
         const targetLi = showContextMenu(
             event,
             targetElement,
             contextMenu,
             fileTreeContainer,
             () => getSelectedFilePaths(fileTree), // Pass function to get selected FILES
             vscode // Pass vscode API
         );
         currentContextMenuTarget = targetLi; // Store the returned target LI
     } else {
         hideContextMenu(contextMenu);
         currentContextMenuTarget = null;
     }
 });

 // Global listeners to hide context menu
 document.addEventListener('click', (event) => {
     if (contextMenu?.classList.contains('active') && !contextMenu.contains(event.target)) {
         hideContextMenu(contextMenu);
         currentContextMenuTarget = null;
     }
 });
 document.addEventListener('keydown', (event) => {
     if (event.key === 'Escape' && contextMenu?.classList.contains('active')) {
         hideContextMenu(contextMenu);
         currentContextMenuTarget = null;
     }
 });


// --- Message Listener from Extension ---
window.addEventListener('message', event => {
    const message = event.data;
    console.log("[Webview] Message received:", message.command);

    switch (message.command) {
        case 'structureData':
            isTreeLoaded = true;
            loadingIndicator.style.display = 'none';
            explorerTitle.textContent = message.workspaceFolderName || 'Workspace'; // Update title

            if (message.error) {
                treePlaceholder.textContent = `Erro: ${message.error === 'No workspace open' ? 'Nenhuma pasta de workspace aberta.' : message.error}`;
                treePlaceholder.style.display = 'block';
                fileTree.style.display = 'none';
                fileTree.innerHTML = '';
            } else if (message.data && message.data.length > 0) {
                treePlaceholder.style.display = 'none';
                fileTree.style.display = 'block';
                // Call imported renderTree, passing necessary handlers and elements
                renderTree(
                    message.data,
                    fileTree, // parentElement for renderTree
                    handleCheckboxChange, // Pass imported function from checkboxUtils
                    updateCopyButtonState, // Pass imported function from checkboxUtils
                    fileTree, // Pass fileTree element again (needed by handlers)
                    copySelectedButton, // Pass copy button element
                    vscode // Pass the vscode API object
                );
            } else {
                treePlaceholder.textContent = 'Workspace vazio ou nenhum item encontrado.';
                treePlaceholder.style.display = 'block';
                fileTree.style.display = 'none';
                fileTree.innerHTML = '';
            }
            updateCopyButtonState(copySelectedButton, fileTree); // Initial state update
            // Handle active file highlight if needed (using message.activeFilePath)
            // setActiveFileHighlight(message.activeFilePath); // Implement this function if needed
            break;

        case 'setLoading':
            loadingIndicator.style.display = message.isLoading ? 'flex' : 'none';
            if (message.isLoading) {
                treePlaceholder.style.display = 'none';
                fileTree.style.display = 'none';
                fileTree.innerHTML = '';
            }
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
            break;

        case 'workspaceChanged':
             fileTree.innerHTML = '';
             treePlaceholder.textContent = 'Workspace alterado ou fechado. Carregando...';
             treePlaceholder.style.display = 'block';
             fileTree.style.display = 'none';
             isTreeLoaded = false;
             updateCopyButtonState(copySelectedButton, fileTree);
             hideContextMenu(contextMenu);
             currentContextMenuTarget = null;
             break;

        // case 'setActiveFile': // Add back if needed
        //     setActiveFileHighlight(message.path);
        //     break;

        // Keep showError and showInfo if StructureViewProvider sends them
        case 'showError':
            // Potentially display error inline in the webview or rely on vscode.window messages
            break;
        case 'showInfo':
            // Potentially display info inline
            break;
    }
});
    // Extra closing }); removed

    // --- Initial Setup ---
    console.log("Webview script loaded. Requesting initial structure.");
    vscode.postMessage({ command: 'getStructure' }); // Request tree on load
    updateCopyButtonState(copySelectedButton, fileTree); // Initial button state

})(); // End of IIFE