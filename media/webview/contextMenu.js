export function hideContextMenu(contextMenu) {
    if (contextMenu) {
        contextMenu.classList.remove('active');
        contextMenu.innerHTML = ''; 
    }
}
export function showContextMenu(event, targetElement, contextMenu, fileTreeContainer, getSelectedFilePathsFn, vscode) {
    event.preventDefault();
    hideContextMenu(contextMenu); 
    const isClickOnItem = targetElement.classList.contains('node-content');
    const targetLi = isClickOnItem ? targetElement.closest('.file-tree-item') : null;
    const targetPath = targetLi?.querySelector('.node-checkbox')?.dataset.relativePath;
    const targetType = targetLi?.classList.contains('file') ? 'file' : (targetLi?.classList.contains('directory') ? 'directory' : null);
    const menuItems = [];
    const selectedFilePaths = getSelectedFilePathsFn(); 
    let pathsToCopy = [];
    if (isClickOnItem && targetType === 'file' && targetPath) {
        if (selectedFilePaths.includes(targetPath)) {
            pathsToCopy = selectedFilePaths;
        } else {
            pathsToCopy = [targetPath];
        }
    } else if (selectedFilePaths.length > 0) {
         pathsToCopy = selectedFilePaths;
    }
    if (pathsToCopy.length > 0) {
        menuItems.push({
            label: 'Copy plain text',
            icon: 'codicon-clippy',
            action: () => {
                console.log('[ContextMenu] Solicitando cópia para caminhos:', pathsToCopy);
                vscode.postMessage({ command: 'copySelectedFiles', paths: pathsToCopy });
            }
        });
        menuItems.push({
            label: 'Copy file with all contents',
            icon: 'codicon-copy',
            action: () => {
                console.log('[ContextMenu] Solicitando cópia de arquivos para área de transferência para caminhos:', pathsToCopy);
                vscode.postMessage({ command: 'copyFilesToClipboard', paths: pathsToCopy });
            }
        });
    }
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
        const containerRect = fileTreeContainer.getBoundingClientRect();
        const menuWidth = 180; 
        const menuHeight = contextMenu.offsetHeight; 
        let x = event.clientX;
        let y = event.clientY;
        if (x + menuWidth > containerRect.right) {
            x = event.clientX - menuWidth;
        }
        if (y + menuHeight > containerRect.bottom) {
            y = event.clientY - menuHeight;
        }
        x = Math.max(containerRect.left, x);
        y = Math.max(containerRect.top, y);
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.add('active');
        return targetLi; 
    }
    return null; 
}
