// media/webview/checkboxUtils.js

/**
 * Handles changes to a checkbox, updating parent/child states.
 * @param {HTMLInputElement} checkbox The checkbox that was changed.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
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
function updateParentCheckboxes(listItem, fileTree) {
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


/**
 * Updates the visibility/state of the copy button based on selection.
 * @param {HTMLElement} copyButton The copy button element.
 * @param {HTMLElement} fileTree The root UL element of the file tree.
 */
export function updateCopyButtonState(copyButton, fileTree) {
    if (!copyButton || !fileTree) return;
    const selectedFiles = getSelectedFilePaths(fileTree);
    if (selectedFiles.length > 0) {
        copyButton.classList.remove('hidden'); // Show button
        copyButton.disabled = false;
    } else {
        copyButton.classList.add('hidden'); // Hide button
        copyButton.disabled = true;
    }
}