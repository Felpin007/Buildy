// media/webview/contextMenu.js

/**
 * Hides the custom context menu.
 * @param {HTMLElement} contextMenu The context menu element.
 */
export function hideContextMenu(contextMenu) {
    if (contextMenu) {
        contextMenu.classList.remove('active');
        contextMenu.innerHTML = ''; // Clear previous items
    }
}

/**
 * Shows the custom context menu at the specified event location.
 * Only includes the "Copy" option.
 * @param {MouseEvent} event The contextmenu event.
 * @param {HTMLElement} targetElement The element that was right-clicked (.node-content or .file-tree-container).
 * @param {HTMLElement} contextMenu The context menu element to populate and show.
 * @param {HTMLElement} fileTreeContainer The container for the file tree.
 * @param {Function} getSelectedFilePathsFn Function that returns an array of selected file paths.
 * @param {object} vscode The vscode API object.
 * @returns {HTMLElement | null} The LI element targeted, or null if menu not shown.
 */
export function showContextMenu(event, targetElement, contextMenu, fileTreeContainer, getSelectedFilePathsFn, vscode) {
    event.preventDefault();
    hideContextMenu(contextMenu); // Hide any existing menu

    const isClickOnItem = targetElement.classList.contains('node-content');
    const targetLi = isClickOnItem ? targetElement.closest('.file-tree-item') : null;
    const targetPath = targetLi?.querySelector('.node-checkbox')?.dataset.relativePath;
    const targetType = targetLi?.classList.contains('file') ? 'file' : (targetLi?.classList.contains('directory') ? 'directory' : null);

    const menuItems = [];

    // --- Copy Action ---
    const selectedFilePaths = getSelectedFilePathsFn(); // Get currently selected file paths
    let pathsToCopy = [];

    if (isClickOnItem && targetType === 'file' && targetPath) {
        // If right-clicked on a file, check if it's part of the current selection
        if (selectedFilePaths.includes(targetPath)) {
            // If part of selection, copy all selected files
            pathsToCopy = selectedFilePaths;
        } else {
            // If not part of selection, copy only the right-clicked file
            pathsToCopy = [targetPath];
        }
    } else if (selectedFilePaths.length > 0) {
         // If right-clicked elsewhere (or on a folder) but files are selected, copy selected files
         pathsToCopy = selectedFilePaths;
    }

    if (pathsToCopy.length > 0) {
        // Option: Copy plain text
        menuItems.push({
            label: 'Copy plain text',
            icon: 'codicon-clippy',
            action: () => {
                console.log('[ContextMenu] Requesting copy for paths:', pathsToCopy);
                vscode.postMessage({ command: 'copySelectedFiles', paths: pathsToCopy });
            }
        });
        // Option: Copy file with all contents
        menuItems.push({
            label: 'Copy file with all contents',
            icon: 'codicon-copy',
            action: () => {
                console.log('[ContextMenu] Requesting copyFilesToClipboard for paths:', pathsToCopy);
                vscode.postMessage({ command: 'copyFilesToClipboard', paths: pathsToCopy });
            }
        });
    }

    // --- Build and Show Menu ---
    if (menuItems.length > 0) {
        const menuList = document.createElement('ul');
        menuItems.forEach(item => {
            const menuItem = document.createElement('li');
            menuItem.innerHTML = `<i class="codicon ${item.icon}"></i> ${item.label}`;
            menuItem.addEventListener('click', () => {
                item.action();
                hideContextMenu(contextMenu);
            });
            menuList.appendChild(menuItem);
        });
        contextMenu.appendChild(menuList);

        // Position and show the menu
        const containerRect = fileTreeContainer.getBoundingClientRect();
        const menuWidth = 180; // Approximate width, adjust as needed
        const menuHeight = contextMenu.offsetHeight; // Calculate height based on items

        let x = event.clientX;
        let y = event.clientY;

        // Adjust if menu goes off-screen
        if (x + menuWidth > containerRect.right) {
            x = event.clientX - menuWidth;
        }
        if (y + menuHeight > containerRect.bottom) {
            y = event.clientY - menuHeight;
        }
        // Ensure menu stays within container bounds (optional, might clip)
        x = Math.max(containerRect.left, x);
        y = Math.max(containerRect.top, y);


        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.add('active');

        return targetLi; // Return the targeted item for state tracking if needed
    }

    return null; // No menu shown
}