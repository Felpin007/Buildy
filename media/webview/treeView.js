export function sanitizeForId(text) {
   return String(text).replace(/[^a-zA-Z0-9_-]/g, '_');
}
export function renderTree(nodes, parentElement, handleCheckboxChange, updateCopyButtonState, fileTree, copySelectedButton, vscode) {
     parentElement.innerHTML = ''; 
     if (!nodes || nodes.length === 0) {
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
        nodeContent.title = node.relativePath;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.relativePath = node.relativePath; 
        checkbox.classList.add('node-checkbox');
        checkbox.classList.add(node.type === 'file' ? 'file-checkbox' : 'folder-checkbox');
        const safeIdSuffix = sanitizeForId(node.relativePath || node.name);
        const labelId = `label-${safeIdSuffix}`;
        checkbox.setAttribute('aria-labelledby', labelId);
                          checkbox.addEventListener('change', (event) => {
                              handleCheckboxChange(event.target, fileTree);
                              updateCopyButtonState(copySelectedButton, fileTree);
                          });
        const chevron = document.createElement('span');
        chevron.classList.add('node-chevron');
        if (node.type === 'directory') {
            chevron.innerHTML = '<i class="codicon codicon-chevron-right"></i>';
            listItem.setAttribute('aria-expanded', 'false');
        } else {
            chevron.innerHTML = '&#x2002;'; 
        }
        const icon = document.createElement('span');
        icon.classList.add('node-icon');
        if (node.type === 'directory') {
            icon.innerHTML = '<i class="codicon codicon-folder"></i>'; 
        } else {
            icon.innerHTML = '<i class="codicon codicon-file"></i>';
        }
        const label = document.createElement('span');
        label.textContent = node.name;
        label.classList.add('node-label');
        label.id = labelId; 
        nodeContent.appendChild(chevron);
        nodeContent.appendChild(icon);
        nodeContent.appendChild(checkbox);
        nodeContent.appendChild(label);
        listItem.appendChild(nodeContent);
        if (node.type === 'directory') {
            const childrenContainer = document.createElement('ul');
            childrenContainer.classList.add('children');
             const parentIndentLevel = parseInt(parentElement.closest('li.file-tree-item')?.style.getPropertyValue('--indent-level') || '-1');
             listItem.style.setProperty('--indent-level', parentIndentLevel + 1);
            childrenContainer.setAttribute('role', 'group'); 
            listItem.appendChild(childrenContainer);
            nodeContent.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    const isExpanded = listItem.classList.toggle('expanded');
                    listItem.setAttribute('aria-expanded', isExpanded.toString());
                    chevron.innerHTML = isExpanded ? '<i class="codicon codicon-chevron-down"></i>' : '<i class="codicon codicon-chevron-right"></i>';
                    icon.innerHTML = isExpanded ? '<i class="codicon codicon-folder-opened"></i>' : '<i class="codicon codicon-folder"></i>';
                }
            });
            if (node.children && node.children.length > 0) {
                renderTree(node.children, childrenContainer, handleCheckboxChange, updateCopyButtonState, fileTree, copySelectedButton, vscode);
            }
        } else {
            nodeContent.addEventListener('click', (e) => {
                 if (e.target !== checkbox) { 
                    const relativePath = checkbox.dataset.relativePath;
                    if (relativePath && typeof vscode !== 'undefined') {
                         console.log(`[treeView] Solicitando abertura do arquivo: ${relativePath}`);
                         vscode.postMessage({ command: 'openFile', path: relativePath });
                    } else {
                        console.error('[treeView] Não foi possível enviar mensagem openFile.');
                    }
                 }
            });
        }
        parentElement.appendChild(listItem);
     });
}
