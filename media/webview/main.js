// --- media/webview/main.js ---

// media/webview/main.js

// Import necessary functions from modules
// Ensure imports are correct for basic functionality
import { getSelectedFilePaths, updateCopyButtonState, handleCheckboxChange } from './checkboxUtils.js';
import { showContextMenu, hideContextMenu } from './contextMenu.js';
import { renderTree } from './treeView.js';

(function() {
    // Get VS Code API instance
    let vscode;
    try {
        vscode = acquireVsCodeApi();
    } catch (e) {
        console.error("Could not acquire acquireVsCodeApi. Webview communication disabled.", e);
        const generateButton = document.getElementById('generateButton');
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.textContent = 'Error: VS Code API unavailable';
        }
        const progressContainer = document.getElementById('generationProgressContainer');
        if (progressContainer) progressContainer.style.display = 'none';
        return;
    }

    // --- Constants ---
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
`.trim(); // Use trim() to remove leading/trailing whitespace from template literal

    // --- MODIFICATION START: Add Linux Prompt Constant ---
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
    // --- MODIFICATION END ---


    // --- DOM Elements ---
    const webviewContainer = document.querySelector('.content-wrapper');
    const generateButton = document.getElementById('generateButton');
    const structureInput = document.getElementById('structureInput');
    const copyWinPromptButton = document.getElementById('copyWinPromptButton'); // Renamed ID
    const copyLinuxPromptButton = document.getElementById('copyLinuxPromptButton'); // New button ID
    // --- MODIFICATION START: Add settings elements ---
    const promptSettingsButton = document.getElementById('promptSettingsButton');
    const promptSettingsSection = document.getElementById('promptSettingsSection');
    const additionalPromptInput = document.getElementById('additionalPromptInput');
    const saveAdditionalPromptButton = document.getElementById('saveAdditionalPromptButton');
    // --- MODIFICATION END ---
    const undoButton = document.getElementById('undoButton'); // Added Undo button
    const refreshTreeButton = document.getElementById('refreshTreeButton');
    const copySelectedButton = document.getElementById('copySelectedButton');
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    const fileTree = document.getElementById('fileTree'); // The UL element
    const loadingIndicator = document.getElementById('loadingIndicator');
    const treePlaceholder = document.getElementById('treePlaceholder');
    const contextMenu = document.getElementById('explorerContextMenu');
    const explorerTitle = document.getElementById('explorerTitle');
    const progressContainer = document.getElementById('generationProgressContainer');
    const progressList = document.getElementById('progressList');

    // --- State Variables ---
    let isTreeLoaded = false;
    let currentContextMenuTarget = null;
    let isGenerating = false;
    let additionalPrompt = ''; // Store the saved additional prompt text
    let settingsSectionVisible = false; // Track settings visibility

    // --- Helper Functions ---

    /** Parses progress message and returns type and text */
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

    /** Renders a single progress item to the list */
    // Add diffType parameter
    function renderProgressItem(type, text, diffType = 'generation') { // Default to 'generation'
        if (!progressList) return;

        let relativePath = null;
        // Update regex to capture path for "Reverted" items
        // Adjust regex for "File reverted:"
        // Update regex to match English prefixes from taskService
        // Handles "Writing file:", "Editing file:", "Reverted file:", "Creating directory:"
        const pathMatch = text.match(/^(?:Writing|Editing) file:\s*(.*)|(?:Reverted file):\s*(.*)|(?:Creating) directory:\s*(.*)/);
        if (pathMatch) {
            // Group 1: Writing/Editing file path
            // Group 2: Reverted file path
            // Group 3: Creating directory path
            relativePath = pathMatch[1] || pathMatch[2] || pathMatch[3];
        }

        const item = document.createElement('div');
        item.classList.add('progress-item');
        let iconClass = 'codicon-info';

        switch (type.toUpperCase()) {
            case 'COMMAND': item.classList.add('command'); iconClass = 'codicon-terminal'; break;
            // --- MODIFICATION START: Apply specific classes for file writing/editing ---
            case 'FILE':
                item.classList.add('file');
                iconClass = 'codicon-file-code'; // Same base icon for now
                // Add specific class based on the action
                if (text.startsWith('Writing file:')) {
                    item.classList.add('writing');
                } else if (text.startsWith('Editing file:')) {
                    item.classList.add('editing');
                }
                break;
            // --- MODIFICATION END ---
            case 'DIR': item.classList.add('dir'); iconClass = 'codicon-folder'; break;
            case 'SUCCESS': item.classList.add('success'); iconClass = 'codicon-check'; break;
            case 'ERROR': item.classList.add('error'); iconClass = 'codicon-error'; break;
            case 'INFO': item.classList.add('info'); iconClass = 'codicon-info'; break;
            // Add case for REVERTED type
            case 'REVERTED': item.classList.add('reverted'); iconClass = 'codicon-history'; break; // Use history icon for reverted
            default: item.classList.add('info'); iconClass = 'codicon-info'; break;
        }

        item.innerHTML = `<i class="codicon ${iconClass}"></i> <span class="progress-text"></span>`;
        const textSpan = item.querySelector('.progress-text');
        if (textSpan) {
            textSpan.textContent = text;
        }

        // Add logging and ensure diff icon logic
        console.log(`[renderProgressItem] Checking for diff icon: type=${type}, diffType=${diffType}, text="${text}", extractedPath=${relativePath}`); // Log values

        // Show diff for edited files during generation OR reverted files during undo
        // Ensure checks use English prefixes
        const showDiffIcon = (type.toUpperCase() === 'FILE' && text.startsWith('Editing file:') && diffType === 'generation') ||
                             (type.toUpperCase() === 'REVERTED' && text.startsWith('Reverted file:') && diffType === 'undo');

        console.log(`[renderProgressItem] Condition check: showDiffIcon=${showDiffIcon}, relativePath=${!!relativePath}`); // Log condition results

        if (showDiffIcon && relativePath) {
            console.log(`[renderProgressItem] Adding diff icon for ${relativePath}`); // Log icon addition
            const diffIcon = document.createElement('i');
            diffIcon.classList.add('codicon', 'codicon-diff', 'diff-icon');
            diffIcon.title = `Show differences for ${relativePath}`; // Keep English
            diffIcon.dataset.relativePath = relativePath;
            diffIcon.dataset.diffType = diffType; // Store the diff type
            diffIcon.addEventListener('click', handleDiffClick);
            item.appendChild(diffIcon);
        }

        progressList.appendChild(item);
        // Auto-scroll if near the bottom
        if (progressList.scrollHeight - progressList.scrollTop <= progressList.clientHeight + 50) {
             progressList.scrollTop = progressList.scrollHeight;
        }
    }

    /** Handles clicks on the diff icons */
    function handleDiffClick(event) {
        const icon = event.currentTarget;
        const relativePath = icon.dataset.relativePath;
        if (relativePath) {
            console.log(`[Webview] Diff icon clicked for path: ${relativePath}`);
            // Read diffType and send it
            const diffType = icon.dataset.diffType || 'generation'; // Default to generation if missing
            console.log(`[Webview] Posting 'showDiff' for path: ${relativePath}, type: ${diffType}`);
            vscode.postMessage({ command: 'showDiff', path: relativePath, type: diffType });
        } else {
            console.warn("[Webview] Diff icon clicked but no relative path found in dataset.");
        }
    }

    /** Shows temporary text on a button */
    function showTemporaryButtonText(button, text, duration = 1500) {
        if (!button) return;
        const originalHTML = button.innerHTML; // Store innerHTML to preserve icon
        const originalDisabled = button.disabled;
        button.innerHTML = text; // Set text directly
        button.disabled = true;
        setTimeout(() => {
            button.innerHTML = originalHTML; // Restore original HTML
            button.disabled = originalDisabled;
        }, duration);
    }

    // --- MODIFICATION START: Function to append additional prompt ---
    /** Appends the saved additional prompt text to a base prompt string */
    function appendAdditionalPrompt(basePrompt) {
        if (additionalPrompt && additionalPrompt.trim().length > 0) {
            return `${basePrompt}\n\nAdditional prompt:\n${additionalPrompt.trim()}`; // Translate label if needed
        }
        return basePrompt;
    }
    // --- MODIFICATION END ---


    // --- Event Listeners ---

    // Generate button click
    generateButton?.addEventListener('click', () => {
        if (isGenerating) return;
        const text = structureInput?.value;
        if (!text || text.trim().length === 0) {
            vscode.postMessage({ command: 'showError', text: 'Please paste the structure text in the designated area.' });
            return;
        }
        isGenerating = true;
        generateButton.disabled = true;
              generateButton.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Generating...'; // Keep English
        if (progressList) progressList.innerHTML = ''; // Clear previous progress
        if (progressContainer) progressContainer.style.display = 'flex'; // Show progress container
        console.log("[Webview] Sending 'generateStructure' message to extension.");
        vscode.postMessage({ command: 'generateStructure', text: text });
    });

    // --- MODIFICATION START: Update Prompt Button Listeners ---
    // Copy Win Prompt button click
    copyWinPromptButton?.addEventListener('click', () => {
        const promptToCopy = appendAdditionalPrompt(PROMPT_TEXT_TO_COPY_WIN);
        navigator.clipboard.writeText(promptToCopy).then(() => {
            console.log('[Webview] Win Prompt (with additions) copied to clipboard.');
            showTemporaryButtonText(copyWinPromptButton, 'Copied!'); // Use helper
        }).catch(err => {
            console.error('[Webview] Failed to copy Win prompt:', err);
            showTemporaryButtonText(copyWinPromptButton, 'Failed!'); // Use helper
            vscode.postMessage({ command: 'showError', text: 'Failed to copy Win prompt to clipboard.' });
        });
    });

    // Copy Linux Prompt button click
    copyLinuxPromptButton?.addEventListener('click', () => {
        const promptToCopy = appendAdditionalPrompt(PROMPT_TEXT_TO_COPY_LINUX);
        navigator.clipboard.writeText(promptToCopy).then(() => {
            console.log('[Webview] Linux Prompt (with additions) copied to clipboard.');
            showTemporaryButtonText(copyLinuxPromptButton, 'Copied!'); // Use helper
        }).catch(err => {
            console.error('[Webview] Failed to copy Linux prompt:', err);
            showTemporaryButtonText(copyLinuxPromptButton, 'Failed!'); // Use helper
            vscode.postMessage({ command: 'showError', text: 'Failed to copy Linux prompt to clipboard.' });
        });
    });
    // --- MODIFICATION END ---

    // --- MODIFICATION START: Add Settings Button Listeners ---
    promptSettingsButton?.addEventListener('click', () => {
        settingsSectionVisible = !settingsSectionVisible;
        if (promptSettingsSection) {
            promptSettingsSection.style.display = settingsSectionVisible ? 'block' : 'none';
        }
        if (settingsSectionVisible && additionalPromptInput) {
            // Load current value when showing
            additionalPromptInput.value = additionalPrompt || '';
            additionalPromptInput.focus(); // Focus the input
        }
        console.log(`[Webview] Toggled settings section visibility to: ${settingsSectionVisible}`);
    });

    saveAdditionalPromptButton?.addEventListener('click', () => {
        const newAdditionalPrompt = additionalPromptInput?.value || '';
        console.log(`[Webview] Saving additional prompt: "${newAdditionalPrompt}"`);
        vscode.postMessage({ command: 'saveAdditionalPrompt', text: newAdditionalPrompt });
        additionalPrompt = newAdditionalPrompt; // Update local state immediately
        showTemporaryButtonText(saveAdditionalPromptButton, 'Saved!');
        // Hide the section after saving
        settingsSectionVisible = false;
        if (promptSettingsSection) {
            promptSettingsSection.style.display = 'none';
        }
    });
    // --- MODIFICATION END ---

    // Undo button click
    undoButton?.addEventListener('click', () => {
        if (isGenerating) return; // Don't allow undo during generation

        // Ask backend to perform the undo using the last known checkpoint
        console.log("[Webview] Sending 'undoLastGeneration' message to extension.");
        vscode.postMessage({ command: 'undoLastGeneration' });

        // Optionally disable button and show feedback, backend response will handle final state
        // undoButton.disabled = true;
        // showTemporaryButtonText(undoButton, 'Undoing...'); // Use helper for temp text
    });

    // Refresh button click (Copy System View)
    refreshTreeButton?.addEventListener('click', () => {
        hideContextMenu(contextMenu);
        currentContextMenuTarget = null;
        vscode.postMessage({ command: 'getStructure' });
    });

    // Copy selected files button click (Copy System View)
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

    // Context Menu Listener (Copy System View)
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

    // Global listeners to hide context menu
    document.addEventListener('click', (event) => {
        // --- MODIFICATION START: Prevent settings section click from hiding context menu ---
        // Also prevent clicks inside the settings section from closing it unintentionally
        const isClickInsideContextMenu = contextMenu?.contains(event.target);
        const isClickInsideSettings = promptSettingsSection?.contains(event.target);
        const isClickOnSettingsButton = promptSettingsButton?.contains(event.target);

        if (contextMenu?.classList.contains('active') && !isClickInsideContextMenu) {
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
        }

        // Hide settings section if clicked outside of it or its button
        if (settingsSectionVisible && !isClickInsideSettings && !isClickOnSettingsButton) {
             settingsSectionVisible = false;
             if (promptSettingsSection) {
                 promptSettingsSection.style.display = 'none';
             }
             console.log("[Webview] Click outside settings section, hiding it.");
        }
        // --- MODIFICATION END ---
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && contextMenu?.classList.contains('active')) {
            hideContextMenu(contextMenu);
            currentContextMenuTarget = null;
        }
        // --- MODIFICATION START: Escape key also hides settings ---
        if (event.key === 'Escape' && settingsSectionVisible) {
             settingsSectionVisible = false;
             if (promptSettingsSection) {
                 promptSettingsSection.style.display = 'none';
             }
             console.log("[Webview] Escape pressed, hiding settings section.");
        }
        // --- MODIFICATION END ---
    });

    // --- Message Listener from Extension ---
    window.addEventListener('message', event => {
        const message = event.data;
        console.log("[Webview] Message received:", message.command, message.data || message.text || '');

        switch (message.command) {
            // --- Copy System View Handlers ---
            case 'structureData':
                isTreeLoaded = true;
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                if (explorerTitle) explorerTitle.textContent = message.workspaceFolderName || 'Workspace';

                if (message.error) {
                    if (fileTree) fileTree.innerHTML = '';
                    if (fileTree) fileTree.style.display = 'none';
                    if (treePlaceholder) {
                                          treePlaceholder.textContent = `Error loading structure: ${message.error}`; // Keep English
                        treePlaceholder.style.display = 'block';
                    }
                    console.error("[Webview] Error loading structure:", message.error);
                } else if (message.data && Array.isArray(message.data) && message.data.length > 0) {
                                              if (fileTree) {
                                                   // Pass the necessary handlers to renderTree
                                                   renderTree(
                                                       message.data,
                                                       fileTree,
                                                       handleCheckboxChange,   // Pass the imported handler
                                                       updateCopyButtonState,  // Pass the imported handler
                                                       fileTree,               // Pass fileTree element
                                                       copySelectedButton,     // Pass button element
                                                       vscode                  // Pass vscode api
                                                   );
                                                   fileTree.style.display = 'block';
                                               }
                    if (treePlaceholder) treePlaceholder.style.display = 'none';
                    console.log("[Webview] Structure data rendered.");
                } else {
                    if (fileTree) fileTree.innerHTML = '';
                    if (fileTree) fileTree.style.display = 'none';
                    if (treePlaceholder) {
                                          treePlaceholder.textContent = 'No workspace folder open or folder is empty.'; // Keep English
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
                                    treePlaceholder.textContent = 'Workspace changed. Click Refresh.'; // Keep English
                     treePlaceholder.style.display = 'block';
                 }
                 if (fileTree) fileTree.style.display = 'none';
                 isTreeLoaded = false;
                 if (copySelectedButton && fileTree) updateCopyButtonState(copySelectedButton, fileTree);
                 hideContextMenu(contextMenu); currentContextMenuTarget = null;
                 break;

            // --- Structure View Handlers ---
            case 'generationProgress':
                console.log("[Webview] Received 'generationProgress' message.");
                if (message.progress && Array.isArray(message.progress)) {
                    console.log(`[Webview] Processing ${message.progress.length} progress items.`);
                    message.progress.forEach(line => {
                        const { type, text } = parseProgressMessage(line);
                        renderProgressItem(type, text, 'generation'); // Specify diffType as 'generation'
                    });
                } else {
                    console.warn("[Webview] 'generationProgress' message received without valid progress array:", message.progress);
                }
                break;
            case 'generationFinished':
                isGenerating = false; // Reset internal flag FIRST
                console.log(`[Webview] Received 'generationFinished' message. Success: ${message.success}. isGenerating set to false.`);
                if (generateButton) {
                    console.log("[Webview] Resetting generate button state...");
                    generateButton.disabled = false;
                                   generateButton.innerHTML = '<i class="codicon codicon-sparkle"></i> Generate'; // Keep English
                    console.log(`[Webview] --> Button state reset complete.`);
                } else {
                    console.warn("[Webview] Generate button not found when trying to reset state.");
                }
                // Don't hide progress container here, keep it visible for results
                // if (progressContainer && !message.success) progressContainer.style.display = 'flex'; // Keep visible on failure? Maybe always keep visible after generation attempt.
                break;
                        // --- UNDO PROGRESS HANDLERS START ---
                        case 'undoProgressStart':
                            console.log("[Webview] Received 'undoProgressStart'. Clearing progress list.");
                            if (progressList) progressList.innerHTML = ''; // Clear previous progress
                            if (progressContainer) progressContainer.style.display = 'flex'; // Show container
                            renderProgressItem('INFO', message.message || 'Starting undo...'); // Show initial message (English)
                            // Optionally disable Undo button during undo
                             if (undoButton) undoButton.disabled = true;
                            break;
                        case 'undoProgress':
                            console.log("[Webview] Received 'undoProgress'.");
                            if (message.progress && Array.isArray(message.progress)) {
                                 console.log(`[Webview] Processing ${message.progress.length} undo progress items.`);
                                 message.progress.forEach(item => {
                                     // Assuming item = { relativePath: string, status: 'Reverted' | 'Deleted' | 'Error' }
                                     // Use a specific type 'REVERTED' for rendering, adapt based on actual status if needed
                                     // Updated message for clarity
                                                                renderProgressItem('REVERTED', `Reverted file: ${item.relativePath}`, 'undo'); // Keep English
                                 });
                            } else {
                                 console.warn("[Webview] 'undoProgress' message received without valid progress array:", message.progress);
                            }
                            break;
                         case 'undoFinished':
                             console.log(`[Webview] Received 'undoFinished'. Success: ${message.success}`);
                             // Display a final success/failure message in the progress list (English)
                                                  renderProgressItem(message.success ? 'SUCCESS' : 'ERROR', message.success ? 'Undo completed successfully.' : 'Undo failed.'); // Keep English
                             // The extension side sends 'updateUndoState' to control the button's enabled state after completion/failure
                             // No need to re-enable the button directly here.
                             break;
                         case 'undoProgressError':
                             console.error(`[Webview] Received 'undoProgressError': ${message.message}`);
                                                  renderProgressItem('ERROR', `Error during undo: ${message.message}`); // Keep English
                             break;
                        // --- UNDO PROGRESS HANDLERS END ---

               case 'updateUndoState':
                console.log(`[Webview] Received 'updateUndoState'. Can Undo: ${message.canUndo}`);
                if (undoButton) {
                	// Always show the button, just toggle disabled state
                	undoButton.disabled = !message.canUndo;
                } else {
                	console.warn("[Webview] Undo button not found when trying to update state.");
                }
                break;
            // --- MODIFICATION START: Handle receiving additional prompt ---
            case 'updateAdditionalPrompt':
                additionalPrompt = message.text || '';
                console.log(`[Webview] Received 'updateAdditionalPrompt'. Additional prompt set to: "${additionalPrompt}"`);
                // Update input field if visible
                if (settingsSectionVisible && additionalPromptInput) {
                    additionalPromptInput.value = additionalPrompt;
                }
                break;
            // --- MODIFICATION END ---

            // --- Common Handlers ---
            case 'showError':
                vscode.postMessage({ command: 'showError', text: message.text });
                if (progressList) {
                                   renderProgressItem('ERROR', `VS Code Error: ${message.text}`); // Keep English
                }
                if (isGenerating) {
                    isGenerating = false;
                    if (generateButton) {
                        generateButton.disabled = false;
                                          generateButton.innerHTML = '<i class="codicon codicon-sparkle"></i> Generate'; // Keep English
                    }
                }
                break;
            case 'showInfo':
                 vscode.postMessage({ command: 'showInfo', text: message.text });
                break;
        }
    });

    // --- Initial Setup ---
    console.log("Webview script loaded.");
    if (fileTreeContainer) {
        console.log("Requesting initial structure for Copy System view.");
        vscode.postMessage({ command: 'getStructure' }); // Request structure on load
        updateCopyButtonState(copySelectedButton, fileTree); // Initial button state
    } else {
        console.log("Structure view loaded.");
        if (progressContainer) progressContainer.style.display = 'none'; // Hide progress initially
        // Request initial undo state for Structure view
        console.log("[Webview] Requesting initial undo state.");
        vscode.postMessage({ command: 'requestInitialUndoState' });
        // --- MODIFICATION START: Request initial additional prompt ---
        console.log("[Webview] Requesting initial additional prompt.");
        vscode.postMessage({ command: 'requestInitialAdditionalPrompt' });
        // --- MODIFICATION END ---
        // --- MODIFICATION START: Ensure settings section is hidden initially ---
        if (promptSettingsSection) {
            promptSettingsSection.style.display = 'none';
            console.log("[Webview] Initializing prompt settings section as hidden.");
        }
        // --- MODIFICATION END ---
    }

    // Add explorer-header copy actions
    const explorerActions = document.querySelector('.explorer-actions');
    if (explorerActions) {
        // Remove ambos se já existirem para garantir ordem
        let copyTextBtn = document.getElementById('copySelectedButton');
        let copyFileBtn = document.getElementById('copyCombinedFileButton');
        if (copyTextBtn) explorerActions.removeChild(copyTextBtn);
        if (copyFileBtn) explorerActions.removeChild(copyFileBtn);
        // (Re)cria os botões na ordem desejada: texto puro, depois arquivo combinado
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
        // Handlers
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

})(); // End of IIFE