// media/webview/checkboxUtils.js

/**
 * Handles changes to a checkbox, updating parent/child states.
 * @param {HTMLInputElement} checkbox The checkbox that was changed.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
// Ensure this is exported for use in main.js
export function handleCheckboxChange(checkbox, fileTree) {
    const isChecked = checkbox.checked;
    const listItem = checkbox.closest('.file-tree-item');
    if (!listItem) return;

    // Update all child checkboxes
    const childCheckboxes = listItem.querySelectorAll('.file-tree-item .node-checkbox');
    childCheckboxes.forEach(child => {
        if (child !== checkbox) { // Avoid infinite loop if it's the same element somehow
            child.checked = isChecked;
            child.indeterminate = false; // Children are either fully checked or unchecked
        }
    });

    // Update parent checkboxes
    updateParentCheckboxes(listItem, fileTree);
}

/**
 * Updates the state (checked, indeterminate) of parent checkboxes based on children.
 * @param {HTMLElement} listItem The list item whose parent states need updating.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
// --- MODIFICATION START: Export function ---
export function updateParentCheckboxes(listItem, fileTree) {
// --- MODIFICATION END ---
    let current = listItem.parentElement?.closest('.file-tree-item'); // Find parent LI
    while (current) {
        const parentCheckbox = current.querySelector(':scope > .node-content > .node-checkbox');
        const childCheckboxes = current.querySelectorAll(':scope > .children .node-checkbox'); // Direct children in UL

        if (parentCheckbox && childCheckboxes.length > 0) {
            const allChecked = Array.from(childCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(childCheckboxes).some(cb => cb.checked || cb.indeterminate);

            if (allChecked) {
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else if (someChecked) {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = true;
            } else {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            }
        }
        current = current.parentElement?.closest('.file-tree-item'); // Move up to the next parent
    }
}

/**
 * Gets the relative paths of all selected items (files and folders).
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 * @returns {string[]} An array of relative paths.
 */
export function getSelectedPaths(fileTree) {
    const selectedPaths = [];
    const checkboxes = fileTree.querySelectorAll('.node-checkbox:checked');
    checkboxes.forEach(cb => {
        if (cb.dataset.relativePath) {
            selectedPaths.push(cb.dataset.relativePath);
        }
    });
    // Also include indeterminate folders, as they contain selected children
    const indeterminateCheckboxes = fileTree.querySelectorAll('.node-checkbox:indeterminate');
     indeterminateCheckboxes.forEach(cb => {
        if (cb.dataset.relativePath && !selectedPaths.includes(cb.dataset.relativePath)) { // Avoid duplicates
            selectedPaths.push(cb.dataset.relativePath);
        }
    });
    return selectedPaths;
}

/**
 * Gets the relative paths of only selected *files*.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 * @returns {string[]} An array of relative file paths.
 */
export function getSelectedFilePaths(fileTree) {
    const selectedFilePaths = [];
    const fileCheckboxes = fileTree.querySelectorAll('.file-checkbox:checked'); // Only target file checkboxes
    fileCheckboxes.forEach(cb => {
        if (cb.dataset.relativePath) {
            selectedFilePaths.push(cb.dataset.relativePath);
        }
    });
    return selectedFilePaths;
}

// This function seems duplicated below, removing this instance.

/**
 * Recalculates the state (checked, indeterminate) of ALL folder checkboxes
 * in the tree based on the current state of their direct children.
 * This function ONLY sets the state of the parent folder checkbox itself.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
export function updateAllParentFolderStates(fileTree) {
    if (!fileTree) return;
    console.log("[updateAllParentFolderStates] Recalculating all folder states...");

    const folderListItems = fileTree.querySelectorAll('.file-tree-item.directory');

    // It's generally safer to update from bottom-up, but querySelectorAll gives document order.
    // Let's iterate multiple times to ensure propagation if needed, or rely on document order.
    // A simple single pass might be sufficient if state setting doesn't trigger immediate reflows affecting later items.
    folderListItems.forEach(folderLi => {
        const parentCheckbox = folderLi.querySelector(':scope > .node-content > .node-checkbox');
        const childrenContainer = folderLi.querySelector(':scope > .children');
        if (!parentCheckbox || !childrenContainer) return;

        // Select only DIRECT children checkboxes
        const childCheckboxes = childrenContainer.querySelectorAll(':scope > .file-tree-item > .node-content > .node-checkbox');

        if (childCheckboxes.length > 0) {
            const totalChildren = childCheckboxes.length;
            const checkedChildren = Array.from(childCheckboxes).filter(cb => cb.checked && !cb.indeterminate).length;
            const indeterminateChildren = Array.from(childCheckboxes).filter(cb => cb.indeterminate).length;

            if (checkedChildren === totalChildren) {
                // All children fully checked
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else if (checkedChildren > 0 || indeterminateChildren > 0) {
                // Some children checked or indeterminate
                parentCheckbox.checked = false; // Not all are checked
                parentCheckbox.indeterminate = true;
            } else {
                // No children checked or indeterminate
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            }
        } else {
            // Folder has no direct children checkboxes (might be empty or only contain subfolders)
            // Base its state on whether it's explicitly checked (though it shouldn't be if it has no files)
            // For safety, ensure it's unchecked if empty.
             parentCheckbox.checked = false;
             parentCheckbox.indeterminate = false;
        }
    });
     console.log("[updateAllParentFolderStates] Finished recalculating.");
}


/**
 * Updates the visibility/state of the copy button based on selection.
 * @param {HTMLElement} copyButton The copy button element.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
export function updateCopyButtonState(copyButton, fileTree) {
    if (!copyButton || !fileTree) return;
    const selectedFiles = getSelectedFilePaths(fileTree);
    if (selectedFiles.length > 0) {
        // copyButton.classList.remove('hidden'); // REMOVED - Visibility handled by CSS now
        copyButton.disabled = false;
    } else {
              // copyButton.classList.add('hidden'); // REMOVED - Don't hide, just disable
              copyButton.disabled = true;
          }
      }
      