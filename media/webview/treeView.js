// media/webview/treeView.js

/**
 * Sanitizes a string for use as part of an HTML ID.
 * Replaces non-alphanumeric characters (excluding hyphen and underscore) with underscores.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized string.
 */
export function sanitizeForId(text) {
   // Ensure text is a string before replacing
   return String(text).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Renders the file tree structure into the parent DOM element.
 * @param {Array<object>} nodes The array of file tree nodes to render.
 * @param {HTMLElement} parentElement The UL element to render the tree into.
 * @param {Function} handleCheckboxChange Function to call when a checkbox state changes.
 * @param {Function} updateCopyButtonState Function to call to update the copy button state.
 * @param {HTMLElement} fileTree The root UL element of the file tree (needed for checkbox logic).
 * @param {HTMLElement} copySelectedButton The copy button element (needed for checkbox logic).
 * @param {object} vscode The vscode API object for posting messages.
 */
export function renderTree(nodes, parentElement, handleCheckboxChange, updateCopyButtonState, fileTree, copySelectedButton, vscode) {
     parentElement.innerHTML = ''; // Clear previous content
     if (!nodes || nodes.length === 0) {
         // Display placeholder within the UL if empty after load
         parentElement.innerHTML = '<li class="placeholder file-tree-item">Workspace vazio ou nenhum item encontrado.</li>';
         return;
     }

     nodes.forEach(node => {
        const listItem = document.createElement('li');
        listItem.classList.add('file-tree-item', node.type);
        listItem.setAttribute('role', 'treeitem');
        listItem.setAttribute('aria-label', node.name);

        const nodeContent = document.createElement('div');
        nodeContent.classList.add('node-content');
        // Use relativePath for title tooltip (more informative)
        nodeContent.title = node.relativePath;

        // Checkbox for selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.relativePath = node.relativePath; // Store path for actions
        checkbox.classList.add('node-checkbox');
        checkbox.classList.add(node.type === 'file' ? 'file-checkbox' : 'folder-checkbox');
        // Create a safe ID for aria-labelledby
        const safeIdSuffix = sanitizeForId(node.relativePath || node.name);
        const labelId = `label-${safeIdSuffix}`;
        checkbox.setAttribute('aria-labelledby', labelId);
        checkbox.addEventListener('change', (event) => {
            // Call the imported handler, passing necessary context
            handleCheckboxChange(event.target, fileTree); // Handle parent/child checks
            updateCopyButtonState(copySelectedButton, fileTree); // Update button state
        });

        // Expansion chevron (for directories)
        const chevron = document.createElement('span');
        chevron.classList.add('node-chevron');
        if (node.type === 'directory') {
            // Start collapsed
            chevron.innerHTML = '<i class="codicon codicon-chevron-right"></i>';
            listItem.setAttribute('aria-expanded', 'false');
        } else {
            // File: add non-breaking space for alignment if needed, or leave empty
            chevron.innerHTML = '&#x2002;'; // Use an en-space for alignment
        }

        // File/Folder icon
        const icon = document.createElement('span');
        icon.classList.add('node-icon');
        if (node.type === 'directory') {
            icon.innerHTML = '<i class="codicon codicon-folder"></i>'; // Closed folder icon
        } else {
            // Use the default generic file icon
            icon.innerHTML = '<i class="codicon codicon-file"></i>';
        }

        // Label text
        const label = document.createElement('span');
        label.textContent = node.name;
        label.classList.add('node-label');
        label.id = labelId; // Set ID for aria-labelledby

        // --- Assemble Node Content ---
        nodeContent.appendChild(chevron);
        nodeContent.appendChild(icon);
        nodeContent.appendChild(checkbox);
        nodeContent.appendChild(label);

        listItem.appendChild(nodeContent);

        // --- Handle Directory Children & Expansion ---
        if (node.type === 'directory') {
            const childrenContainer = document.createElement('ul');
            childrenContainer.classList.add('children');
             // Add indentation variable for CSS :before pseudo-elements
             const parentIndentLevel = parseInt(parentElement.closest('li.file-tree-item')?.style.getPropertyValue('--indent-level') || '-1');
             listItem.style.setProperty('--indent-level', parentIndentLevel + 1);


            childrenContainer.setAttribute('role', 'group'); // Role for group of tree items
            listItem.appendChild(childrenContainer);

            // Click listener for expanding/collapsing (on the node content, avoids checkbox)
            nodeContent.addEventListener('click', (e) => {
                // Only toggle if the click wasn't directly on the checkbox
                if (e.target !== checkbox) {
                    const isExpanded = listItem.classList.toggle('expanded');
                    listItem.setAttribute('aria-expanded', isExpanded.toString());
                    // Update icons based on state
                    chevron.innerHTML = isExpanded ? '<i class="codicon codicon-chevron-down"></i>' : '<i class="codicon codicon-chevron-right"></i>';
                    icon.innerHTML = isExpanded ? '<i class="codicon codicon-folder-opened"></i>' : '<i class="codicon codicon-folder"></i>';
                }
            });

            // Recursively render children if they exist
            if (node.children && node.children.length > 0) {
                // Pass down the handlers, elements, and vscode API needed by the recursive call
                renderTree(node.children, childrenContainer, handleCheckboxChange, updateCopyButtonState, fileTree, copySelectedButton, vscode);
            }
        } else {
            // File: Clicking the content row (not checkbox) should open the file
            nodeContent.addEventListener('click', (e) => {
                 if (e.target !== checkbox) { // Only act if the click wasn't directly on the checkbox
                    const relativePath = checkbox.dataset.relativePath;
                    if (relativePath && typeof vscode !== 'undefined') {
                         console.log(`[treeView] Requesting to open file: ${relativePath}`);
                         vscode.postMessage({ command: 'openFile', path: relativePath });
                    } else {
                        console.error('[treeView] Could not send openFile message.');
                    }
                 }
            });
        }
        parentElement.appendChild(listItem);
     });
}