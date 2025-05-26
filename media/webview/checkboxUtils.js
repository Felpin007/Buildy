export function handleCheckboxChange(checkbox, fileTree) {
    const isChecked = checkbox.checked;
    const listItem = checkbox.closest('.file-tree-item');
    if (!listItem) return;
    const childCheckboxes = listItem.querySelectorAll('.file-tree-item .node-checkbox');
    childCheckboxes.forEach(child => {
        if (child !== checkbox) { 
            child.checked = isChecked;
            child.indeterminate = false; 
        }
    });
    updateParentCheckboxes(listItem, fileTree);
}
export function updateParentCheckboxes(listItem, fileTree) {
    let current = listItem.parentElement?.closest('.file-tree-item'); 
    while (current) {
        const parentCheckbox = current.querySelector(':scope > .node-content > .node-checkbox');
        const childCheckboxes = current.querySelectorAll(':scope > .children .node-checkbox'); 
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
        current = current.parentElement?.closest('.file-tree-item'); 
    }
}
export function getSelectedPaths(fileTree) {
    const selectedPaths = [];
    const checkboxes = fileTree.querySelectorAll('.node-checkbox:checked');
    checkboxes.forEach(cb => {
        if (cb.dataset.relativePath) {
            selectedPaths.push(cb.dataset.relativePath);
        }
    });
    const indeterminateCheckboxes = fileTree.querySelectorAll('.node-checkbox:indeterminate');
     indeterminateCheckboxes.forEach(cb => {
        if (cb.dataset.relativePath && !selectedPaths.includes(cb.dataset.relativePath)) { 
            selectedPaths.push(cb.dataset.relativePath);
        }
    });
    return selectedPaths;
}
export function getSelectedFilePaths(fileTree) {
    const selectedFilePaths = [];
    const fileCheckboxes = fileTree.querySelectorAll('.file-checkbox:checked'); 
    fileCheckboxes.forEach(cb => {
        if (cb.dataset.relativePath) {
            selectedFilePaths.push(cb.dataset.relativePath);
        }
    });
    return selectedFilePaths;
}
export function updateAllParentFolderStates(fileTree) {
    if (!fileTree) return;
    console.log("[updateAllParentFolderStates] Recalculando estados de todas as pastas...");
    const folderListItems = fileTree.querySelectorAll('.file-tree-item.directory');
    folderListItems.forEach(folderLi => {
        const parentCheckbox = folderLi.querySelector(':scope > .node-content > .node-checkbox');
        const childrenContainer = folderLi.querySelector(':scope > .children');
        if (!parentCheckbox || !childrenContainer) return;
        const childCheckboxes = childrenContainer.querySelectorAll(':scope > .file-tree-item > .node-content > .node-checkbox');
        if (childCheckboxes.length > 0) {
            const totalChildren = childCheckboxes.length;
            const checkedChildren = Array.from(childCheckboxes).filter(cb => cb.checked && !cb.indeterminate).length;
            const indeterminateChildren = Array.from(childCheckboxes).filter(cb => cb.indeterminate).length;
            if (checkedChildren === totalChildren) {
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else if (checkedChildren > 0 || indeterminateChildren > 0) {
                parentCheckbox.checked = false; 
                parentCheckbox.indeterminate = true;
            } else {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            }
        } else {
             parentCheckbox.checked = false;
             parentCheckbox.indeterminate = false;
        }
    });
     console.log("[updateAllParentFolderStates] Recalculação finalizada.");
}
export function updateCopyButtonState(copyButton, fileTree) {
    if (!copyButton || !fileTree) return;
    const selectedFiles = getSelectedFilePaths(fileTree);
    if (selectedFiles.length > 0) {
        copyButton.disabled = false;
    } else {
              copyButton.disabled = true;
          }
      }
